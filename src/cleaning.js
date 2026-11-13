/* The cleaning list at /admin/cleaning/.
 *
 *   GET  /admin/api/cleaning   signed in — {tasks: [...]}
 *   POST /admin/api/cleaning   signed in — save tasks (array of rows, newest change wins)
 *
 * One row per job. `section` is "inside" or "outside". `owner` is "ben",
 * "jodie", "both" or null (nobody yet). `doneOn` is the UK date the job was
 * ticked (YYYY-MM-DD), or null. Ticks stay until someone unticks them — the
 * page's "Untick everything" button is the only reset.
 *
 * Each change carries the time it was made, and a save only overwrites a row
 * if it is at least as new, so two phones ticking at once end up agreeing.
 * Removing a job is a soft delete for the same reason.
 *
 * DEFAULT_TASKS is written with INSERT OR IGNORE, so adding a line here adds
 * that job to the live list on the next deploy, while a job that was removed
 * on the page stays removed (its soft-deleted row is still there).
 */

import { json, authed } from "./api.js";

const DEFAULT_TASKS = [
  // [id, label, section, sort]
  ["general-tidy", "General tidy", "inside", 10],
  ["change-bedding", "Change the bedding on both beds", "inside", 20],
  ["clean-bathroom", "Clean the bathroom", "inside", 30],
  ["clean-toilets-sink", "Clean both toilets and the bedroom sink", "inside", 40],
  ["clean-kitchen", "Clean the kitchen", "inside", 50],
  ["dust-surfaces", "Dust and wipe surfaces", "inside", 60],
  ["clean-fridge", "Clear out and clean the fridge", "inside", 70],
  ["hoover-sofa", "Hoover the sofa", "inside", 80],
  ["hoover-floors", "Hoover the floors", "inside", 90],
  ["hoover-stairs", "Hoover the stairs", "inside", 95],
  ["take-out-bins", "Take out the bins", "inside", 100],
  ["tidy-garden", "Tidy the garden", "outside", 210],
  ["tidy-lane", "Tidy the lane", "outside", 220],
  ["mow-grass", "Mow the grass", "outside", 230],
  ["pond-maintenance", "Pond maintenance", "outside", 240],
  ["fill-bird-feeders", "Fill the bird feeders", "outside", 250],
  ["clear-drains", "Clear the drains", "outside", 260],
];

const OWNERS = ["ben", "jodie", "both"];
const SECTIONS = ["inside", "outside"];
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const noDb = () => json({ error: "No database bound. See db/SETUP.md." }, 503);
const clip = (s, n) => (typeof s === "string" ? s.trim().slice(0, n) : "");

let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS cleaning_tasks (
       id          TEXT PRIMARY KEY,
       label       TEXT NOT NULL,
       owner       TEXT,
       done_on     TEXT,
       sort        INTEGER NOT NULL DEFAULT 0,
       updated_at  TEXT NOT NULL,
       deleted_at  TEXT,
       section     TEXT NOT NULL DEFAULT 'inside'
     )`
  ).run();
  // Tables made before sections existed (13 November 2026) lack the column.
  const { results: cols } = await env.DB.prepare(`PRAGMA table_info(cleaning_tasks)`).all();
  if (!(cols || []).some((c) => c.name === "section")) {
    await env.DB.prepare(`ALTER TABLE cleaning_tasks ADD COLUMN section TEXT NOT NULL DEFAULT 'inside'`).run();
  }
  // Stamped long ago, so the first change from any phone wins even if its
  // clock runs a little behind the server's.
  const seeded = "2000-01-01T00:00:00.000Z";
  await env.DB.batch(DEFAULT_TASKS.map(([id, label, section, sort]) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO cleaning_tasks (id, label, owner, done_on, sort, updated_at, section)
       VALUES (?1, ?2, NULL, NULL, ?3, ?4, ?5)`
    ).bind(id, label, sort, seeded, section)
  ));
  tableReady = true;
}

async function liveTasks(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, label, owner, done_on, sort, updated_at, section FROM cleaning_tasks
     WHERE deleted_at IS NULL ORDER BY sort, label`
  ).all();
  return (results || []).map((r) => ({
    id: r.id, label: r.label, section: r.section, owner: r.owner, doneOn: r.done_on, sort: r.sort, updatedAt: r.updated_at,
  }));
}

export async function listCleaning(request, env) {
  if (!authed(request)) return json({ error: "Not signed in" }, 401);
  if (!env.DB) return noDb();
  await ensureTable(env);
  return json({ tasks: await liveTasks(env) });
}

export async function saveCleaning(request, env) {
  if (!authed(request)) return json({ error: "Not signed in" }, 401);
  if (!env.DB) return noDb();
  let body;
  try { body = await request.json(); } catch { return json({ error: "Body must be JSON" }, 400); }
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length > 200) return json({ error: "Too many jobs in one request" }, 413);

  await ensureTable(env);
  const now = new Date().toISOString();
  // A row sent without a section (a page still open from before sections
  // existed) keeps the section it already has; a new one goes inside.
  const stmt = env.DB.prepare(
    `INSERT INTO cleaning_tasks (id, label, owner, done_on, sort, updated_at, deleted_at, section)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE(?8, 'inside'))
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label, owner = excluded.owner, done_on = excluded.done_on,
       sort = excluded.sort, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
       section = CASE WHEN ?8 IS NULL THEN cleaning_tasks.section ELSE excluded.section END
     WHERE excluded.updated_at >= cleaning_tasks.updated_at`
  );
  const batch = [];
  for (const r of rows) {
    const id = r && typeof r.id === "string" ? r.id : "";
    const label = clip(r && r.label, 120);
    if (!ID.test(id) || !label) return json({ error: "Each job needs an id and a name" }, 400);
    const owner = OWNERS.includes(r.owner) ? r.owner : null;
    const section = SECTIONS.includes(r.section) ? r.section : null;
    const doneOn = typeof r.doneOn === "string" && DAY.test(r.doneOn) ? r.doneOn : null;
    const sort = Number.isFinite(r.sort) ? Math.round(r.sort) : 0;
    // A clock that runs fast must not be able to lock a row against later changes.
    const updated = typeof r.updatedAt === "string" && r.updatedAt <= now ? r.updatedAt : now;
    batch.push(stmt.bind(id, label, owner, doneOn, sort, updated, r.deleted ? updated : null, section));
  }
  if (batch.length) await env.DB.batch(batch);
  return json({ saved: batch.length, tasks: await liveTasks(env) });
}
