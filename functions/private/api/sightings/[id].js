/* DELETE /private/api/sightings/:id — soft delete, behind Cloudflare Access. */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "No database binding" }, 503);
  if (!request.headers.get("Cf-Access-Jwt-Assertion")) {
    return json({ error: "Not authenticated" }, 401);
  }

  const id = params.id;
  if (!id) return json({ error: "Missing id" }, 400);

  try {
    const res = await env.DB.prepare(
      `UPDATE sightings SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`
    )
      .bind(new Date().toISOString(), id)
      .run();
    return json({ deleted: res.meta?.changes ?? 0, id });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}
