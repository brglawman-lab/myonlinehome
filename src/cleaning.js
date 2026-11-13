/* The Friday cleaning checklist at /admin/cleaning/.
 *
 *   GET  /admin/api/cleaning   signed in — {tasks: [...]}
 *   POST /admin/api/cleaning   signed in — save tasks (array of rows, newest change wins)
 *
 * One row per job. `owner` is "ben", "jodie" or null (nobody yet). `doneOn`
 * is the date of the Friday whose clean the job was ticked for (YYYY-MM-DD),
 * worked out by the page in UK time. A job counts as done only while doneOn
 * matches the current Friday, so the ticks clear themselves each week without
 * anything having to run — the assignments carry over.
 *
 * Each change carries the time it was made, and a save only overwrites a row
 * if it is at least as new, so two phones ticking at once end up agreeing.
 * Removing a job is a soft delete for the same reason. Because deleted rows
 * stay, the starting list below is only ever written into an empty table.
 */

import { json, authed } from "./api.js";

const DEFAULT_TASKS = [
  ["general-tidy", "General tidy"],
  ["change-bedding", "Change the bedding on both beds"],
  ["clean-bathroom", "Clean the bathroom"],
  ["clean-toilets-sink", "Clean both toilets and the bedroom sink"],
  ["clean-kitchen", "Clean the kitchen"],
  ["dust-surfaces", "Dust and wipe surfaces"],
  ["clean-fridge", "Clear out and clean the fridge"],
  ["hoover-sofa", "Hoover the sofa"],
  ["hoover-floors", "Hoover the floors"],
  ["take-out-bins", "Take out the bins"],
];

const OWNERS = ["ben", "jodie"];
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
       deleted_at  TEXT
     )`
  ).run();
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM cleaning_tasks`).first();
  if (!row || !row.n) {
    // Stamped long ago, so the first change from any phone wins even if its
    // clock runs a little behind the server's.
    const seeded = "2000-01-01T00:00:00.000Z";
    await env.DB.batch(DEFAULT_TASKS.map(([id, label], i) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO cleaning_tasks (id, label, owner, done_on, sort, updated_at)
         VALUES (?1, ?2, NULL, NULL, ?3, ?4)`
      ).bind(id, label, (i + 1) * 10, seeded)
    ));
  }
  tableReady = true;
}

async function liveTasks(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, label, owner, done_on, sort, updated_at FROM cleaning_tasks
     WHERE deleted_at IS NULL ORDER BY sort, label`
  ).all();
  return (results || []).map((r) => ({
    id: r.id, label: r.label, owner: r.owner, doneOn: r.done_on, sort: r.sort, updatedAt: r.updated_at,
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
  const stmt = env.DB.prepare(
    `INSERT INTO cleaning_tasks (id, label, owner, done_on, sort, updated_at, deleted_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label, owner = excluded.owner, done_on = excluded.done_on,
       sort = excluded.sort, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
     WHERE excluded.updated_at >= cleaning_tasks.updated_at`
  );
  const batch = [];
  for (const r of rows) {
    const id = r && typeof r.id === "string" ? r.id : "";
    const label = clip(r && r.label, 120);
    if (!ID.test(id) || !label) return json({ error: "Each job needs an id and a name" }, 400);
    const owner = OWNERS.includes(r.owner) ? r.owner : null;
    const doneOn = typeof r.doneOn === "string" && DAY.test(r.doneOn) ? r.doneOn : null;
    const sort = Number.isFinite(r.sort) ? Math.round(r.sort) : 0;
    // A clock that runs fast must not be able to lock a row against later changes.
    const updated = typeof r.updatedAt === "string" && r.updatedAt <= now ? r.updatedAt : now;
    batch.push(stmt.bind(id, label, owner, doneOn, sort, updated, r.deleted ? updated : null));
  }
  if (batch.length) await env.DB.batch(batch);
  return json({ saved: batch.length, tasks: await liveTasks(env) });
}
