/* GET /api/sightings — public read of every live sighting.
 * Shape matches what the wildlife app already uses, so the client needs no mapping. */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "No database binding" }, 503);
  try {
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
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}
