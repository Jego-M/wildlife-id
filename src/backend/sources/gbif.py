"""GBIF Backbone Taxonomy adapter.

Reads two files from the GBIF backbone Darwin Core Archive:

  - Taxon.tsv          (taxonID → scientificName, kingdom, taxonRank)
  - VernacularName.tsv (taxonID → vernacularName, language)

Streamed in two passes so the ~1 GB Taxon.tsv never fully sits in memory:
pass 1 keeps only the taxonID → binomial map for Animalia species; pass 2
joins the vernaculars against that map and discards everything else.

Get the archive (~150 MB compressed, ~1.5 GB uncompressed):

    curl -L https://hosted-datasets.gbif.org/datasets/backbone/current/backbone.zip \\
        -o /tmp/gbif.zip
    unzip -o /tmp/gbif.zip Taxon.tsv VernacularName.tsv -d /tmp/gbif
"""
from __future__ import annotations

import csv
import logging
from pathlib import Path

from .base import VernacularSource, file_sha256

logger = logging.getLogger(__name__)

ANIMAL_KINGDOMS = {"Animalia"}
WANTED_RANKS = {"species", "genus", "family"}
ENGLISH_LANGS = {"en", "eng"}  # both ISO 639-1 and -3 appear in the wild


def load(taxon_path: Path, vernacular_path: Path) -> VernacularSource:
    """Build per-rank scientific name → English vernacular from the GBIF backbone."""
    if not taxon_path.exists():
        raise FileNotFoundError(f"GBIF Taxon.tsv not found: {taxon_path}")
    if not vernacular_path.exists():
        raise FileNotFoundError(f"GBIF VernacularName.tsv not found: {vernacular_path}")

    # Pass 1 — taxonID → (rank, name) for Animalia at species/genus/family rank
    rank_by_id: dict[str, tuple[str, str]] = {}
    with taxon_path.open(newline="", encoding="utf-8") as f:
        csv.field_size_limit(10 * 1024 * 1024)
        reader = csv.DictReader(f, delimiter="\t")
        rows = 0
        for row in reader:
            rows += 1
            if (row.get("kingdom") or "").strip() not in ANIMAL_KINGDOMS:
                continue
            rank = (row.get("taxonRank") or "").strip().lower()
            if rank not in WANTED_RANKS:
                continue
            tid = (row.get("taxonID") or "").strip()
            sci = (row.get("canonicalName") or row.get("scientificName") or "").strip()
            if not tid or not sci:
                continue
            if rank == "species":
                # Strip authority: canonical binomial is exactly two words.
                parts = sci.split()
                if len(parts) >= 2:
                    sci = f"{parts[0]} {parts[1]}"
            rank_by_id[tid] = (rank, sci)

    rank_counts = {r: 0 for r in WANTED_RANKS}
    for r, _ in rank_by_id.values():
        rank_counts[r] += 1
    logger.info(
        "GBIF Taxon.tsv: scanned %d rows, kept %d animal taxa "
        "(species=%d, genus=%d, family=%d)",
        rows, len(rank_by_id),
        rank_counts["species"], rank_counts["genus"], rank_counts["family"],
    )

    # Pass 2 — vernaculars filtered to English, preferred-name precedence
    species_names: dict[str, str] = {}
    genus_names: dict[str, str] = {}
    family_names: dict[str, str] = {}
    preferred_taken: set[str] = set()
    rows = 0
    with vernacular_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            rows += 1
            lang = (row.get("language") or "").strip().lower()
            if lang and lang not in ENGLISH_LANGS:
                continue
            tid = (row.get("taxonID") or "").strip()
            entry = rank_by_id.get(tid)
            if entry is None:
                continue
            rank, sci = entry
            vernacular = (row.get("vernacularName") or "").strip()
            if not vernacular:
                continue
            target = (
                species_names if rank == "species"
                else genus_names if rank == "genus"
                else family_names
            )
            is_preferred = (row.get("isPreferredName") or "").strip().lower() in {"true", "1"}
            if is_preferred:
                target[sci] = vernacular
                preferred_taken.add(sci)
            elif sci not in target:
                target[sci] = vernacular

    logger.info(
        "GBIF VernacularName.tsv: scanned %d rows, joined species=%d, genus=%d, family=%d (%d preferred)",
        rows, len(species_names), len(genus_names), len(family_names),
        len(preferred_taken),
    )

    combined_sha = file_sha256(taxon_path) + ":" + file_sha256(vernacular_path)
    combined_size = taxon_path.stat().st_size + vernacular_path.stat().st_size

    return VernacularSource(
        name="gbif",
        species_names=species_names,
        genus_names=genus_names,
        family_names=family_names,
        source_path=f"{taxon_path}|{vernacular_path}",
        sha256=combined_sha,
        size_bytes=combined_size,
        extra={
            "taxon_path": str(taxon_path),
            "vernacular_path": str(vernacular_path),
            "preferred_count": str(len(preferred_taken)),
        },
    )
