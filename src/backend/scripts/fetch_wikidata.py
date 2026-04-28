#!/usr/bin/env python3
"""Pull English `taxon common name` (P1843) values from Wikidata for every
scientific name in the metadata sqlite, and write a JSON cache the
build_metadata.py merger can read offline.

This is the only piece of code in the project that talks to Wikidata. It is
explicitly not part of the build path: maintainers run it occasionally and
commit the resulting JSON so contributor and CI builds remain offline and
reproducible.

Usage
-----

    python scripts/fetch_wikidata.py \\
        --meta-db ~/.config/wildlife-id/vocab/species_meta.sqlite \\
        --out src/backend/data/wikidata_vernaculars.json

By default this only queries species that don't already have an entry in the
cache, so an interrupted run resumes where it stopped. Pass --refetch to
re-query everything (e.g. when Wikidata has been updated).

Rate limit defaults to 1 request/sec — Wikidata's documented soft cap is 5
queries/sec/IP. Be a polite client.
"""
from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
import time
from pathlib import Path

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ENDPOINT = "https://query.wikidata.org/sparql"
DEFAULT_USER_AGENT = (
    "WildlifeID/0.1 (https://github.com/Jego-M/wildlife-id; "
    "open-source desktop wildlife species ID app)"
)
DEFAULT_BATCH_SIZE = 200
DEFAULT_DELAY = 1.0
SPARQL_TIMEOUT = 60  # seconds per request


def sparql_escape(name: str) -> str:
    """Escape a string literal for inclusion in a SPARQL VALUES clause.

    Wikidata sees plenty of names with apostrophes (e.g. "Sphyraena d'orbignyi");
    backslashes are rare but legal."""
    return name.replace("\\", "\\\\").replace('"', '\\"')


def build_query(names: list[str]) -> str:
    values = " ".join(f'"{sparql_escape(n)}"' for n in names)
    return f"""
SELECT ?taxonName ?vernacular WHERE {{
  VALUES ?taxonName {{ {values} }}
  ?taxon wdt:P225 ?taxonName .
  ?taxon wdt:P1843 ?vernacular .
  FILTER (lang(?vernacular) = "en")
}}
""".strip()


def run_query(
    session: requests.Session,
    names: list[str],
    user_agent: str,
    max_retries: int = 4,
) -> dict[str, str]:
    """Returns scientific_name → English vernacular for hits in this batch.

    A taxon can have multiple P1843 values; we keep the first one reported by
    Wikidata. Names with no Wikidata item or no English vernacular are absent
    from the returned dict (caller treats absence as "no data")."""
    query = build_query(names)
    headers = {
        "User-Agent": user_agent,
        "Accept": "application/sparql-results+json",
    }
    backoff = 2.0
    for attempt in range(max_retries):
        try:
            r = session.post(
                ENDPOINT,
                data={"query": query},
                headers=headers,
                timeout=SPARQL_TIMEOUT,
            )
            if r.status_code == 200:
                break
            if r.status_code in (429, 500, 502, 503, 504):
                logger.warning(
                    "Wikidata HTTP %d (attempt %d/%d) — sleeping %.1fs",
                    r.status_code, attempt + 1, max_retries, backoff,
                )
                time.sleep(backoff)
                backoff *= 2
                continue
            r.raise_for_status()
        except requests.RequestException as e:
            logger.warning(
                "Wikidata request error (attempt %d/%d): %s — sleeping %.1fs",
                attempt + 1, max_retries, e, backoff,
            )
            time.sleep(backoff)
            backoff *= 2
    else:
        raise RuntimeError(f"Wikidata query failed after {max_retries} attempts")

    payload = r.json()
    out: dict[str, str] = {}
    for binding in payload.get("results", {}).get("bindings", []):
        sci = binding.get("taxonName", {}).get("value", "").strip()
        vern = binding.get("vernacular", {}).get("value", "").strip()
        if sci and vern and sci not in out:
            out[sci] = vern
    return out


def load_cache(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path} is not a JSON object")
    return {str(k): str(v) for k, v in data.items()}


def save_cache(path: Path, cache: dict[str, str]) -> None:
    """Atomic-rename write so a Ctrl-C in the middle never leaves a partial cache."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, sort_keys=True, indent=2)
    tmp.replace(path)


def read_spine(meta_db: Path, only_missing: bool) -> list[str]:
    if not meta_db.exists():
        raise FileNotFoundError(f"{meta_db} not found")
    conn = sqlite3.connect(meta_db)
    try:
        if only_missing:
            rows = conn.execute(
                "SELECT scientific_name FROM species WHERE common_name IS NULL OR common_name = ''"
            ).fetchall()
        else:
            rows = conn.execute("SELECT scientific_name FROM species").fetchall()
    finally:
        conn.close()
    return [r[0] for r in rows]


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Wikidata vernaculars into a JSON cache")
    parser.add_argument("--meta-db", required=True, help="Path to species_meta.sqlite (the spine)")
    parser.add_argument("--out", required=True, help="Cache JSON output path")
    parser.add_argument(
        "--all-species",
        action="store_true",
        help="Query every species, not just those missing a common_name",
    )
    parser.add_argument(
        "--refetch",
        action="store_true",
        help="Re-query species already in the cache (default: skip them)",
    )
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="Seconds between requests")
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT)
    parser.add_argument("--limit", type=int, default=0, help="Stop after this many species (0 = all)")
    args = parser.parse_args()

    meta_db = Path(args.meta_db)
    out_path = Path(args.out)
    cache = load_cache(out_path)

    spine = read_spine(meta_db, only_missing=not args.all_species)
    if not args.refetch:
        spine = [s for s in spine if s not in cache]
    if args.limit:
        spine = spine[: args.limit]

    if not spine:
        logger.info("Nothing to fetch — cache already covers the spine.")
        return

    logger.info(
        "Fetching %d names from Wikidata in batches of %d (delay=%.1fs)",
        len(spine), args.batch_size, args.delay,
    )

    session = requests.Session()
    fetched_total = 0
    for i in range(0, len(spine), args.batch_size):
        batch = spine[i : i + args.batch_size]
        try:
            hits = run_query(session, batch, args.user_agent)
        except Exception as e:
            logger.error("Aborting after error on batch %d: %s", i // args.batch_size, e)
            break
        cache.update(hits)
        fetched_total += len(hits)
        save_cache(out_path, cache)
        logger.info(
            "  batch %d/%d — +%d hits, cache=%d",
            (i // args.batch_size) + 1,
            (len(spine) + args.batch_size - 1) // args.batch_size,
            len(hits), len(cache),
        )
        time.sleep(args.delay)

    logger.info("Done. Added %d names; cache now holds %d.", fetched_total, len(cache))


if __name__ == "__main__":
    main()
