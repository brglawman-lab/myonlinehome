/* GET /api/custom-species — public read of species Ben has added by hand. */

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
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}
