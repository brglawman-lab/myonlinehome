/* API handlers for myonlinehome.
 *
 *   GET  /api/sightings               public
 *   GET  /api/custom-species          public
 *   POST /private/api/sightings       behind Cloudflare Access
 *   DEL  /private/api/sightings/:id   behind Cloudflare Access
 *   POST /private/api/custom-species  behind Cloudflare Access
 *
 * Reads and writes are on different path prefixes on purpose: Cloudflare Access
 * policies match on path, not on HTTP method, so splitting them is what allows
 * "anyone may read, only Ben may write" with a single Access application.
 */

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const noDb = () =>
  json({ error: "No database bound. See db/SETUP.md." }, 503);

/* Access injects this header on every request it lets through. Belt and braces:
 * the Access policy should already have stopped anyone without it. */
const authed = (request) => Boolean(request.headers.get("Cf-Access-Jwt-Assertion"));

/* ---------- reads ---------- */

export async function listSightings(env) {
  if (!env.DB) return noDb();
  const { results } = await env.DB.prepare(
    `SELECT id, species_id, date, time, location_name, county, note, lat, lon, logged_at
       FROM sightings
      WHERE deleted_at IS NULL
      ORDER BY date DESC, logged_at DESC`
  ).all();

  return json(
    (results || []).map((r) => ({
      id: r.id,
      speciesId: r.species_id,
      date: r.date,
      time: r.time,
      locationName: r.location_name,
      county: r.county,
      note: r.note,
      lat: r.lat,
      lon: r.lon,
      loggedAt: r.logged_at,
    }))
  );
}

export async function listCustomSpecies(env) {
  if (!env.DB) return noDb();
  const { results } = await env.DB.prepare(
    `SELECT id, common_name, class, taxon_order, family, occurrence_status, conservation_status
       FROM custom_species
      WHERE deleted_at IS NULL
      ORDER BY common_name`
  ).all();

  return json(
    (results || []).map((r) => ({
      id: r.id,
      commonName: r.common_name,
      class: r.class,
      order: r.taxon_order,
      family: r.family,
      occurrenceStatus: r.occurrence_status,
      conservationStatus: r.conservation_status,
      custom: true,
    }))
  );
}

/* ---------- writes ---------- */

export async function createSightings(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return json({ saved: 0, ids: [] });
  if (rows.length > 200) return json({ error: "Too many records in one request" }, 413);

  const stmt = env.DB.prepare(
    `INSERT INTO sightings
       (id, species_id, date, time, location_name, county, note, lat, lon, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       species_id    = excluded.species_id,
       date          = excluded.date,
       time          = excluded.time,
       location_name = excluded.location_name,
       county        = excluded.county,
       note          = excluded.note,
       lat           = excluded.lat,
       lon           = excluded.lon,
       deleted_at    = NULL`
  );

  const now = new Date().toISOString();
  const ids = [];
  const batch = [];

  for (const s of rows) {
    if (!s || !s.speciesId || !s.date) {
      return json({ error: "Each sighting needs speciesId and date" }, 400);
    }
    const id = s.id || `sighting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ids.push(id);
    batch.push(
      stmt.bind(
        id,
        s.speciesId,
        s.date,
        s.time ?? null,
        s.locationName ?? null,
        s.county ?? null,
        s.note ?? null,
        typeof s.lat === "number" ? s.lat : null,
        typeof s.lon === "number" ? s.lon : null,
        s.loggedAt || now
      )
    );
  }

  await env.DB.batch(batch);
  return json({ saved: ids.length, ids });
}

export async function deleteSighting(request, env, id) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  if (!id) return json({ error: "Missing id" }, 400);

  const res = await env.DB.prepare(
    `UPDATE sightings SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`
  )
    .bind(new Date().toISOString(), id)
    .run();

  return json({ deleted: res.meta?.changes ?? 0, id });
}

export async function createCustomSpecies(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const rows = Array.isArray(body) ? body : [body];
  const now = new Date().toISOString();
  const stmt = env.DB.prepare(
    `INSERT INTO custom_species
       (id, common_name, class, taxon_order, family, occurrence_status, conservation_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       common_name         = excluded.common_name,
       class               = excluded.class,
       taxon_order         = excluded.taxon_order,
       family              = excluded.family,
       occurrence_status   = excluded.occurrence_status,
       conservation_status = excluded.conservation_status,
       deleted_at          = NULL`
  );

  const batch = [];
  for (const s of rows) {
    if (!s || !s.id || !s.commonName) {
      return json({ error: "Each species needs id and commonName" }, 400);
    }
    batch.push(
      stmt.bind(
        s.id,
        s.commonName,
        s.class ?? null,
        s.order ?? null,
        s.family ?? null,
        s.occurrenceStatus ?? "resident",
        s.conservationStatus ?? null,
        now
      )
    );
  }

  await env.DB.batch(batch);
  return json({ saved: batch.length });
}

/* ---------- recipes ----------
 *
 * The 51 recipes shipped in the recipe book's HTML stay there as a seed: they
 * are reference content that renders instantly and still works with no network.
 * The database holds the overlay — recipes Ben adds, edits to seeded ones, and
 * deletions. The client merges the two, database winning by id.
 *
 * ingredients and steps are stored as JSON strings because D1 is SQLite.
 */

const parseJsonColumn = (raw, fallback) => {
  if (raw == null) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

const parseJsonObjectColumn = (raw, fallback) => {
  if (raw == null) return fallback;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

export async function listRecipes(env) {
  if (!env.DB) return noDb();
  const { results } = await env.DB.prepare(
    `SELECT id, section, title, category, serves, time, calories, description,
            ingredients, steps, notes, image, storage, updated_at
       FROM recipes
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC`
  ).all();

  return json(
    (results || []).map((r) => ({
      id: r.id,
      section: r.section,
      title: r.title,
      category: r.category,
      serves: r.serves,
      time: r.time,
      calories: r.calories,
      description: r.description,
      ingredients: parseJsonColumn(r.ingredients, []),
      steps: parseJsonColumn(r.steps, []),
      notes: r.notes,
      image: r.image,
      storage: parseJsonObjectColumn(r.storage, null),
      updatedAt: r.updated_at,
    }))
  );
}

/* Ids of recipes deleted from the database. The client needs these so it can
 * drop a seeded recipe that Ben has since removed — otherwise the seed would
 * resurrect it on every load. */
export async function listDeletedRecipes(env) {
  if (!env.DB) return noDb();
  const { results } = await env.DB.prepare(
    `SELECT id FROM recipes WHERE deleted_at IS NOT NULL`
  ).all();
  return json((results || []).map((r) => r.id));
}

export async function saveRecipes(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return json({ saved: 0, ids: [] });
  if (rows.length > 100) return json({ error: "Too many recipes in one request" }, 413);

  const stmt = env.DB.prepare(
    `INSERT INTO recipes
       (id, section, title, category, serves, time, calories, description,
        ingredients, steps, notes, image, storage, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       section     = excluded.section,
       title       = excluded.title,
       category    = excluded.category,
       serves      = excluded.serves,
       time        = excluded.time,
       calories    = excluded.calories,
       description = excluded.description,
       ingredients = excluded.ingredients,
       steps       = excluded.steps,
       notes       = excluded.notes,
       image       = excluded.image,
       storage     = excluded.storage,
       updated_at  = excluded.updated_at,
       deleted_at  = NULL`
  );

  const now = new Date().toISOString();
  const ids = [];
  const batch = [];

  for (const r of rows) {
    if (!r || !r.id || !r.title) {
      return json({ error: "Each recipe needs an id and a title" }, 400);
    }
    ids.push(r.id);
    batch.push(
      stmt.bind(
        r.id,
        r.section ?? "other",
        r.title,
        r.category ?? r.section ?? null,
        r.serves ?? null,
        r.time ?? null,
        r.calories ?? null,
        r.description ?? null,
        JSON.stringify(Array.isArray(r.ingredients) ? r.ingredients : []),
        JSON.stringify(Array.isArray(r.steps) ? r.steps : []),
        r.notes ?? null,
        r.image ?? null,
        r.storage && typeof r.storage === "object" ? JSON.stringify(r.storage) : null,
        r.createdAt || now,
        now
      )
    );
  }

  await env.DB.batch(batch);
  return json({ saved: ids.length, ids });
}

export async function deleteRecipe(request, env, id) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  if (!id) return json({ error: "Missing id" }, 400);

  const now = new Date().toISOString();

  /* A seeded recipe has no database row, so there is nothing to soft-delete.
   * Insert a tombstone instead, otherwise the seed puts it straight back. */
  await env.DB.prepare(
    `INSERT INTO recipes (id, section, title, created_at, updated_at, deleted_at)
     VALUES (?, 'deleted', '(deleted)', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`
  )
    .bind(id, now, now, now)
    .run();

  return json({ deleted: 1, id });
}

/* ---------- food storage: rooms + readings ----------
 *
 * Rooms (e.g. "Pantry", "Garage store") are named places Ben takes readings
 * in. Readings are individual temperature/humidity measurements logged
 * against a room over time, used to build up a picture of how conditions
 * drift through the year in spaces that aren't climate-controlled.
 *
 * Both are public to read (so the Food Storage page works with no login) and
 * behind Cloudflare Access to write, same as sightings and recipes.
 */

export async function listStorageRooms(env) {
  if (!env.DB) return noDb();
  const { results } = await env.DB.prepare(
    `SELECT id, name, notes, created_at
       FROM storage_rooms
      WHERE deleted_at IS NULL
      ORDER BY name`
  ).all();

  return json(
    (results || []).map((r) => ({
      id: r.id,
      name: r.name,
      notes: r.notes,
      createdAt: r.created_at,
    }))
  );
}

export async function createStorageRooms(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return json({ saved: 0, ids: [] });
  if (rows.length > 100) return json({ error: "Too many rooms in one request" }, 413);

  const stmt = env.DB.prepare(
    `INSERT INTO storage_rooms (id, name, notes, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name       = excluded.name,
       notes      = excluded.notes,
       deleted_at = NULL`
  );

  const now = new Date().toISOString();
  const ids = [];
  const batch = [];

  for (const r of rows) {
    if (!r || !r.name) return json({ error: "Each room needs a name" }, 400);
    const id = r.id || `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ids.push(id);
    batch.push(stmt.bind(id, r.name, r.notes ?? null, r.createdAt || now));
  }

  await env.DB.batch(batch);
  return json({ saved: ids.length, ids });
}

export async function deleteStorageRoom(request, env, id) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  if (!id) return json({ error: "Missing id" }, 400);

  const now = new Date().toISOString();

  // Soft-delete the room and quietly tidy up its readings the same way, so a
  // deleted room's history doesn't linger in /api/storage-readings.
  await env.DB.batch([
    env.DB.prepare(`UPDATE storage_rooms SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(now, id),
    env.DB.prepare(`UPDATE storage_readings SET deleted_at = ? WHERE room_id = ? AND deleted_at IS NULL`).bind(now, id),
  ]);

  return json({ deleted: 1, id });
}

export async function listStorageReadings(env) {
  if (!env.DB) return noDb();
  const { results } = await env.DB.prepare(
    `SELECT id, room_id, recorded_at, temp_c, humidity_pct, note, logged_at
       FROM storage_readings
      WHERE deleted_at IS NULL
      ORDER BY recorded_at ASC`
  ).all();

  return json(
    (results || []).map((r) => ({
      id: r.id,
      roomId: r.room_id,
      recordedAt: r.recorded_at,
      tempC: r.temp_c,
      humidityPct: r.humidity_pct,
      note: r.note,
      loggedAt: r.logged_at,
    }))
  );
}

export async function createStorageReadings(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return json({ saved: 0, ids: [] });
  if (rows.length > 500) return json({ error: "Too many readings in one request" }, 413);

  const stmt = env.DB.prepare(
    `INSERT INTO storage_readings
       (id, room_id, recorded_at, temp_c, humidity_pct, note, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       room_id      = excluded.room_id,
       recorded_at  = excluded.recorded_at,
       temp_c       = excluded.temp_c,
       humidity_pct = excluded.humidity_pct,
       note         = excluded.note,
       deleted_at   = NULL`
  );

  const now = new Date().toISOString();
  const ids = [];
  const batch = [];

  for (const r of rows) {
    if (!r || !r.roomId || !r.recordedAt) {
      return json({ error: "Each reading needs roomId and recordedAt" }, 400);
    }
    if (r.tempC == null && r.humidityPct == null) {
      return json({ error: "Each reading needs a temperature, a humidity, or both" }, 400);
    }
    const id = r.id || `reading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ids.push(id);
    batch.push(
      stmt.bind(
        id,
        r.roomId,
        r.recordedAt,
        typeof r.tempC === "number" ? r.tempC : null,
        typeof r.humidityPct === "number" ? r.humidityPct : null,
        r.note ?? null,
        r.loggedAt || now
      )
    );
  }

  await env.DB.batch(batch);
  return json({ saved: ids.length, ids });
}

export async function deleteStorageReading(request, env, id) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  if (!id) return json({ error: "Missing id" }, 400);

  const res = await env.DB.prepare(
    `UPDATE storage_readings SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`
  )
    .bind(new Date().toISOString(), id)
    .run();

  return json({ deleted: res.meta?.changes ?? 0, id });
}
