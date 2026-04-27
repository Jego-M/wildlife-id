"""Wildlife ID — FastAPI inference backend."""
from __future__ import annotations

import argparse
import logging
import os
import socket
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from predictor import Predictor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

predictor: Predictor | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    global predictor
    predictor = Predictor()
    logger.info("Backend ready")
    yield
    logger.info("Backend shutting down")


app = FastAPI(title="Wildlife ID Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ──────────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "active_model": predictor.active_model if predictor else None,
    }


@app.get("/models")
async def models() -> dict:
    if predictor is None:
        return {"active": None, "available": []}
    return predictor.list_models()


class SelectModelRequest(BaseModel):
    model_id: str


@app.post("/select_model")
async def select_model(req: SelectModelRequest) -> dict:
    assert predictor is not None
    predictor.select_model(req.model_id)
    return {"status": "ok", "active_model": req.model_id}


@app.post("/predict")
async def predict(
    image: UploadFile = File(...),
    top_k: int = Form(3),
) -> dict:
    assert predictor is not None
    image_bytes = await image.read()
    return predictor.predict(image_bytes, top_k=top_k)


# ── Port-file helpers ──────────────────────────────────────────────────────────


def pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def write_port_file(path: str, port: int) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w") as f:
        f.write(str(port))
    os.replace(tmp, path)  # atomic rename


# ── Entry point ────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wildlife ID inference backend")
    parser.add_argument("--port-file", required=True, help="Path to write the bound port")
    args = parser.parse_args()

    port = pick_free_port()
    write_port_file(args.port_file, port)
    logger.info("Bound to port %d, wrote port file %s", port, args.port_file)

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
