-- myonlinehome D1 schema
-- Run once against the D1 database (dashboard console or `wrangler d1 execute`).

CREATE TABLE IF NOT EXISTS sightings (
  id            TEXT PRIMARY KEY,
  species_id    TEXT NOT NULL,
  date          TEXT NOT NULL,          -- YYYY-MM-DD
  time          TEXT,                   -- HH:MM, nullable
  location_name TEXT,
  county        TEXT,
  note          TEXT,
  lat           REAL,
  lon           REAL,
  logged_at     TEXT NOT NULL,          -- ISO timestamp
  deleted_at    TEXT                    -- soft delete; NULL = live
);

CREATE INDEX IF NOT EXISTS idx_sightings_species ON sightings (species_id);
CREATE INDEX IF NOT EXISTS idx_sightings_date    ON sightings (date);
CREATE INDEX IF NOT EXISTS idx_sightings_live    ON sightings (deleted_at);

CREATE TABLE IF NOT EXISTS custom_species (
  id                  TEXT PRIMARY KEY,
  common_name         TEXT NOT NULL,
  class               TEXT,
  taxon_order         TEXT,             -- "order" is reserved in SQL
  family              TEXT,
  occurrence_status   TEXT,
  conservation_status TEXT,
  created_at          TEXT NOT NULL,
  deleted_at          TEXT
);

CREATE TABLE IF NOT EXISTS recipes (
  id           TEXT PRIMARY KEY,
  section      TEXT NOT NULL,
  title        TEXT NOT NULL,
  category     TEXT,
  serves       TEXT,
  time         TEXT,
  calories     TEXT,
  description  TEXT,
  ingredients  TEXT,                    -- JSON array
  steps        TEXT,                    -- JSON array
  notes        TEXT,
  image        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipes_section ON recipes (section);
