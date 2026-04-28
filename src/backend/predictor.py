"""BioCLIP-backed species predictor."""
from __future__ import annotations

import io
import logging
import os
import queue
import threading
from pathlib import Path
from typing import Any, Generator

import torch
import open_clip
from PIL import Image
from huggingface_hub import HfApi, snapshot_download
from huggingface_hub.utils import tqdm as hf_tqdm

from vocab import MetaStore, load_embeddings
from display import compute_display_label

logger = logging.getLogger(__name__)

# Hosted vocab layout (HF dataset PLACEHOLDER/wildlife-id-vocab):
#   bioclip-v1/species_embeddings.npz    (per-model, varies)
#   bioclip-v2/species_embeddings.npz    (per-model, varies)
#   species_meta.sqlite                  (shared, downloaded once)
VOCAB_HF_REPO = "PLACEHOLDER/wildlife-id-vocab"
META_FILENAME = "species_meta.sqlite"

MODEL_CONFIGS: dict[str, dict[str, Any]] = {
    "bioclip-v1": {
        "hf_repo": "imageomics/bioclip",
        "arch": "ViT-B-16",
        "weight_file": "open_clip_pytorch_model.bin",
        "name": "Fast",
        # ~600 MB weights + ~430 MB fp16 embeddings.
        "size_mb": 1050,
        "embeddings_filename": "bioclip-v1/species_embeddings.npz",
        "embeddings_size_bytes": 430_000_000,
    },
    "bioclip-v2": {
        "hf_repo": "imageomics/bioclip-2",
        "arch": "ViT-B-16",
        "weight_file": "open_clip_pytorch_model.bin",
        "name": "Accurate",
        # ~1700 MB weights + ~430 MB fp16 embeddings.
        "size_mb": 2150,
        "embeddings_filename": "bioclip-v2/species_embeddings.npz",
        "embeddings_size_bytes": 430_000_000,
    },
}

# Best-effort estimate; used only for download progress when the metadata file
# isn't already on disk. Updated dynamically via HF API when possible.
META_SIZE_BYTES_ESTIMATE = 30_000_000


class Predictor:
    def __init__(
        self,
        models_dir: str | None = None,
        vocab_dir: str | None = None,
    ) -> None:
        self.active_model = "bioclip-v1"
        self.models_dir = models_dir or os.environ.get(
            "WILDLIFE_MODEL_DIR",
            os.path.join(os.path.expanduser("~"), ".wildlife-id", "models"),
        )
        self.vocab_dir = vocab_dir or os.environ.get(
            "WILDLIFE_VOCAB_DIR",
            str(Path(self.models_dir).parent / "vocab"),
        )
        self.meta_path = Path(self.vocab_dir) / META_FILENAME

        self._model: Any = None
        self._preprocess: Any = None
        self._tokenizer: Any = None
        self._device: str = "cpu"
        self._embeddings: torch.Tensor | None = None
        self._scientific_names: list[str] = []
        self._meta_store: MetaStore | None = None
        self._loaded_model_id: str | None = None
        self._load_lock = threading.Lock()
        logger.info(
            "Predictor initialised (models_dir=%s, vocab_dir=%s)",
            self.models_dir, self.vocab_dir,
        )

    def _model_path(self, model_id: str) -> Path:
        return Path(self.models_dir) / model_id

    def is_downloaded(self, model_id: str) -> bool:
        path = self._model_path(model_id)
        if not path.exists():
            return False
        files = list(path.rglob("*.bin")) + list(path.rglob("*.safetensors"))
        files = [f for f in files if ".cache" not in f.parts]
        return len(files) > 0

    def list_models(self) -> dict[str, Any]:
        available = []
        for mid, cfg in MODEL_CONFIGS.items():
            available.append({
                "id": mid,
                "name": cfg["name"],
                "size_mb": cfg["size_mb"],
                "downloaded": self.is_downloaded(mid),
            })
        return {"active": self.active_model, "available": available}

    def select_model(self, model_id: str) -> None:
        if model_id == self.active_model:
            return
        self.active_model = model_id
        # Unload current model so next predict() reloads the right one.
        # The meta store is shared between models, so leave it alone.
        with self._load_lock:
            self._model = None
            self._preprocess = None
            self._tokenizer = None
            self._embeddings = None
            self._scientific_names = []
            self._loaded_model_id = None
        logger.info("Active model → %s", model_id)

    # ── Model loading ──────────────────────────────────────────────────────────

    def _detect_device(self) -> str:
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _find_weight_file(self, model_id: str) -> Path:
        model_path = self._model_path(model_id)
        preferred = model_path / MODEL_CONFIGS[model_id]["weight_file"]
        if preferred.exists():
            return preferred
        for ext in ("*.bin", "*.safetensors"):
            for f in model_path.rglob(ext):
                if ".cache" not in f.parts:
                    return f
        raise FileNotFoundError(
            f"No weight file found in {model_path}. "
            "Please re-download the model from Settings."
        )

    def _ensure_meta_store(self) -> MetaStore:
        if self._meta_store is None:
            self._meta_store = MetaStore(self.meta_path)
            logger.info("Opened metadata store at %s", self.meta_path)
        return self._meta_store

    def _load_model(self, model_id: str) -> None:
        cfg = MODEL_CONFIGS[model_id]
        device = self._detect_device()

        # Try local file first (production / already-downloaded path)
        try:
            weight_file = self._find_weight_file(model_id)
            logger.info("Loading %s from local file: %s", model_id, weight_file)
            model, _, preprocess = open_clip.create_model_and_transforms(
                cfg["arch"],
                pretrained=str(weight_file),
            )
        except (FileNotFoundError, RuntimeError) as exc:
            # Dev fallback: download from HF hub into HF cache
            logger.warning("Local load failed (%s) — falling back to HF hub", exc)
            hf_tag = f"hf-hub:{cfg['hf_repo']}"
            logger.info("Loading %s from %s", model_id, hf_tag)
            model, _, preprocess = open_clip.create_model_and_transforms(hf_tag)

        model.eval()
        model.to(device)

        self._model = model
        self._preprocess = preprocess
        self._tokenizer = open_clip.get_tokenizer(cfg["arch"])
        self._device = device
        self._loaded_model_id = model_id

        emb_path = self._model_path(model_id) / "species_embeddings.npz"
        if not emb_path.exists():
            raise FileNotFoundError(
                f"Embeddings not found at {emb_path}. "
                "Run scripts/build_embeddings.py or download the vocab from Settings."
            )

        logger.info("Loading embeddings from %s", emb_path)
        embeddings_np, scientific_names = load_embeddings(emb_path)
        # On-disk dtype is fp16 (Phase B); cast to fp32 for full-precision matmul.
        self._embeddings = torch.from_numpy(embeddings_np).float().to(device)
        self._scientific_names = scientific_names
        logger.info(
            "Loaded %d species embeddings (on-disk dtype=%s, compute dtype=%s)",
            len(scientific_names), embeddings_np.dtype, self._embeddings.dtype,
        )

        self._ensure_meta_store()

    def _ensure_loaded(self) -> None:
        if self._loaded_model_id == self.active_model and self._model is not None:
            return
        if not self.is_downloaded(self.active_model):
            raise RuntimeError(
                f"Model '{self.active_model}' is not downloaded. "
                "Please download it from Settings."
            )
        with self._load_lock:
            if self._loaded_model_id == self.active_model and self._model is not None:
                return
            self._load_model(self.active_model)

    # ── Inference ──────────────────────────────────────────────────────────────

    def predict(self, image_bytes: bytes, top_k: int = 3) -> dict[str, Any]:
        self._ensure_loaded()
        assert self._meta_store is not None
        assert self._embeddings is not None

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_tensor = self._preprocess(img).unsqueeze(0).to(self._device)

        with torch.no_grad():
            img_features = self._model.encode_image(img_tensor)
            img_features = img_features / img_features.norm(dim=-1, keepdim=True)

        logit_scale = self._model.logit_scale.exp()
        logits = (logit_scale * img_features @ self._embeddings.T).squeeze(0)
        probs = torch.softmax(logits, dim=-1)

        k = min(top_k, len(self._scientific_names))
        scores, indices = probs.topk(k)

        top_names = [self._scientific_names[i] for i in indices.tolist()]
        metas = self._meta_store.lookup_many(top_names)

        predictions = []
        for score, meta in zip(scores.tolist(), metas):
            sci = meta.get("scientific_name", "?")
            taxonomy = [
                meta.get("kingdom") or "",
                meta.get("phylum") or "",
                meta.get("class") or "",
                meta.get("order") or "",
                meta.get("family") or "",
                meta.get("genus") or "",
                sci,
            ]
            taxonomy = [t for t in taxonomy if t]
            predictions.append({
                "scientific_name": sci,
                "common_name": meta.get("common_name") or None,
                "display_label": compute_display_label(meta),
                "taxonomy": taxonomy,
                "iucn_status": meta.get("iucn_status") or None,
                "confidence": round(float(score), 6),
                "animal_class": meta.get("class") or None,
            })

        logger.info(
            "predict() → top: %s (%.1f%%)",
            predictions[0]["scientific_name"] if predictions else "?",
            (predictions[0]["confidence"] * 100) if predictions else 0,
        )
        return {"model_used": self.active_model, "predictions": predictions}

    # ── Model download ─────────────────────────────────────────────────────────

    def download_model(self, model_id: str) -> Generator[dict[str, Any], None, None]:
        if model_id not in MODEL_CONFIGS:
            raise ValueError(f"Unknown model: {model_id}")

        cfg = MODEL_CONFIGS[model_id]
        model_path = self._model_path(model_id)
        local_dir = str(model_path)
        repo_id = cfg["hf_repo"]

        embeddings_filename = cfg["embeddings_filename"]
        embeddings_size = cfg["embeddings_size_bytes"]
        embeddings_dest = model_path / "species_embeddings.npz"

        meta_needed = not self.meta_path.exists()
        meta_size = META_SIZE_BYTES_ESTIMATE if meta_needed else 0

        api = HfApi()
        model_bytes = 0
        for item in api.list_repo_tree(repo_id, repo_type="model", recursive=True):
            if hasattr(item, "size") and item.size is not None:
                model_bytes += item.size
        if model_bytes == 0:
            model_bytes = cfg["size_mb"] * 1_000_000

        total_bytes = model_bytes + embeddings_size + meta_size

        yield {
            "model_id": model_id,
            "bytes_downloaded": 0,
            "bytes_total": total_bytes,
            "status": "downloading",
        }

        progress_q: queue.Queue[dict[str, Any] | None] = queue.Queue()
        last_reported = [0]
        lock = threading.Lock()

        def _emit(downloaded: int) -> None:
            with lock:
                if downloaded - last_reported[0] > max(total_bytes // 200, 1):
                    last_reported[0] = downloaded
                    progress_q.put({
                        "model_id": model_id,
                        "bytes_downloaded": downloaded,
                        "bytes_total": total_bytes,
                        "status": "downloading",
                    })

        model_cumulative = [0]

        class _OverallProgress(hf_tqdm):
            def update(self, n: int = 1) -> bool:
                result = super().update(n)
                if n > 0 and total_bytes > 0:
                    with lock:
                        model_cumulative[0] += n
                    _emit(model_cumulative[0])
                return result

        def _do_download() -> None:
            try:
                snapshot_download(repo_id=repo_id, local_dir=local_dir, tqdm_class=_OverallProgress)

                # Per-model embeddings
                self._download_vocab_file(
                    filename=embeddings_filename,
                    dest=embeddings_dest,
                    base_offset=model_bytes,
                    emit=_emit,
                )

                # Shared metadata sqlite (skip if already on disk from previous model)
                if meta_needed:
                    self._download_vocab_file(
                        filename=META_FILENAME,
                        dest=self.meta_path,
                        base_offset=model_bytes + embeddings_size,
                        emit=_emit,
                    )

                progress_q.put(None)
            except Exception as e:
                logger.error("Download failed: %s", e)
                progress_q.put({"model_id": model_id, "bytes_downloaded": 0, "bytes_total": 0, "status": "error", "error": str(e)})
                progress_q.put(None)

        thread = threading.Thread(target=_do_download, daemon=True)
        thread.start()

        while True:
            event = progress_q.get(timeout=300)
            if event is None:
                break
            if event.get("status") == "error":
                yield event
                return
            yield event

        thread.join()
        yield {"model_id": model_id, "bytes_downloaded": total_bytes, "bytes_total": total_bytes, "status": "verifying"}
        yield {"model_id": model_id, "bytes_downloaded": total_bytes, "bytes_total": total_bytes, "status": "ready"}

    def _download_vocab_file(
        self,
        filename: str,
        dest: Path,
        base_offset: int,
        emit: Any,
    ) -> None:
        """Stream a file from the vocab HF dataset to `dest` with progress.

        `base_offset` is the cumulative byte count of preceding download stages,
        so the emit callback can report a single monotonic total.
        """
        if dest.exists():
            return
        from huggingface_hub import hf_hub_url
        import requests as _req

        url = hf_hub_url(repo_id=VOCAB_HF_REPO, filename=filename, repo_type="dataset")
        logger.info("Downloading %s → %s", url, dest)
        received = 0
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        with _req.get(url, stream=True, timeout=600) as r:
            r.raise_for_status()
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    if chunk:
                        f.write(chunk)
                        received += len(chunk)
                        emit(base_offset + received)
        tmp.rename(dest)
        logger.info("Saved %s (%.1f MB)", dest, dest.stat().st_size / 1e6)
