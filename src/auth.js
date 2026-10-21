/* Sign-in for the owner's area at /admin/.
 *
 *   POST /api/signin    public — {username, password} → sets the session cookie
 *   POST /api/signout   public — clears it
 *   GET  /api/session   public — {signedIn, configured}
 *
 * There is one account. Its password is the ADMIN_PASSWORD secret (and,
 * optionally, its username is ADMIN_USERNAME) set in the Cloudflare dashboard —
 * nothing about it is in the repo. The sign-in page is an ordinary
 * username/password form so Chrome's password manager saves it, and it uses
 * the Credential Management API so Chrome can sign straight in next time.
 *
 * The session is a signed cookie, not a database row: the expiry time plus an
 * HMAC of it, keyed on SESSION_SECRET (or, if that isn't set, on the password
 * itself — so changing the password signs every device out).
 *
 * Failed attempts are limited to ten an hour per connection, counted in D1
 * against a hash of the IP address and the date, the same way the contact
 * form does it, so the address itself is never stored.
 */

import { json } from "./api.js";

const COOKIE = "moh_session";
const SESSION_DAYS = 30;
const FAILS_PER_HOUR = 10;

const enc = new TextEncoder();

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

/* Compare two strings without leaking where they differ: HMAC both so the
 * lengths match, then compare every byte. */
async function sameSecret(a, b) {
  const salt = "moh-compare";
  const [x, y] = await Promise.all([hmac(salt, String(a)), hmac(salt, String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const signingKey = (env) => env.SESSION_SECRET || "moh-session:" + env.ADMIN_PASSWORD;

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

export async function isSignedIn(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const token = readCookie(request, COOKIE);
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = b64url(await hmac(signingKey(env), "v1." + exp));
  return sameSecret(sig, expected);
}

async function sessionCookie(env) {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const sig = b64url(await hmac(signingKey(env), "v1." + exp));
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

const clearedCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/* A browser always sends Origin on a cross-site POST/DELETE. If it is there it
 * must be this site; SameSite=Lax on the cookie is the other half of this. */
export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS signin_failures (
       sender_hash TEXT NOT NULL,
       created_at  TEXT NOT NULL
     )`
  ).run();
  tableReady = true;
}

async function senderHash(request) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  const day = new Date().toISOString().slice(0, 10);
  const bytes = await crypto.subtle.digest("SHA-256", enc.encode("signin|" + ip + "|" + day));
  return b64url(bytes).slice(0, 16);
}

export async function signIn(request, env) {
  if (!sameOrigin(request)) return json({ error: "Cross-site request refused" }, 403);
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "Sign-in isn't set up yet: add an ADMIN_PASSWORD secret in Cloudflare (see db/SETUP.md)." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const username = String(body.username ?? "").trim().slice(0, 200);
  const password = String(body.password ?? "").slice(0, 500);

  let hash = null;
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  if (env.DB) {
    await ensureTable(env);
    hash = await senderHash(request);
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM signin_failures WHERE sender_hash = ? AND created_at > ?`
    ).bind(hash, hourAgo).first();
    if (recent && recent.n >= FAILS_PER_HOUR) {
      return json({ error: "Too many wrong attempts — try again in an hour." }, 429);
    }
  }

  const userOk = !env.ADMIN_USERNAME || (await sameSecret(username.toLowerCase(), String(env.ADMIN_USERNAME).trim().toLowerCase()));
  const passOk = await sameSecret(password, env.ADMIN_PASSWORD);
  if (!userOk || !passOk) {
    if (env.DB && hash) {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO signin_failures (sender_hash, created_at) VALUES (?, ?)`).bind(hash, new Date().toISOString()),
        env.DB.prepare(`DELETE FROM signin_failures WHERE created_at < ?`).bind(hourAgo),
      ]);
    }
    return json({ error: "That username and password don't match." }, 401);
  }

  if (env.DB) await env.DB.prepare(`DELETE FROM signin_failures WHERE created_at < ?`).bind(hourAgo).run();

  const res = json({ ok: true });
  res.headers.append("set-cookie", await sessionCookie(env));
  return res;
}

export function signOut(request) {
  if (!sameOrigin(request)) return json({ error: "Cross-site request refused" }, 403);
  const res = json({ ok: true });
  res.headers.append("set-cookie", clearedCookie);
  return res;
}

export async function sessionStatus(request, env) {
  return json({ signedIn: await isSignedIn(request, env), configured: Boolean(env.ADMIN_PASSWORD) });
}
