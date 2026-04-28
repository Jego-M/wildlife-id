"""Vernacular-name source adapters for the metadata merge pipeline.

Each adapter loads a third-party taxonomy/vernacular dump and returns a
VernacularSource: a flat scientific_name → English common name mapping the
merger can apply in priority order. New sources only need to provide a
`load(path: Path) -> VernacularSource` callable.
"""
from __future__ import annotations

from .base import VernacularSource, file_sha256

__all__ = ["VernacularSource", "file_sha256"]
