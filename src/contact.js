/* Contact form.
 *
 *   POST /api/contact                 public — the form on /contact/
 *   GET  /private/api/contact         behind Cloudflare Access — read messages
 *   DEL  /private/api/contact/:id     behind Cloudflare Access
 *   (also at /admin/api/contact, behind the site's own sign-in)
 *
 * Messages go into the contact_messages table and are read on
 * /admin/messages/, so no email address is ever published. The table is
 * created on first use, so there is no migration to run (it is also listed in
 * db/schema.sql).
 *
 * Spam is kept down without third-party captchas: a hidden "website" field
 * that only bots fill in, a minimum time between the page loading and the form
 * being sent, and at most five messages an hour from one connection. The
 * connection is identified by a hash of the IP address and the date, so the
 * address itself is never stored. Messages older than a year are deleted, as
 * the privacy notice says.
 */

import { json, authed } from "./api.js";

const MAX = { name: 100, email: 200, message: 5000 };
const MIN_FILL_MS = 3000;
const PER_HOUR = 5;
const KEEP_DAYS = 365;

const noDb = () => json({ error: "No database bound. See db/SETUP.md." }, 503);

let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS contact_messages (
       id          TEXT PRIMARY KEY,
       name        TEXT,
       email       TEXT NOT NULL,
       message     TEXT NOT NULL,
       page        TEXT,
       sender_hash TEXT,
       created_at  TEXT NOT NULL
     )`
  ).run();
  tableReady = true;
}

async function senderHash(request) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  const day = new Date().toISOString().slice(0, 10);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|" + day));
  return [...new Uint8Array(bytes)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const clean = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

export async function createContactMessage(request, env) {
  if (!env.DB) return noDb();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  // Bots: answer as if it worked, store nothing.
  const startedAt = Number(body.startedAt);
  if (clean(body.website, 200) || !startedAt || Date.now() - startedAt < MIN_FILL_MS) {
    return json({ ok: true });
  }

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  const message = clean(body.message, MAX.message);
  const page = clean(body.page, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Please enter a valid email address so I can reply." }, 400);
  if (message.length < 2) return json({ error: "Please write a message." }, 400);

  await ensureTable(env);
  const hash = await senderHash(request);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM contact_messages WHERE sender_hash = ? AND created_at > ?`
  ).bind(hash, hourAgo).first();
  if (recent && recent.n >= PER_HOUR) {
    return json({ error: "That's a lot of messages in a short time — please try again later." }, 429);
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86400_000).toISOString();
  const id = `msg-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO contact_messages (id, name, email, message, page, sender_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, name || null, email, message, page || null, hash, now.toISOString()),
    env.DB.prepare(`DELETE FROM contact_messages WHERE created_at < ?`).bind(cutoff),
  ]);
  return json({ ok: true });
}

export async function listContactMessages(request, env) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  await ensureTable(env);
  const { results } = await env.DB.prepare(
    `SELECT id, name, email, message, page, created_at FROM contact_messages ORDER BY created_at DESC`
  ).all();
  return json(
    (results || []).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      message: r.message,
      page: r.page,
      createdAt: r.created_at,
    }))
  );
}

export async function deleteContactMessage(request, env, id) {
  if (!authed(request)) return json({ error: "Not authenticated" }, 401);
  if (!env.DB) return noDb();
  await ensureTable(env);
  await env.DB.prepare(`DELETE FROM contact_messages WHERE id = ?`).bind(id).run();
  return json({ deleted: id });
}
