"""Wikidata vernacular adapter (cache-based).

Wikidata's `taxon common name` (P1843) property is the long-tail backstop:
many obscure invertebrates have an English common name in Wikidata even when
iNaturalist and GBIF don't.

The adapter does NOT hit the network — it reads a JSON cache produced by
`scripts/fetch_wikidata.py`, which is the only piece of code that talks to
query.wikidata.org. Keeping the build path offline-only means CI builds and
contributor builds are reproducible without external dependencies, and the
cache file becomes the audit trail for "where did this name come from."

Cache format:

    {
      "Vulpes vulpes": "red fox",
      "Bubo virginianus": "great horned owl",
      ...
    }

The fetcher script populates this; this adapter just loads it.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from .base import VernacularSource, file_sha256

logger = logging.getLogger(__name__)


def load(cache_path: Path) -> VernacularSource:
    if not cache_path.exists():
        raise FileNotFoundError(
            f"Wikidata cache not found: {cache_path}. "
            "Run scripts/fetch_wikidata.py to populate it."
        )

    with cache_path.open(encoding="utf-8") as f:
        raw = json.load(f)

    if not isinstance(raw, dict):
        raise ValueError(
            f"{cache_path}: expected a JSON object mapping scientific_name → vernacular, got {type(raw).__name__}"
        )

    species_names: dict[str, str] = {}
    for sci, vernacular in raw.items():
        if not isinstance(sci, str) or not isinstance(vernacular, str):
            continue
        sci = sci.strip()
        vernacular = vernacular.strip()
        if sci and vernacular:
            species_names[sci] = vernacular

    logger.info("Wikidata cache: loaded %d names from %s", len(species_names), cache_path)

    return VernacularSource(
        name="wikidata",
        species_names=species_names,
        source_path=str(cache_path),
        sha256=file_sha256(cache_path),
        size_bytes=cache_path.stat().st_size,
    )
