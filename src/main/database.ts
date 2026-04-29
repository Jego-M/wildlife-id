import Database from "better-sqlite3";
import { app } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import log from "electron-log";
import type { Sighting, NewSighting, ModelId } from "../shared/types";

const MIGRATION_001 = `
  CREATE TABLE IF NOT EXISTS Sightings (
    Id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ScientificName TEXT NOT NULL,
    CommonName     TEXT,
    Confidence     REAL NOT NULL,
    ImagePath      TEXT NOT NULL,
    ModelUsed      TEXT NOT NULL,
    DateObserved   TEXT,
    Location       TEXT,
    Comments       TEXT,
    CreatedAt      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sightings_scientific_name ON Sightings(ScientificName);
  CREATE INDEX IF NOT EXISTS idx_sightings_common_name ON Sightings(CommonName);
`;

const MIGRATION_002 = `
  ALTER TABLE Sightings ADD COLUMN TaxonomyClass TEXT;
`;

const MIGRATION_003 = `
  ALTER TABLE Sightings ADD COLUMN TaxonomyKingdom TEXT;
  ALTER TABLE Sightings ADD COLUMN TaxonomyPhylum TEXT;
  ALTER TABLE Sightings ADD COLUMN TaxonomyOrder TEXT;
  ALTER TABLE Sightings ADD COLUMN TaxonomyFamily TEXT;
  ALTER TABLE Sightings ADD COLUMN TaxonomyGenus TEXT;
  ALTER TABLE Sightings ADD COLUMN IucnStatus TEXT;
`;

interface RawRow {
  Id: number;
  ScientificName: string;
  CommonName: string | null;
  Confidence: number;
  ImagePath: string;
  ModelUsed: string;
  TaxonomyKingdom: string | null;
  TaxonomyPhylum: string | null;
  TaxonomyClass: string | null;
  TaxonomyOrder: string | null;
  TaxonomyFamily: string | null;
  TaxonomyGenus: string | null;
  IucnStatus: string | null;
  DateObserved: string | null;
  Location: string | null;
  Comments: string | null;
  CreatedAt: string;
}

const PATCH_COLUMN_MAP: Record<string, string> = {
  date_observed: "DateObserved",
  location: "Location",
  comments: "Comments",
};

const PATCHABLE_FIELDS = Object.keys(PATCH_COLUMN_MAP) as Array<keyof Sighting>;

function toSighting(row: RawRow): Sighting {
  return {
    id: row.Id,
    scientific_name: row.ScientificName,
    common_name: row.CommonName,
    confidence: row.Confidence,
    image_path: row.ImagePath,
    model_used: row.ModelUsed as ModelId,
    taxonomy_kingdom: row.TaxonomyKingdom,
    taxonomy_phylum: row.TaxonomyPhylum,
    taxonomy_class: row.TaxonomyClass,
    taxonomy_order: row.TaxonomyOrder,
    taxonomy_family: row.TaxonomyFamily,
    taxonomy_genus: row.TaxonomyGenus,
    iucn_status: row.IucnStatus,
    date_observed: row.DateObserved,
    location: row.Location,
    comments: row.Comments,
    created_at: row.CreatedAt,
  };
}

export class SightingsRepo {
  private db: Database.Database;

  constructor() {
    const userDataDir = app.getPath("userData");
    mkdirSync(userDataDir, { recursive: true });
    const dbPath = path.join(userDataDir, "wildlife.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.runMigrations();
    log.info(`Database opened: ${dbPath}`);
  }

  private runMigrations(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version < 1) {
      this.db.exec(MIGRATION_001);
      this.db.pragma("user_version = 1");
      log.info("Applied DB migration 001");
    }
    if (version < 2) {
      this.db.exec(MIGRATION_002);
      this.db.pragma("user_version = 2");
      log.info("Applied DB migration 002");
    }
    if (version < 3) {
      this.db.exec(MIGRATION_003);
      this.db.pragma("user_version = 3");
      log.info("Applied DB migration 003");
    }
  }

  list(search?: string): Sighting[] {
    const term = search?.trim();
    if (term) {
      const like = `%${term}%`;
      return (
        this.db
          .prepare(
            `SELECT * FROM Sightings
             WHERE ScientificName LIKE ? OR CommonName LIKE ?
             ORDER BY CreatedAt DESC`
          )
          .all(like, like) as RawRow[]
      ).map(toSighting);
    }
    return (
      this.db.prepare("SELECT * FROM Sightings ORDER BY CreatedAt DESC").all() as RawRow[]
    ).map(toSighting);
  }

  create(s: NewSighting): Sighting {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO Sightings
         (ScientificName, CommonName, Confidence, ImagePath, ModelUsed,
          TaxonomyKingdom, TaxonomyPhylum, TaxonomyClass, TaxonomyOrder,
          TaxonomyFamily, TaxonomyGenus, IucnStatus,
          DateObserved, Location, Comments, CreatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        s.scientific_name,
        s.common_name ?? null,
        s.confidence,
        s.image_path,
        s.model_used,
        s.taxonomy_kingdom ?? null,
        s.taxonomy_phylum ?? null,
        s.taxonomy_class ?? null,
        s.taxonomy_order ?? null,
        s.taxonomy_family ?? null,
        s.taxonomy_genus ?? null,
        s.iucn_status ?? null,
        s.date_observed ?? null,
        s.location ?? null,
        s.comments ?? null,
        now
      );
    const row = this.db
      .prepare("SELECT * FROM Sightings WHERE Id = ?")
      .get(result.lastInsertRowid) as RawRow;
    return toSighting(row);
  }

  update(id: number, patch: Partial<Sighting>): Sighting {
    const fields = PATCHABLE_FIELDS.filter((k) => k in patch);
    if (fields.length > 0) {
      const setClauses = fields.map((k) => `${PATCH_COLUMN_MAP[k]} = ?`).join(", ");
      const values = fields.map((k) => (patch[k] as string | null) ?? null);
      this.db.prepare(`UPDATE Sightings SET ${setClauses} WHERE Id = ?`).run(...values, id);
    }
    const row = this.db.prepare("SELECT * FROM Sightings WHERE Id = ?").get(id) as RawRow;
    return toSighting(row);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM Sightings WHERE Id = ?").run(id);
  }
}

let repo: SightingsRepo | null = null;

export function getRepo(): SightingsRepo {
  if (!repo) repo = new SightingsRepo();
  return repo;
}
