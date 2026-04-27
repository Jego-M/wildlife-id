"""BioCLIP-backed species predictor.

Phase 0/stub: returns hardcoded results so the full plumbing can be tested
before the ML dependencies are installed. Replace the body of `predict()` in
Phase 1 with the real open_clip inference.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class Predictor:
    def __init__(self) -> None:
        self.active_model = "bioclip-v1"
        logger.info("Predictor initialised (stub — Phase 0)")

    def list_models(self) -> dict[str, Any]:
        return {
            "active": self.active_model,
            "available": [
                {
                    "id": "bioclip-v1",
                    "name": "Fast",
                    "size_mb": 600,
                    "downloaded": False,
                },
                {
                    "id": "bioclip-v2",
                    "name": "Accurate",
                    "size_mb": 1700,
                    "downloaded": False,
                },
            ],
        }

    def select_model(self, model_id: str) -> None:
        self.active_model = model_id
        logger.info("Active model → %s", model_id)

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
