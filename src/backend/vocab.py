"""Shared embeddings + metadata I/O for the predictor and build scripts.

Two artifacts make up the species vocabulary:

  - species_embeddings.npz (per model): fp16 embeddings + parallel scientific_names array.
    Row i of `embeddings` corresponds to `scientific_names[i]`. Stored as float16
    to halve on-disk size; the predictor casts to float32 at load time so the
    inference matmul runs at full precision.

  - species_meta.sqlite (shared across models): species table + genus_vernacular
    + family_vernacular tables. Holds taxonomy, common names at species level,
    and English vernaculars at genus and family level for the display-label
    fallback chain.
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Schema v2 added genus_vernacular + family_vernacular tables for Phase D's
# fallback chain. CREATE IF NOT EXISTS keeps v1 sqlites upgradable in place —
# the predictor + merger will silently start using the new tables once they
# exist.
META_SCHEMA_VERSION = 2

_META_SCHEMA = """
CREATE TABLE IF NOT EXISTS species (
    scientific_name TEXT PRIMARY KEY,
    common_name     TEXT,
    kingdom         TEXT,
    phylum          TEXT,
    class           TEXT,
    "order"         TEXT,
    family          TEXT,
    genus           TEXT,
    iucn_status     TEXT
);
CREATE INDEX IF NOT EXISTS idx_species_common_name ON species(common_name);

CREATE TABLE IF NOT EXISTS genus_vernacular (
    genus        TEXT PRIMARY KEY,
    english_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS family_vernacular (
    family       TEXT PRIMARY KEY,
    english_name TEXT NOT NULL
);
"""

_META_COLUMNS = (
    "scientific_name", "common_name", "kingdom", "phylum", "class", "order",
    "family", "genus", "iucn_status",
)


# ── Embeddings ─────────────────────────────────────────────────────────────────


def save_embeddings(path: Path, embeddings: np.ndarray, scientific_names: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        path,
        embeddings=embeddings,
        scientific_names=np.array(scientific_names, dtype=object),
    )
    logger.info(
        "Saved %d embeddings → %s (%.1f MB)",
        len(scientific_names), path, path.stat().st_size / 1e6,
    )


def load_embeddings(path: Path) -> tuple[np.ndarray, list[str]]:
    data = np.load(path, allow_pickle=True)
    if "scientific_names" not in data:
        raise ValueError(
            f"{path} is missing the 'scientific_names' array — it was likely built "
            "with an older version of build_embeddings.py. Re-run the build script."
        )
    return data["embeddings"], [str(s) for s in data["scientific_names"]]


# ── Metadata sqlite ────────────────────────────────────────────────────────────


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(_META_SCHEMA)
    conn.execute(f"PRAGMA user_version = {META_SCHEMA_VERSION}")


def write_metadata_sqlite(path: Path, species: list[dict[str, Any]]) -> None:
    """Write or upsert species rows into the shared metadata sqlite.

    Re-runs (e.g. with a different source CSV) update existing rows in place
    rather than starting from scratch — useful when merging multiple sources.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        _ensure_schema(conn)
        conn.executemany(
            """
            INSERT INTO species (
                scientific_name, common_name, kingdom, phylum, class, "order",
                family, genus, iucn_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scientific_name) DO UPDATE SET
                common_name = excluded.common_name,
                kingdom     = excluded.kingdom,
                phylum      = excluded.phylum,
                class       = excluded.class,
                "order"     = excluded."order",
                family      = excluded.family,
                genus       = excluded.genus,
                iucn_status = excluded.iucn_status
            """,
            [
                (
                    sp["scientific_name"], sp.get("common_name"),
                    sp.get("kingdom", ""), sp.get("phylum", ""),
                    sp.get("class_", ""), sp.get("order", ""),
                    sp.get("family", ""), sp.get("genus", ""),
                    sp.get("iucn_status"),
                )
                for sp in species
            ],
        )
        conn.commit()
    finally:
        conn.close()
    logger.info(
        "Saved %d species → %s (%.1f MB)",
        len(species), path, path.stat().st_size / 1e6,
    )


def upsert_genus_vernaculars(path: Path, names: dict[str, str]) -> int:
    """Replace or insert genus → english_name rows. Returns the number of rows
    that ended up in the table after the upsert (not just the delta)."""
    return _upsert_simple_vernaculars(path, "genus_vernacular", "genus", names)


def upsert_family_vernaculars(path: Path, names: dict[str, str]) -> int:
    return _upsert_simple_vernaculars(path, "family_vernacular", "family", names)


def _upsert_simple_vernaculars(
    path: Path,
    table: str,
    key_column: str,
    names: dict[str, str],
) -> int:
    if not names:
        return 0
    conn = sqlite3.connect(path)
    try:
        _ensure_schema(conn)
        conn.executemany(
            f"""
            INSERT INTO {table} ({key_column}, english_name) VALUES (?, ?)
            ON CONFLICT({key_column}) DO UPDATE SET english_name = excluded.english_name
            """,
            list(names.items()),
        )
        conn.commit()
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()
    return count


class MetaStore:
    """Read-only species metadata lookup, backed by sqlite."""

    def __init__(self, db_path: Path) -> None:
        if not db_path.exists():
            raise FileNotFoundError(
                f"Species metadata not found: {db_path}. "
                "Run scripts/build_embeddings.py to generate it."
            )
        self._conn = sqlite3.connect(
            f"file:{db_path}?mode=ro", uri=True, check_same_thread=False
        )
        self._conn.row_factory = sqlite3.Row

    def lookup_many(self, scientific_names: list[str]) -> list[dict[str, Any]]:
        """Return one dict per requested name (in order). Each row also carries
        `genus_english` and `family_english` (joined from the rank vernacular
        tables) so callers can build display labels in one round-trip."""
        if not scientific_names:
            return []
        placeholders = ",".join("?" for _ in scientific_names)
        cursor = self._conn.execute(
            f"""
            SELECT s.scientific_name, s.common_name, s.kingdom, s.phylum,
                   s.class, s."order", s.family, s.genus, s.iucn_status,
                   gv.english_name AS genus_english,
                   fv.english_name AS family_english
            FROM species s
            LEFT JOIN genus_vernacular  gv ON gv.genus  = s.genus
            LEFT JOIN family_vernacular fv ON fv.family = s.family
            WHERE s.scientific_name IN ({placeholders})
            """,
            scientific_names,
        )
        rows = {row["scientific_name"]: dict(row) for row in cursor.fetchall()}
        return [
            rows.get(name, {"scientific_name": name})
            for name in scientific_names
        ]

    def close(self) -> None:
        self._conn.close()
