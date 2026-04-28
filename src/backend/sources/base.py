"""Source-adapter contract + small helpers shared across adapters."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class VernacularSource:
    """The output of every source adapter.

    Adapters do their own filtering (English-only, animal-only, rank-aware) so
    the merger doesn't need source-specific logic. Three rank-keyed dicts let
    the merger populate species.common_name, genus_vernacular, and
    family_vernacular tables independently.

    `species_names`: scientific binomial → English vernacular
    `genus_names`:   genus name           → English vernacular
    `family_names`:  family name          → English vernacular

    `source_path` and `sha256` flow into provenance.json so a release's
    vernacular set is reproducible from recorded inputs.
    """

    name: str
    species_names: dict[str, str]
    source_path: str
    sha256: str
    size_bytes: int = 0
    genus_names: dict[str, str] = field(default_factory=dict)
    family_names: dict[str, str] = field(default_factory=dict)
    extra: dict[str, str] = field(default_factory=dict)


def file_sha256(path: Path, chunk_size: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()
