/* POST /private/api/custom-species — add a species not on the built-in checklist. */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "No database binding" }, 503);
  if (!request.headers.get("Cf-Access-Jwt-Assertion")) {
    return json({ error: "Not authenticated" }, 401);
  }

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

  try {
    await env.DB.batch(batch);
    return json({ saved: batch.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}
