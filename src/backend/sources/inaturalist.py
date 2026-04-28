"""iNaturalist DwCA adapter.

The Darwin Core Archive splits taxonomy and vernaculars across files:

  - taxa.csv                   the full iNat taxonomy (id, scientificName, kingdom,
                               taxonRank, …). NO vernacularName column despite
                               what the older docs suggested.
  - VernacularNames-english.csv  rows of `id, vernacularName, …` joined back
                               to taxa.csv by `id`.

Two-pass parser, like the GBIF adapter: pass 1 builds id-keyed lookups for
species, genus, and family ranks; pass 2 walks the English vernacular file
and joins each id back to whichever rank dict claims it. The first English
row per id wins — iNat's vernacular file is sorted by preference (curated
preferred vernacular comes first), so first-wins gives us the right name
without needing an explicit preferred flag.

Get the archive (~75 MB):

    curl -L https://www.inaturalist.org/taxa/inaturalist-taxonomy.dwca.zip \\
        -o /tmp/inat.zip
    unzip -o /tmp/inat.zip taxa.csv VernacularNames-english.csv -d /tmp/inat
"""
from __future__ import annotations

import csv
import logging
from pathlib import Path

from .base import VernacularSource, file_sha256

logger = logging.getLogger(__name__)

ANIMAL_KINGDOMS = {"Animalia"}
WANTED_RANKS = {"species", "genus", "family"}


def load(taxa_csv: Path, vernacular_csv: Path) -> VernacularSource:
    """Build per-rank scientific name → English vernacular dicts."""
    if not taxa_csv.exists():
        raise FileNotFoundError(f"iNaturalist taxa.csv not found: {taxa_csv}")
    if not vernacular_csv.exists():
        raise FileNotFoundError(
            f"iNaturalist VernacularNames-english.csv not found: {vernacular_csv}"
        )

    csv.field_size_limit(10 * 1024 * 1024)

    # Pass 1 — id → (rank, name) for Animalia rows at species/genus/family rank
    rank_by_id: dict[str, tuple[str, str]] = {}
    rows = 0
    with taxa_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows += 1
            if (row.get("kingdom") or "").strip() not in ANIMAL_KINGDOMS:
                continue
            rank = (row.get("taxonRank") or "").strip().lower()
            if rank not in WANTED_RANKS:
                continue
            name = (row.get("scientificName") or "").strip()
            tid = (row.get("id") or "").strip()
            if not name or not tid:
                continue
            rank_by_id[tid] = (rank, name)

    rank_counts = {r: 0 for r in WANTED_RANKS}
    for r, _ in rank_by_id.values():
        rank_counts[r] += 1
    logger.info(
        "iNaturalist taxa.csv: scanned %d rows, kept %d animal taxa "
        "(species=%d, genus=%d, family=%d)",
        rows, len(rank_by_id),
        rank_counts["species"], rank_counts["genus"], rank_counts["family"],
    )

    # Pass 2 — first English vernacular per id wins
    species_names: dict[str, str] = {}
    genus_names: dict[str, str] = {}
    family_names: dict[str, str] = {}
    rows = 0
    with vernacular_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows += 1
            tid = (row.get("id") or "").strip()
            entry = rank_by_id.get(tid)
            if entry is None:
                continue
            rank, name = entry
            target = (
                species_names if rank == "species"
                else genus_names if rank == "genus"
                else family_names
            )
            if name in target:
                continue  # first-wins
            vernacular = (row.get("vernacularName") or "").strip()
            if vernacular:
                target[name] = vernacular

    logger.info(
        "iNaturalist vernaculars: scanned %d rows, joined species=%d, genus=%d, family=%d",
        rows, len(species_names), len(genus_names), len(family_names),
    )

    combined_sha = file_sha256(taxa_csv) + ":" + file_sha256(vernacular_csv)
    combined_size = taxa_csv.stat().st_size + vernacular_csv.stat().st_size

    return VernacularSource(
        name="inaturalist",
        species_names=species_names,
        genus_names=genus_names,
        family_names=family_names,
        source_path=f"{taxa_csv}|{vernacular_csv}",
        sha256=combined_sha,
        size_bytes=combined_size,
        extra={
            "taxa_path": str(taxa_csv),
            "vernacular_path": str(vernacular_csv),
        },
    )
