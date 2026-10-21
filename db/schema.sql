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
  storage      TEXT,                    -- JSON object: {fridge, freezer, reheat}
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipes_section ON recipes (section);

-- Named rooms Ben monitors for food storage conditions (pantry, garage store, …).
CREATE TABLE IF NOT EXISTS storage_rooms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- Individual temperature/humidity readings logged against a room, over time.
CREATE TABLE IF NOT EXISTS storage_readings (
  id            TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL,
  recorded_at   TEXT NOT NULL,          -- ISO date or datetime the reading was taken
  temp_c        REAL,
  humidity_pct  REAL,
  note          TEXT,
  logged_at     TEXT NOT NULL,          -- ISO timestamp the reading was saved
  deleted_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_storage_readings_room ON storage_readings (room_id);
CREATE INDEX IF NOT EXISTS idx_storage_readings_date ON storage_readings (recorded_at);

-- ---------------------------------------------------------------------------
-- Migrating an existing database (one already created before the lines above
-- existed): CREATE TABLE IF NOT EXISTS is safe to re-run, but SQLite has no
-- "ADD COLUMN IF NOT EXISTS", so the new recipes.storage column needs its own
-- one-off statement. Run this once, in the D1 console, only if `recipes`
-- already exists without a storage column (a second run will error, harmlessly):
--
--   ALTER TABLE recipes ADD COLUMN storage TEXT;
-- ---------------------------------------------------------------------------

-- Messages from the contact form on /contact/. Read on /private/messages/.
-- The Worker also creates this table on first use, so running this is optional.
-- sender_hash is a hash of IP address + date, used only for rate limiting;
-- rows older than a year are deleted automatically.
CREATE TABLE IF NOT EXISTS contact_messages (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  email       TEXT NOT NULL,
  message     TEXT NOT NULL,
  page        TEXT,
  sender_hash TEXT,
  created_at  TEXT NOT NULL
);

-- Wildlife gallery photos uploaded or removed through /admin/photos/. Also
-- created by the Worker on first use. Uploaded photos (seed = 0) keep the
-- JPEG in `data`; seed = 1 rows are tombstones for photos committed in
-- public/gallery/ that have been taken off the gallery.
CREATE TABLE IF NOT EXISTS gallery_photos (
  id          TEXT PRIMARY KEY,
  title       TEXT,
  species     TEXT,
  tags        TEXT,                     -- JSON array
  location    TEXT,
  date        TEXT,
  camera      TEXT,
  caption     TEXT,
  size        TEXT,                     -- 'wide' or NULL
  focus       TEXT,                     -- "x% y%": where the subject is
  mime        TEXT,
  data        BLOB,
  width       INTEGER,
  height      INTEGER,
  seed        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- Failed sign-in attempts, for the 10-an-hour limit. Also created on first use.
CREATE TABLE IF NOT EXISTS signin_failures (
  sender_hash TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
