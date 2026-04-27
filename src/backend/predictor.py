"""BioCLIP-backed species predictor.

Phase 0/stub: returns hardcoded results so the full plumbing can be tested
before the ML dependencies are installed. Replace the body of `predict()` in
Phase 1 with the real open_clip inference.
"""
from __future__ import annotations

import json
import logging
import os
import queue
import threading
from pathlib import Path
from typing import Any, Generator

from huggingface_hub import HfApi, snapshot_download
from huggingface_hub.utils import tqdm as hf_tqdm

logger = logging.getLogger(__name__)

MODEL_CONFIGS: dict[str, dict[str, Any]] = {
    "bioclip-v1": {
        "hf_repo": "imageomics/bioclip",
        "name": "Fast",
        "size_mb": 600,
    },
    "bioclip-v2": {
        "hf_repo": "imageomics/bioclip-2",
        "name": "Accurate",
        "size_mb": 1700,
    },
}


class _ProgressTqdm(hf_tqdm):
    """Custom tqdm that yields SSE-style progress dicts."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("bar_format", "")
        super().__init__(*args, **kwargs)
        self._progress_callback: Any | None = None

    def update(self, n: int = 1) -> bool:
        result = super().update(n)
        if self._progress_callback and self.total:
            self._progress_callback(self.n, self.total)
        return result


class Predictor:
    def __init__(self, models_dir: str | None = None) -> None:
        self.active_model = "bioclip-v1"
        self.models_dir = models_dir or os.environ.get(
            "WILDLIFE_MODEL_DIR",
            os.path.join(os.path.expanduser("~"), ".wildlife-id", "models"),
        )
        logger.info("Predictor initialised (models_dir=%s)", self.models_dir)

    def _model_path(self, model_id: str) -> Path:
        return Path(self.models_dir) / model_id

    def is_downloaded(self, model_id: str) -> bool:
        path = self._model_path(model_id)
        if not path.exists():
            return False
        # Check that model weight files exist
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
        self.active_model = model_id
        logger.info("Active model → %s", model_id)

    def download_model(self, model_id: str) -> Generator[dict[str, Any], None, None]:
        """Download a model from HuggingFace, yielding progress events."""
        if model_id not in MODEL_CONFIGS:
            raise ValueError(f"Unknown model: {model_id}")

        cfg = MODEL_CONFIGS[model_id]
        local_dir = str(self._model_path(model_id))
        repo_id = cfg["hf_repo"]

        # Query actual total size from the repo
        api = HfApi()
        total_bytes = 0
        for item in api.list_repo_tree(repo_id, repo_type="model", recursive=True):
            if hasattr(item, "size") and item.size is not None:
                total_bytes += item.size

        if total_bytes == 0:
            total_bytes = cfg["size_mb"] * 1_000_000  # fallback

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
            """Tracks cumulative bytes across all file downloads."""
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
                snapshot_download(
                    repo_id=repo_id,
                    local_dir=local_dir,
                    tqdm_class=_OverallProgress,
                )
                progress_q.put(None)  # signal completion
            except Exception as e:
                logger.error("Download failed: %s", e)
                progress_q.put({
                    "model_id": model_id,
                    "bytes_downloaded": 0,
                    "bytes_total": 0,
                    "status": "error",
                    "error": str(e),
                })
                progress_q.put(None)

        thread = threading.Thread(target=_do_download, daemon=True)
        thread.start()

        while True:
            event = progress_q.get(timeout=300)  # 5 min timeout
            if event is None:
                break
            if event.get("status") == "error":
                yield event
                return
            yield event

        thread.join()

        yield {
            "model_id": model_id,
            "bytes_downloaded": total_bytes,
            "bytes_total": total_bytes,
            "status": "verifying",
        }

        yield {
            "model_id": model_id,
            "bytes_downloaded": total_bytes,
            "bytes_total": total_bytes,
            "status": "ready",
        }

    def predict(self, image_bytes: bytes, top_k: int = 3) -> dict[str, Any]:
        """Stub: returns hardcoded fox predictions for any input."""
        logger.info("predict() called — stub, %d bytes", len(image_bytes))
        results = [
            {
                "scientific_name": "Vulpes vulpes",
                "common_name": "Red Fox",
                "taxonomy": ["Animalia", "Chordata", "Mammalia", "Carnivora", "Canidae", "Vulpes", "Vulpes vulpes"],
                "iucn_status": "Least Concern",
                "confidence": 0.87,
            },
            {
                "scientific_name": "Vulpes lagopus",
                "common_name": "Arctic Fox",
                "taxonomy": ["Animalia", "Chordata", "Mammalia", "Carnivora", "Canidae", "Vulpes", "Vulpes lagopus"],
                "iucn_status": "Least Concern",
                "confidence": 0.06,
            },
            {
                "scientific_name": "Canis latrans",
                "common_name": "Coyote",
                "taxonomy": ["Animalia", "Chordata", "Mammalia", "Carnivora", "Canidae", "Canis", "Canis latrans"],
                "iucn_status": "Least Concern",
                "confidence": 0.03,
            },
        ]
        return {
            "model_used": self.active_model,
            "predictions": results[:top_k],
        }
