/* Wildlife Photography gallery — photos added and removed through /admin/photos/.
 *
 *   GET  /api/gallery                        public — {added, removed}
 *   GET  /api/gallery/image/:id              public — the JPEG itself
 *   POST /admin/api/gallery                  signed in — multipart upload
 *   DEL  /admin/api/gallery/:id              signed in — remove from the gallery
 *   POST /admin/api/gallery/:id/restore      signed in — undo a removal
 *
 * Same seed + overlay idea as the recipe book. The photos committed in
 * public/gallery/photos/ and listed in PHOTOS in public/gallery/index.html are
 * the seed. This table holds the overlay: photos uploaded through the site
 * (the image bytes are stored in the row — D1 is already bound, so there is no
 * extra storage to set up), and tombstone rows for seed photos that have been
 * removed, otherwise the seed would put them straight back.
 *
 * The browser resizes a photo to about 2000px on the long edge before upload,
 * so a row stays well under D1's 2 MB limit. The table is created on first use.
 */

import { json, authed } from "./api.js";

const MAX_BYTES = 1_900_000;
const MAX = { title: 120, species: 120, location: 160, camera: 120, caption: 600, tag: 40 };

const noDb = () => json({ error: "No database bound. See db/SETUP.md." }, 503);

let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS gallery_photos (
       id          TEXT PRIMARY KEY,
       title       TEXT,
       species     TEXT,
       tags        TEXT,
       location    TEXT,
       date        TEXT,
       camera      TEXT,
       caption     TEXT,
       size        TEXT,
       focus       TEXT,
       mime        TEXT,
       data        BLOB,
       width       INTEGER,
       height      INTEGER,
       seed        INTEGER NOT NULL DEFAULT 0,
       created_at  TEXT NOT NULL,
       deleted_at  TEXT
     )`
  ).run();
  tableReady = true;
}

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/* "x% y%", both 0–100. Anything else falls back to the middle. */
function cleanFocus(v) {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)%?\s+(\d{1,3}(?:\.\d+)?)%?\s*$/.exec(String(v ?? ""));
  if (!m) return "50% 50%";
  const c = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));
  return `${c(m[1])}% ${c(m[2])}%`;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function listGallery(env) {
  if (!env.DB) return noDb();
  await ensureTable(env);
  const { results } = await env.DB.prepare(
    `SELECT id, title, species, tags, location, date, camera, caption, size, focus, width, height, seed, created_at, deleted_at
       FROM gallery_photos
      ORDER BY created_at DESC`
  ).all();

  const added = [];
  const removed = [];
  for (const r of results || []) {
    if (r.deleted_at) {
      removed.push({ id: r.id, seed: Boolean(r.seed), title: r.title, removedAt: r.deleted_at });
      continue;
    }
    if (r.seed) continue;
    let tags = [];
    try { tags = JSON.parse(r.tags || "[]"); } catch { /* leave empty */ }
    const p = {
      id: r.id,
      src: `/api/gallery/image/${encodeURIComponent(r.id)}`,
      title: r.title || "",
      species: r.species || "",
      tags: Array.isArray(tags) ? tags : [],
      location: r.location || "",
      date: r.date || "",
      caption: r.caption || "",
      focus: r.focus || "50% 50%",
      width: r.width,
      height: r.height,
      uploaded: true,
      addedAt: r.created_at,
    };
    if (r.camera) p.camera = r.camera;
    if (r.size === "wide") p.size = "wide";
    added.push(p);
  }
  return json({ added, removed });
}

export async function galleryImage(env, id) {
  if (!env.DB) return noDb();
  await ensureTable(env);
  const row = await env.DB.prepare(
    `SELECT data, mime FROM gallery_photos WHERE id = ? AND deleted_at IS NULL AND seed = 0`
  ).bind(id).first();
  if (!row || !row.data) return new Response("Not found", { status: 404 });
  const bytes = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data);
  return new Response(bytes, {
    headers: {
      "content-type": row.mime || "image/jpeg",
      // An id is never reused for a different picture, so it can be cached for good.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

export async function uploadGalleryPhoto(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Send the photo as multipart/form-data" }, 400);
  }
  const file = form.get("photo");
  if (!file || typeof file === "string") return json({ error: "No photo attached" }, 400);
  const mime = file.type || "image/jpeg";
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return json({ error: "The photo must be a JPEG, PNG or WebP" }, 415);
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return json({ error: "That photo is too large to store — it should be under 1.9 MB after resizing." }, 413);
  }

  const title = clean(form.get("title"), MAX.title);
  if (!title) return json({ error: "Give the photo a title" }, 400);
  const species = clean(form.get("species"), MAX.species);
  let tags = [];
  try { tags = JSON.parse(String(form.get("tags") || "[]")); } catch { /* none */ }
  tags = (Array.isArray(tags) ? tags : []).map((t) => slug(clean(t, MAX.tag))).filter(Boolean).slice(0, 6);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(form.get("date") || "")) ? String(form.get("date")) : "";
  const width = Math.round(Number(form.get("width"))) || null;
  const height = Math.round(Number(form.get("height"))) || null;

  await ensureTable(env);
  const id = `${slug(title) || "photo"}-${Date.now().toString(36)}`;
  await env.DB.prepare(
    `INSERT INTO gallery_photos
       (id, title, species, tags, location, date, camera, caption, size, focus, mime, data, width, height, seed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).bind(
    id,
    title,
    species || null,
    JSON.stringify(tags),
    clean(form.get("location"), MAX.location) || null,
    date || null,
    clean(form.get("camera"), MAX.camera) || null,
    clean(form.get("caption"), MAX.caption) || null,
    form.get("size") === "wide" ? "wide" : null,
    cleanFocus(form.get("focus")),
    mime,
    bytes,
    width,
    height,
    new Date().toISOString()
  ).run();

  return json({ saved: 1, id, src: `/api/gallery/image/${encodeURIComponent(id)}` });
}

export async function removeGalleryPhoto(request, env, id) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  if (!id) return json({ error: "Missing id" }, 400);
  await ensureTable(env);

  const now = new Date().toISOString();
  let title = null;
  try { title = clean((await request.json()).title, MAX.title) || null; } catch { /* no body is fine */ }

  // An uploaded photo has a row: mark it removed. A seed photo has none, so it
  // gets a tombstone row — the client drops any seed photo listed in `removed`.
  await env.DB.prepare(
    `INSERT INTO gallery_photos (id, title, seed, created_at, deleted_at)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at`
  ).bind(id, title, now, now).run();

  return json({ removed: 1, id });
}

export async function restoreGalleryPhoto(request, env, id) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  if (!id) return json({ error: "Missing id" }, 400);
  await ensureTable(env);

  // A seed photo's tombstone is just deleted; an uploaded photo comes back.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM gallery_photos WHERE id = ? AND seed = 1`).bind(id),
    env.DB.prepare(`UPDATE gallery_photos SET deleted_at = NULL WHERE id = ? AND seed = 0`).bind(id),
  ]);
  return json({ restored: 1, id });
}
