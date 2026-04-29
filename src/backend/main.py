"""Wildlife ID — FastAPI inference backend."""
from __future__ import annotations

import argparse
import json
import logging
import os
import socket
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Generator

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from predictor import Predictor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

predictor: Predictor | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    global predictor
    model_dir = os.environ.get("WILDLIFE_MODEL_DIR")
    predictor = Predictor(models_dir=model_dir)
    logger.info("Backend ready (models_dir=%s)", predictor.models_dir)
    yield
    logger.info("Backend shutting down")


app = FastAPI(title="Wildlife ID Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ──────────────────────────────────────────────────


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


class RemoveModelRequest(BaseModel):
    model_id: str


class DownloadModelRequest(BaseModel):
    model_id: str


class CancelDownloadRequest(BaseModel):
    model_id: str


@app.post("/select_model")
async def select_model(req: SelectModelRequest) -> dict:
    assert predictor is not None
    try:
        predictor.select_model(req.model_id)
        return {"status": "ok", "active_model": req.model_id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/download_model")
async def download_model(req: DownloadModelRequest) -> StreamingResponse:
    assert predictor is not None
    model_id = req.model_id

    def event_stream() -> Generator[str, None, None]:
        assert predictor is not None
        try:
            for progress in predictor.download_model(model_id):
                yield f"data: {json.dumps(progress)}\n\n"
        except (ValueError, RuntimeError) as exc:
            # Up-front validation errors (unknown model, already-downloading)
            # surface as an error event so the renderer's progress listener
            # can show them inline.
            err = {
                "model_id": model_id,
                "bytes_downloaded": 0,
                "bytes_total": 0,
                "status": "error",
                "error": str(exc),
            }
            yield f"data: {json.dumps(err)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/cancel_download")
async def cancel_download(req: CancelDownloadRequest) -> dict:
    assert predictor is not None
    predictor.cancel_download(req.model_id)
    return {"status": "ok"}


@app.post("/remove_model")
async def remove_model(req: RemoveModelRequest) -> dict:
    assert predictor is not None
    try:
        predictor.remove_model(req.model_id)
        return {"status": "ok"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/predict")
async def predict(
    image: UploadFile = File(...),
    top_k: int = Form(3),
) -> dict:
    assert predictor is not None
    image_bytes = await image.read()
    return predictor.predict(image_bytes, top_k=top_k)


# ── Port-file helpers ──────────────────────────────────────────


def pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def write_port_file(path: str, port: int) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w") as f:
        f.write(str(port))
    os.replace(tmp, path)  # atomic rename


# ── Entry point ────────────────────────────────────────────


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wildlife ID inference backend")
    parser.add_argument("--port-file", required=True, help="Path to write the bound port")
    args = parser.parse_args()

    port = pick_free_port()
    write_port_file(args.port_file, port)
    logger.info("Bound to port %d, wrote port file %s", port, args.port_file)

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
