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
  if (!env.DB) return noDb();
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);

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
  if (!env.DB) return noDb();
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!id) return json({ error: "Missing id" }, 400);

  const res = await env.DB.prepare(
    `UPDATE sightings SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`
  )
    .bind(new Date().toISOString(), id)
    .run();

  return json({ deleted: res.meta?.changes ?? 0, id });
}

export async function createCustomSpecies(request, env) {
  if (!env.DB) return noDb();
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);

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
