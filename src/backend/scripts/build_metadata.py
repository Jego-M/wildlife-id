#!/usr/bin/env python3
"""Merge vernacular-name sources into species_meta.sqlite.

Sources are applied in priority order; first hit wins. Species with no hit in
any new source keep their existing common_name (so re-runs without sources
don't wipe TreeOfLife data).

Priority order (highest first):
  1. iNaturalist DwCA taxa.csv          (--inat-taxa)
  2. GBIF backbone Taxon + VernacularName (--gbif-taxa, --gbif-vernaculars)
  3. Wikidata cache JSON                (--wikidata-cache)
  4. Existing common_name in sqlite     (untouched if the chain above is silent)

Examples
--------

  # iNat only
  curl -L https://www.inaturalist.org/taxa/inaturalist-taxonomy.dwca.zip \\
      -o /tmp/inat.zip
  unzip -o /tmp/inat.zip taxa.csv VernacularNames-english.csv -d /tmp/inat
  python scripts/build_metadata.py \\
      --inat-taxa /tmp/inat/taxa.csv \\
      --inat-vernaculars /tmp/inat/VernacularNames-english.csv

  # All three sources
  curl -L https://hosted-datasets.gbif.org/datasets/backbone/current/backbone.zip \\
      -o /tmp/gbif.zip
  unzip -o /tmp/gbif.zip Taxon.tsv VernacularName.tsv -d /tmp/gbif
  python scripts/fetch_wikidata.py --out src/backend/data/wikidata_vernaculars.json
  python scripts/build_metadata.py \\
      --inat-taxa /tmp/inat/taxa.csv \\
      --inat-vernaculars /tmp/inat/VernacularNames-english.csv \\
      --gbif-taxa /tmp/gbif/Taxon.tsv \\
      --gbif-vernaculars /tmp/gbif/VernacularName.tsv \\
      --wikidata-cache src/backend/data/wikidata_vernaculars.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import sqlite3
import sys
from pathlib import Path

# Allow `python scripts/build_metadata.py` from the backend dir.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sources import VernacularSource  # noqa: E402
from sources import gbif as gbif_source  # noqa: E402
from sources import inaturalist as inat_source  # noqa: E402
from sources import wikidata as wikidata_source  # noqa: E402
from vocab import upsert_genus_vernaculars, upsert_family_vernaculars  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def default_meta_db() -> Path:
    """Match the predictor's default vocab path so a no-arg run targets the
    same sqlite the running app reads."""
    models_dir = os.environ.get(
        "WILDLIFE_MODEL_DIR",
        os.path.join(os.path.expanduser("~"), ".wildlife-id", "models"),
    )
    vocab_dir = os.environ.get(
        "WILDLIFE_VOCAB_DIR",
        str(Path(models_dir).parent / "vocab"),
    )
    return Path(vocab_dir) / "species_meta.sqlite"


def apply_sources(
    meta_db: Path,
    sources: list[VernacularSource],
) -> dict:
    """Update common_name in species_meta.sqlite from sources in priority order.

    Returns a stats dict suitable for embedding in provenance.json.
    """
    if not meta_db.exists():
        raise FileNotFoundError(
            f"{meta_db} not found. Run build_embeddings.py first to build the spine."
        )

    conn = sqlite3.connect(meta_db)
    try:
        rows = conn.execute("SELECT scientific_name, common_name FROM species").fetchall()
        existing = {sci: cn for sci, cn in rows}
        before_count = sum(1 for cn in existing.values() if cn)

        per_source_hits: dict[str, int] = {s.name: 0 for s in sources}
        updates: list[tuple[str | None, str]] = []
        new_with_name = 0

        for sci, current in existing.items():
            chosen: str | None = None
            for src in sources:
                if sci in src.species_names:
                    chosen = src.species_names[sci]
                    per_source_hits[src.name] += 1
                    break
            if chosen is None:
                chosen = current  # preserve existing fallback

            if chosen:
                new_with_name += 1
            if chosen != current:
                updates.append((chosen, sci))

        conn.executemany(
            "UPDATE species SET common_name = ? WHERE scientific_name = ?",
            updates,
        )
        conn.commit()
    finally:
        conn.close()

    # Genus and family vernacular tables — each source contributes in priority
    # order but rows are upserted (last write wins), so we iterate in reverse
    # so the highest-priority source writes last.
    genus_counts: dict[str, int] = {}
    family_counts: dict[str, int] = {}
    for src in reversed(sources):
        if src.genus_names:
            c = upsert_genus_vernaculars(meta_db, src.genus_names)
            genus_counts[src.name] = len(src.genus_names)
            logger.info("  %s upserted %d genus vernaculars (table now %d)", src.name, len(src.genus_names), c)
        if src.family_names:
            c = upsert_family_vernaculars(meta_db, src.family_names)
            family_counts[src.name] = len(src.family_names)
            logger.info("  %s upserted %d family vernaculars (table now %d)", src.name, len(src.family_names), c)

    logger.info(
        "Updated %d rows. Coverage: %d → %d species with common_name (+%d).",
        len(updates), before_count, new_with_name, new_with_name - before_count,
    )
    for src_name, hits in per_source_hits.items():
        logger.info("  %s contributed %d species names", src_name, hits)

    return {
        "total_species": len(existing),
        "with_common_name_before": before_count,
        "with_common_name_after": new_with_name,
        "delta": new_with_name - before_count,
        "rows_updated": len(updates),
        "per_source_hits": per_source_hits,
        "genus_counts": genus_counts,
        "family_counts": family_counts,
    }


def write_provenance(
    out_path: Path,
    meta_db: Path,
    sources: list[VernacularSource],
    stats: dict,
) -> None:
    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "meta_db": str(meta_db),
        "sources": [
            {
                "name": s.name,
                "path": s.source_path,
                "sha256": s.sha256,
                "size_bytes": s.size_bytes,
                "names_loaded": len(s.species_names),
                "applied_to_species": stats["per_source_hits"].get(s.name, 0),
            }
            for s in sources
        ],
        "stats": {k: v for k, v in stats.items() if k != "per_source_hits"},
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    logger.info("Wrote provenance → %s", out_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge vernacular sources into species_meta.sqlite")
    parser.add_argument(
        "--meta-db",
        default=None,
        help=f"Path to species_meta.sqlite (default: {default_meta_db()})",
    )
    parser.add_argument(
        "--inat-taxa",
        default=None,
        help="Path to iNaturalist DwCA taxa.csv (requires --inat-vernaculars)",
    )
    parser.add_argument(
        "--inat-vernaculars",
        default=None,
        help="Path to iNaturalist DwCA VernacularNames-english.csv (requires --inat-taxa)",
    )
    parser.add_argument(
        "--gbif-taxa",
        default=None,
        help="Path to GBIF backbone Taxon.tsv (requires --gbif-vernaculars)",
    )
    parser.add_argument(
        "--gbif-vernaculars",
        default=None,
        help="Path to GBIF backbone VernacularName.tsv (requires --gbif-taxa)",
    )
    parser.add_argument(
        "--wikidata-cache",
        default=None,
        help="Path to Wikidata vernacular cache JSON (produced by fetch_wikidata.py)",
    )
    parser.add_argument(
        "--provenance-out",
        default=None,
        help="Where to write provenance.json (default: alongside meta-db)",
    )
    args = parser.parse_args()

    meta_db = Path(args.meta_db) if args.meta_db else default_meta_db()
    provenance_out = Path(args.provenance_out) if args.provenance_out else meta_db.with_suffix(".provenance.json")

    if bool(args.inat_taxa) != bool(args.inat_vernaculars):
        logger.error("--inat-taxa and --inat-vernaculars must be passed together")
        sys.exit(2)
    if bool(args.gbif_taxa) != bool(args.gbif_vernaculars):
        logger.error("--gbif-taxa and --gbif-vernaculars must be passed together")
        sys.exit(2)

    sources: list[VernacularSource] = []

    # Priority order: iNat > GBIF > Wikidata. The merger picks the first hit
    # in this list, so adapter order here is the user-visible priority.
    if args.inat_taxa and args.inat_vernaculars:
        logger.info(
            "Loading iNaturalist source from %s + %s",
            args.inat_taxa, args.inat_vernaculars,
        )
        sources.append(inat_source.load(Path(args.inat_taxa), Path(args.inat_vernaculars)))

    if args.gbif_taxa and args.gbif_vernaculars:
        logger.info(
            "Loading GBIF source from %s + %s",
            args.gbif_taxa, args.gbif_vernaculars,
        )
        sources.append(gbif_source.load(Path(args.gbif_taxa), Path(args.gbif_vernaculars)))

    if args.wikidata_cache:
        logger.info("Loading Wikidata cache from %s", args.wikidata_cache)
        sources.append(wikidata_source.load(Path(args.wikidata_cache)))

    if not sources:
        logger.warning(
            "No sources provided. Pass at least one of: "
            "--inat-taxa+--inat-vernaculars, --gbif-taxa+--gbif-vernaculars, --wikidata-cache"
        )
        sys.exit(2)

    stats = apply_sources(meta_db, sources)
    write_provenance(provenance_out, meta_db, sources, stats)


if __name__ == "__main__":
    main()
