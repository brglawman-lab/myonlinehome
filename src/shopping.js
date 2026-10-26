/* The shopping list at /admin/shopping/.
 *
 *   GET  /admin/api/shopping           signed in — every item on the list
 *   POST /admin/api/shopping           signed in — save items (array of rows, last write wins)
 *   POST /admin/api/shopping/add       signed in — add items, merging with ones already on the list
 *   GET  /admin/api/shopping/key       signed in — the voice key (made on first use)
 *   POST /admin/api/shopping/key       signed in — replace the voice key
 *   POST /admin/api/shopping/transcribe signed in — audio from the page's microphone → {text}
 *   POST /api/shopping/voice           voice key — add what was said
 *   GET  /api/shopping/voice           voice key — read the list back
 *
 * The list is private, so unlike recipes and sightings there is no public read.
 *
 * The page works offline: it keeps the list in localStorage, queues changes
 * made with no signal (a supermarket basement), and sends them when the signal
 * comes back. Each change carries the time it was made, and a save only
 * overwrites a row if it is newer, so two phones changing the list at once
 * end up agreeing. Removing an item is a soft delete for the same reason.
 *
 * /api/shopping/voice is for a Siri Shortcut (or an Android HTTP shortcut app),
 * which can't use the sign-in cookie. It takes a key in an Authorization:
 * Bearer header instead. The key only reaches the shopping list — nothing else
 * on the site accepts it — and it can be replaced from the page at any time.
 * Replies are plain text so the shortcut can speak them as they are.
 */

import { json, authed } from "./api.js";

let tablesReady = false;
async function ensureTables(env) {
  if (tablesReady) return;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS shopping_items (
         id          TEXT PRIMARY KEY,
         name        TEXT NOT NULL,
         qty         TEXT,
         recipe      TEXT,
         done        INTEGER NOT NULL DEFAULT 0,
         source      TEXT,
         created_at  TEXT NOT NULL,
         updated_at  TEXT NOT NULL,
         deleted_at  TEXT
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS site_settings (
         key        TEXT PRIMARY KEY,
         value      TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`
    ),
  ]);
  tablesReady = true;
}

const noDb = () => json({ error: "No database bound. See db/SETUP.md." }, 503);

const text = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

const newId = () => "item-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
const clip = (s, n) => (s == null ? null : String(s).trim().slice(0, n) || null);

/* What two items have to share to count as the same thing: "Eggs" and "egg",
 * "Butter beans" and "butter beans". */
export const sameKey = (name) =>
  String(name || "").toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, " ").replace(/\s+/g, " ").trim().replace(/oes$/, "o").replace(/s$/, "");

/* Turn something said or typed into items. "Add milk, eggs and bread to the
 * shopping list" → milk / eggs / bread. A few pairs that are one thing in a
 * shop ("salt and vinegar crisps") are kept whole. */
const KEEP_TOGETHER = [
  "salt and vinegar", "cheese and onion", "fish and chips", "mac and cheese", "macaroni and cheese",
  "sweet and sour", "sour cream and chive", "ham and cheese", "bread and butter", "oil and vinegar",
];
export function splitSpoken(input) {
  let s = String(input || "").replace(/\s+/g, " ").trim();
  s = s.replace(/^(please\s+)?(can you\s+)?(add|put|get|buy)\s+/i, "");
  s = s.replace(/\s+(to|on|onto)\s+(the|my|our)\s+(shopping\s+)?list[.!]?$/i, "");
  s = s.replace(/[.!?]+$/, "");
  KEEP_TOGETHER.forEach((p, i) => { s = s.replace(new RegExp(p, "gi"), (m) => m.replace(/ and /i, ` \u0001${i} `)); });
  return s
    .split(/\s*(?:,|;|\n|\band\b|&|\bplus\b)\s*/i)
    .map((x) => x.replace(/ \u0001\d+ /g, " and ").replace(/^(some|a|an)\s+/i, "").trim())
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .slice(0, 50);
}

const rowOut = (r) => ({
  id: r.id,
  name: r.name,
  qty: r.qty,
  recipe: r.recipe,
  done: Boolean(r.done),
  source: r.source,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function liveItems(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, qty, recipe, done, source, created_at, updated_at
       FROM shopping_items WHERE deleted_at IS NULL ORDER BY created_at ASC`
  ).all();
  return (results || []).map(rowOut);
}

export async function listShopping(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  await ensureTables(env);
  // Bought items that were cleared more than a fortnight ago are no use to anyone.
  await env.DB.prepare(`DELETE FROM shopping_items WHERE deleted_at IS NOT NULL AND deleted_at < ?`)
    .bind(new Date(Date.now() - 14 * 86400_000).toISOString()).run();
  return json(await liveItems(env));
}

/* Save rows exactly as the page has them. Each row says which version it was
 * based on (`base`, the updatedAt the page last had from here). If nothing
 * has changed since, the save wins outright — phone clocks drift, so they
 * can't be trusted for that. Only when the other phone got in first does the
 * time of each change decide, so a phone that was offline for an hour can't
 * undo what the other one did in the meantime. Saved rows are stamped with
 * this server's clock whenever the phone's is behind. */
export async function saveShopping(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  await ensureTables(env);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Body must be JSON" }, 400); }
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length > 300) return json({ error: "Too many items in one request" }, 413);

  const now = new Date().toISOString();
  const stmt = env.DB.prepare(
    `INSERT INTO shopping_items (id, name, qty, recipe, done, source, created_at, updated_at, deleted_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, qty = excluded.qty, recipe = excluded.recipe, done = excluded.done,
       updated_at = CASE WHEN excluded.updated_at > shopping_items.updated_at THEN excluded.updated_at ELSE ?10 END,
       deleted_at = CASE WHEN excluded.deleted_at IS NULL THEN NULL ELSE ?10 END
     WHERE excluded.updated_at >= shopping_items.updated_at OR shopping_items.updated_at = ?11`
  );
  const batch = [];
  for (const r of rows) {
    if (!r || !r.id || !clip(r.name, 200)) return json({ error: "Each item needs an id and a name" }, 400);
    const updated = typeof r.updatedAt === "string" && r.updatedAt <= now ? r.updatedAt : now;
    batch.push(stmt.bind(
      String(r.id).slice(0, 80), clip(r.name, 200), clip(r.qty, 120), clip(r.recipe, 400),
      r.done ? 1 : 0, clip(r.source, 20) || "web", r.createdAt || now, updated,
      r.deleted ? updated : null, now, typeof r.base === "string" ? r.base : ""
    ));
  }
  if (batch.length) await env.DB.batch(batch);
  return json({ saved: batch.length, items: await liveItems(env) });
}

/* Add items, folding each into one already on the list (and not yet bought)
 * when it's the same thing: the quantities are joined ("250g + 100g") and the
 * recipe names collected, so "what's this for?" still has an answer. */
async function addItems(env, items, source) {
  await ensureTables(env);
  const existing = (await liveItems(env)).filter((i) => !i.done);
  const byKey = new Map(existing.map((i) => [sameKey(i.name), i]));
  const now = new Date().toISOString();
  const writes = [];
  const added = [];
  const merged = [];

  for (const raw of items.slice(0, 100)) {
    const name = clip(raw && raw.name, 200);
    if (!name) continue;
    const qty = clip(raw.qty, 120);
    const recipe = clip(raw.recipe, 200);
    const key = sameKey(name);
    const hit = byKey.get(key);
    if (hit) {
      const qtys = [hit.qty, qty].filter(Boolean);
      const recipes = [...new Set([...(hit.recipe ? hit.recipe.split(" · ") : []), ...(recipe ? [recipe] : [])])];
      hit.qty = qtys.length ? qtys.join(" + ").slice(0, 120) : null;
      hit.recipe = recipes.length ? recipes.join(" · ").slice(0, 400) : null;
      writes.push(env.DB.prepare(`UPDATE shopping_items SET qty = ?, recipe = ?, updated_at = ? WHERE id = ?`)
        .bind(hit.qty, hit.recipe, now, hit.id));
      merged.push(hit.name);
    } else {
      const row = { id: newId(), name, qty, recipe };
      writes.push(env.DB.prepare(
        `INSERT INTO shopping_items (id, name, qty, recipe, done, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
      ).bind(row.id, name, qty, recipe, source, now, now));
      byKey.set(key, row);
      added.push(name);
    }
  }
  if (writes.length) await env.DB.batch(writes);
  return { added, merged };
}

export async function addShopping(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  let body;
  try { body = await request.json(); } catch { return json({ error: "Body must be JSON" }, 400); }
  const items = Array.isArray(body.items) ? body.items : [];
  const res = await addItems(env, items, clip(body.source, 20) || "recipe");
  return json({ ...res, items: await liveItems(env) });
}

/* ---------- the voice key ---------- */

const makeKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function readKey(env) {
  const row = await env.DB.prepare(`SELECT value FROM site_settings WHERE key = 'shopping_voice_key'`).first();
  return row ? row.value : null;
}

async function writeKey(env) {
  const key = makeKey();
  await env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('shopping_voice_key', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, new Date().toISOString()).run();
  return key;
}

export async function getVoiceKey(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  await ensureTables(env);
  return json({ key: (await readKey(env)) || (await writeKey(env)) });
}

export async function replaceVoiceKey(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  await ensureTables(env);
  return json({ key: await writeKey(env) });
}

/* Compare without leaking where the strings differ. */
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode("moh-shopping"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(String(s))))));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function voiceAllowed(request, env) {
  const header = request.headers.get("authorization") || "";
  const given = header.replace(/^Bearer\s+/i, "").trim();
  if (!given) return false;
  const key = await readKey(env);
  return Boolean(key) && (await sameSecret(given, key));
}

const sayList = (names) =>
  names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];

/* POST body can be JSON {text}, a form field called text, or plain text —
 * whichever the shortcut app finds easiest. */
async function spokenText(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const b = await request.json().catch(() => ({}));
    return String(b.text ?? b.item ?? b.items ?? "");
  }
  if (type.includes("multipart/form-data")) {
    const f = await request.formData().catch(() => null);
    return f ? String(f.get("text") || "") : "";
  }
  const raw = await request.text();
  if (type.includes("application/x-www-form-urlencoded")) {
    const p = new URLSearchParams(raw);
    // No field called text: the whole body was probably just the words.
    return p.has("text") ? String(p.get("text")) : [...p.keys()].join(" ");
  }
  return raw;
}

export async function voiceShopping(request, env) {
  if (!env.DB) return text("The shopping list isn't set up yet.", 503);
  await ensureTables(env);
  if (!(await voiceAllowed(request, env))) return text("That key isn't right. Copy it again from the shopping list page.", 401);

  if (request.method === "GET") {
    const toBuy = (await liveItems(env)).filter((i) => !i.done).map((i) => i.name);
    if (!toBuy.length) return text("The shopping list is empty.");
    return text(`${toBuy.length} thing${toBuy.length === 1 ? "" : "s"} on the list: ${sayList(toBuy)}.`);
  }

  const said = (await spokenText(request)).slice(0, 2000);
  const names = splitSpoken(said);
  if (!names.length) return text("I didn't catch anything to add.", 400);
  const { added, merged } = await addItems(env, names.map((name) => ({ name })), "voice");
  const all = [...added, ...merged];
  const extra = merged.length && !added.length ? " It was already on there." : "";
  return text(`Added ${sayList(all)} to the shopping list.${extra}`);
}

/* ---------- the page's microphone ----------
 *
 * The page records a few seconds of audio (webm/opus on Android, mp4 on an
 * iPhone) and posts it here. Workers AI's Whisper turns it into text, which
 * the page then splits into items exactly as it would typed text. No audio
 * is kept. The prompt nudges Whisper towards commas between items. */
const WHISPER = "@cf/openai/whisper-large-v3-turbo";
const MAX_AUDIO = 4 * 1024 * 1024;

function toBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export async function transcribeShopping(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.AI) return json({ error: "Speech-to-text isn't set up (no AI binding)." }, 503);
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.length < 500) return json({ error: "No audio" }, 400);
  if (audio.length > MAX_AUDIO) return json({ error: "That recording is too long" }, 413);
  try {
    const res = await env.AI.run(WHISPER, {
      audio: toBase64(audio),
      language: "en",
      vad_filter: true,
      initial_prompt: "Shopping list: milk, eggs, bread, butter beans, aubergine, Greek yoghurt, smoked mackerel.",
    });
    return json({ text: String((res && res.text) || "").trim() });
  } catch (err) {
    console.error("transcribe", err);
    return json({ error: "Couldn't transcribe: " + String(err && err.message ? err.message : err).slice(0, 200) }, 502);
  }
}
