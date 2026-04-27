"""BioCLIP-backed species predictor."""
from __future__ import annotations

import csv
import io
import json
import logging
import os
import queue
import threading
from pathlib import Path
from typing import Any, Generator

import numpy as np
import torch
import open_clip
from PIL import Image
from huggingface_hub import HfApi, snapshot_download
from huggingface_hub.utils import tqdm as hf_tqdm

logger = logging.getLogger(__name__)

MODEL_CONFIGS: dict[str, dict[str, Any]] = {
    "bioclip-v1": {
        "hf_repo": "imageomics/bioclip",
        "arch": "ViT-B-16",
        "weight_file": "open_clip_pytorch_model.bin",
        "name": "Fast",
        "size_mb": 600,
    },
    "bioclip-v2": {
        "hf_repo": "imageomics/bioclip-2",
        "arch": "ViT-B-16",
        "weight_file": "open_clip_pytorch_model.bin",
        "name": "Accurate",
        "size_mb": 1700,
    },
}

_SPECIES_CSV = Path(__file__).parent / "data" / "species.csv"


class Predictor:
    def __init__(self, models_dir: str | None = None) -> None:
        self.active_model = "bioclip-v1"
        self.models_dir = models_dir or os.environ.get(
            "WILDLIFE_MODEL_DIR",
            os.path.join(os.path.expanduser("~"), ".wildlife-id", "models"),
        )
        self._model: Any = None
        self._preprocess: Any = None
        self._tokenizer: Any = None
        self._device: str = "cpu"
        self._embeddings: torch.Tensor | None = None
        self._species_meta: list[dict[str, Any]] = []
        self._loaded_model_id: str | None = None
        self._load_lock = threading.Lock()
        logger.info("Predictor initialised (models_dir=%s)", self.models_dir)

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
        # Unload current model so next predict() reloads the right one
        with self._load_lock:
            self._model = None
            self._preprocess = None
            self._tokenizer = None
            self._embeddings = None
            self._species_meta = []
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

        # Load or generate species embeddings.
        # The .npz is the authoritative source — if it exists, load it as-is.
        # Only fall back to generating from the bundled CSV when no .npz exists yet.
        emb_path = self._model_path(model_id) / "species_embeddings.npz"

        if emb_path.exists():
            logger.info("Loading embeddings from %s", emb_path)
            data = np.load(emb_path, allow_pickle=True)
            self._embeddings = torch.from_numpy(data["embeddings"]).float().to(device)
            self._species_meta = [json.loads(s) for s in data["species"]]
            logger.info("Loaded %d species embeddings", len(self._species_meta))
            return

        species = _load_species_csv()
        self._embeddings = _generate_embeddings(model, self._tokenizer, device, species, emb_path)
        self._species_meta = species

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

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_tensor = self._preprocess(img).unsqueeze(0).to(self._device)

        with torch.no_grad():
            img_features = self._model.encode_image(img_tensor)
            img_features = img_features / img_features.norm(dim=-1, keepdim=True)

        assert self._embeddings is not None
        logit_scale = self._model.logit_scale.exp()
        logits = (logit_scale * img_features @ self._embeddings.T).squeeze(0)
        probs = torch.softmax(logits, dim=-1)

        k = min(top_k, len(self._species_meta))
        scores, indices = probs.topk(k)

        predictions = []
        for score, idx in zip(scores.tolist(), indices.tolist()):
            sp = self._species_meta[idx]
            predictions.append({
                "scientific_name": sp["scientific_name"],
                "common_name": sp.get("common_name") or None,
                "taxonomy": sp["taxonomy"],
                "iucn_status": sp.get("iucn_status") or None,
                "confidence": round(float(score), 6),
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
        local_dir = str(self._model_path(model_id))
        repo_id = cfg["hf_repo"]

        api = HfApi()
        total_bytes = 0
        for item in api.list_repo_tree(repo_id, repo_type="model", recursive=True):
            if hasattr(item, "size") and item.size is not None:
                total_bytes += item.size
        if total_bytes == 0:
            total_bytes = cfg["size_mb"] * 1_000_000

        yield {
            "model_id": model_id,
            "bytes_downloaded": 0,
            "bytes_total": total_bytes,
            "status": "downloading",
        }

        progress_q: queue.Queue[dict[str, Any] | None] = queue.Queue()
        cumulative = [0]
        last_reported = [0]
        lock = threading.Lock()

        class _OverallProgress(hf_tqdm):
            def update(self, n: int = 1) -> bool:
                result = super().update(n)
                if n > 0 and total_bytes > 0:
                    with lock:
                        cumulative[0] += n
                        if cumulative[0] - last_reported[0] > max(total_bytes // 100, 1):
                            last_reported[0] = cumulative[0]
                            progress_q.put({
                                "model_id": model_id,
                                "bytes_downloaded": cumulative[0],
                                "bytes_total": total_bytes,
                                "status": "downloading",
                            })
                return result

        def _do_download() -> None:
            try:
                snapshot_download(repo_id=repo_id, local_dir=local_dir, tqdm_class=_OverallProgress)
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


# ── Helpers ────────────────────────────────────────────────────────────────────


def _load_species_csv() -> list[dict[str, Any]]:
    if not _SPECIES_CSV.exists():
        raise FileNotFoundError(f"Species vocabulary not found: {_SPECIES_CSV}")

    species = []
    with _SPECIES_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sci = row["scientific_name"].strip()
            genus = sci.split()[0] if sci else ""
            taxonomy = [
                row.get("kingdom", "").strip(),
                row.get("phylum", "").strip(),
                row.get("class", "").strip(),
                row.get("order", "").strip(),
                row.get("family", "").strip(),
                genus,
                sci,
            ]
            taxonomy = [t for t in taxonomy if t]
            iucn = row.get("iucn_status", "").strip() or None
            species.append({
                "scientific_name": sci,
                "common_name": row.get("common_name", "").strip() or None,
                "taxonomy": taxonomy,
                "iucn_status": iucn,
                "kingdom": row.get("kingdom", "").strip(),
                "phylum": row.get("phylum", "").strip(),
                "class_": row.get("class", "").strip(),
                "order": row.get("order", "").strip(),
                "family": row.get("family", "").strip(),
                "genus": genus,
            })
    logger.info("Loaded %d species from CSV", len(species))
    return species


def _make_prompt(sp: dict[str, Any]) -> str:
    """BioCLIP performs best with full taxonomic lineage as the text prompt."""
    parts = [
        sp["kingdom"], sp["phylum"], sp["class_"],
        sp["order"], sp["family"], sp["genus"],
        sp["scientific_name"],
    ]
    return "a photo of " + " ".join(p for p in parts if p)


def _generate_embeddings(
    model: Any,
    tokenizer: Any,
    device: str,
    species: list[dict[str, Any]],
    save_path: Path,
) -> torch.Tensor:
    logger.info("Generating text embeddings for %d species (first run — cached after this)...", len(species))
    prompts = [_make_prompt(sp) for sp in species]

    batch_size = 64
    all_embeddings: list[torch.Tensor] = []

    for i in range(0, len(prompts), batch_size):
        batch = prompts[i : i + batch_size]
        tokens = tokenizer(batch).to(device)
        with torch.no_grad():
            emb = model.encode_text(tokens)
            emb = emb / emb.norm(dim=-1, keepdim=True)
        all_embeddings.append(emb.cpu().float())
        logger.info("  %d / %d", min(i + batch_size, len(prompts)), len(prompts))

    embeddings = torch.cat(all_embeddings, dim=0)

    save_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        save_path,
        embeddings=embeddings.numpy(),
        species=np.array([json.dumps(sp, ensure_ascii=False) for sp in species], dtype=object),
    )
    logger.info("Saved %d species embeddings → %s", len(species), save_path)
    return embeddings.to(device)
