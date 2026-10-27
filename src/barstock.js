/* Bar stock — which bottles and ingredients are in, for /recipes/bar-stock/
 * and the guest cocktail menu at /recipes/cocktail-menu/.
 *
 *   GET  /api/bar-stock         public — {have: [item ids], updatedAt}
 *   POST /admin/api/bar-stock   signed in — {set: {itemId: true|false, …}}
 *
 * The read is public because the guest menu needs it to cross out drinks the
 * bar can't make. It only ever says which items are in stock.
 *
 * One row per item. A save only touches the items it names, so ticking on a
 * phone and a laptop at the same time doesn't undo either. updatedAt is null
 * until the list has been saved once; the menu treats that as "unknown" and
 * crosses nothing out. The item ids themselves live in
 * public/assets/bar-data.js.
 */

import { json, authed } from "./api.js";

let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS bar_stock (
       id          TEXT PRIMARY KEY,
       have        INTEGER NOT NULL DEFAULT 0,
       updated_at  TEXT NOT NULL
     )`
  ).run();
  tableReady = true;
}

const noDb = () => json({ error: "No database bound. See db/SETUP.md." }, 503);
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;

async function current(env) {
  const { results } = await env.DB.prepare(`SELECT id, have, updated_at FROM bar_stock`).all();
  let updatedAt = null;
  const have = [];
  for (const r of results || []) {
    if (r.have) have.push(r.id);
    if (!updatedAt || r.updated_at > updatedAt) updatedAt = r.updated_at;
  }
  return { have, updatedAt };
}

export async function getBarStock(env) {
  if (!env.DB) return noDb();
  await ensureTable(env);
  return json(await current(env));
}

export async function saveBarStock(request, env) {
  if (!authed(request)) return json({ error: "Not signed in" }, 401);
  if (!env.DB) return noDb();
  let body;
  try { body = await request.json(); } catch { return json({ error: "Body must be JSON" }, 400); }
  const set = body && typeof body.set === "object" && body.set ? body.set : null;
  if (!set) return json({ error: "Send {set: {itemId: true|false}}" }, 400);
  const entries = Object.entries(set).filter(([id]) => ID.test(id));
  if (entries.length > 300) return json({ error: "Too many items in one request" }, 413);

  await ensureTable(env);
  const now = new Date().toISOString();
  if (entries.length) {
    await env.DB.batch(entries.map(([id, have]) =>
      env.DB.prepare(
        `INSERT INTO bar_stock (id, have, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET have = excluded.have, updated_at = excluded.updated_at`
      ).bind(id, have ? 1 : 0, now)
    ));
  }
  return json(await current(env));
}
