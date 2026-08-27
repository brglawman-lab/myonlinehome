/* POST /api/… writes, behind Cloudflare Access.
 * Everything under /private/ is gated by an Access policy, so an unauthenticated
 * request never reaches this code — Access returns its login page instead.
 * The Access JWT is checked as a second line of defence in case the policy is
 * ever removed by accident. */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function gated(request) {
  // Cloudflare Access injects this header on every request it lets through.
  return Boolean(request.headers.get("Cf-Access-Jwt-Assertion"));
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "No database binding" }, 503);
  if (!gated(request)) return json({ error: "Not authenticated" }, 401);

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
    const id =
      s.id || `sighting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  try {
    await env.DB.batch(batch);
    return json({ saved: ids.length, ids });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}
