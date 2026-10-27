/* Bin day, for the signed-in view of /dashboard/.
 *
 *   GET  /admin/api/bins                     signed in — the saved address and its next collections
 *   GET  /admin/api/bins/addresses?postcode= signed in — Leeds addresses at a postcode, to pick from
 *   POST /admin/api/bins/address             signed in — {uprn, address}: save the address to use
 *
 * The dates come from Leeds City Council: the same API its own "Check your bin
 * day" page (leeds.gov.uk/bins-and-recycling/check-your-bin-day) calls from the
 * browser. Two endpoints under https://api.leeds.gov.uk/public/:
 *
 *   addresses/v1/addresses?query=<postcode>              → [{uprn, displayAddress, lpiKey, …}]
 *   waste/v1/BinsDays?uprn=&startDate=&endDate=          → [{date, type}]
 *
 * `type` is Black, Green, Brown, or BrownFoodGardenCombined (the council's own
 * page already handles that last one, ahead of food-waste collections).
 * Black and Green alternate week by week; Brown runs on its own day and stops
 * over the winter.
 *
 * The API wants a subscription key in a header. It is not a secret — it is
 * published in the council's page script, which every visitor downloads — but
 * it may change. So the key used is, in order: the LEEDS_BINS_KEY variable if
 * one is set in Cloudflare, a key read from the council's script since, or the
 * one below. On a 401/403 the Worker re-reads the council's script once and
 * tries again with whatever key is in it now.
 *
 * The address is kept in D1 (site_settings), never in this repository, which
 * is public. Responses are cached for six hours per address.
 */

import { json } from "./api.js";

const API = "https://api.leeds.gov.uk/public/";
const COUNCIL_SCRIPT = "https://shared-frontends.leeds.gov.uk/CheckYourBinDay/dist/dist/assets/index.js";
const DEFAULT_KEY = "ad8dd80444fe45fcad376f82cf9a5ab4"; // from COUNCIL_SCRIPT, October 2026
const CACHE_SECONDS = 6 * 3600;
const WEEKS_AHEAD = 26; // long enough to see past the brown bin's winter break

let scrapedKey = null;

let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS site_settings (
       key        TEXT PRIMARY KEY,
       value      TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  tableReady = true;
}

async function readKeyFromCouncilScript() {
  try {
    const res = await fetch(COUNCIL_SCRIPT, { cf: { cacheTtl: 3600 } });
    if (!res.ok) return null;
    const m = (await res.text()).match(/apiKey:"([0-9a-f]{32})"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function council(env, pathAndQuery) {
  const call = (key) =>
    fetch(API + pathAndQuery, { headers: { "Ocp-Apim-Subscription-Key": key, accept: "application/json" } });

  let key = env.LEEDS_BINS_KEY || scrapedKey || DEFAULT_KEY;
  let res = await call(key);
  if ((res.status === 401 || res.status === 403) && !env.LEEDS_BINS_KEY) {
    const fresh = await readKeyFromCouncilScript();
    if (fresh && fresh !== key) {
      scrapedKey = fresh;
      res = await call(fresh);
    }
  }
  if (!res.ok) throw new Error("Leeds City Council returned HTTP " + res.status);
  return res.json();
}

/* Today in the UK, as YYYY-MM-DD — the Worker itself runs on UTC. */
function ukToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function getSetting(env, key) {
  const row = await env.DB.prepare(`SELECT value FROM site_settings WHERE key = ?`).bind(key).first();
  return row ? row.value : null;
}

const BIN_TYPES = { Black: "black", Green: "green", Brown: "brown", BrownFoodGardenCombined: "brown" };

/* GET /admin/api/bins */
export async function getBins(env, ctx) {
  if (!env.DB) return json({ error: "No database bound." }, 503);
  await ensureTable(env);
  const uprn = await getSetting(env, "bins.uprn");
  if (!uprn) return json({ configured: false });
  const address = (await getSetting(env, "bins.address")) || "";

  const today = ukToday();
  const cacheKey = new Request("https://bins.cache.myonlinehome/" + encodeURIComponent(uprn) + "/" + today);
  const cache = caches.default;
  let schedule = null;
  const hit = await cache.match(cacheKey);
  if (hit) schedule = await hit.json();

  if (!schedule) {
    const q = new URLSearchParams({ uprn, startDate: today, endDate: addDays(today, WEEKS_AHEAD * 7) });
    let raw;
    try {
      raw = await council(env, "waste/v1/BinsDays?" + q);
    } catch (e) {
      return json({ configured: true, address, error: String(e.message || e) }, 502);
    }
    schedule = (Array.isArray(raw) ? raw : [])
      .map((c) => ({ date: String(c.date || "").slice(0, 10), type: String(c.type || ""), bin: BIN_TYPES[c.type] || null }))
      .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.bin && c.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const store = new Response(JSON.stringify(schedule), { headers: { "cache-control": "max-age=" + CACHE_SECONDS } });
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, store));
    else await cache.put(cacheKey, store);
  }

  const nextMain = schedule.find((c) => c.bin === "black" || c.bin === "green") || null;
  const nextBrown = schedule.find((c) => c.bin === "brown") || null;
  return json({
    configured: true,
    address,
    today,
    nextMain,
    nextBrown,
    upcoming: schedule.slice(0, 12),
    source: "Leeds City Council",
    sourceUrl: "https://www.leeds.gov.uk/bins-and-recycling/check-your-bin-day",
  });
}

/* GET /admin/api/bins/addresses?postcode=LS16… */
export async function findAddresses(request, env) {
  const raw = new URL(request.url).searchParams.get("postcode") || "";
  const postcode = raw.toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(postcode)) {
    return json({ error: "That doesn't look like a postcode." }, 400);
  }
  const spaced = postcode.slice(0, -3) + " " + postcode.slice(-3);
  let rows;
  try {
    rows = await council(env, "addresses/v1/addresses?query=" + encodeURIComponent(spaced));
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
  // The council's page keeps only addresses whose lpiKey starts 4720L — the
  // ones Leeds collects from. Do the same.
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => String(r.lpiKey || "").startsWith("4720L") && r.uprn)
    .map((r) => ({ uprn: String(r.uprn), address: String(r.displayAddress || "").trim() }));
  if (!list.length) return json({ error: "Leeds City Council has no bin collections listed at that postcode." }, 404);
  return json(list);
}

/* POST /admin/api/bins/address  {uprn, address} */
export async function saveAddress(request, env) {
  if (!env.DB) return json({ error: "No database bound." }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const uprn = String(body.uprn || "").trim();
  const address = String(body.address || "").trim().slice(0, 300);
  if (!/^\d{1,15}$/.test(uprn)) return json({ error: "That isn't a valid property reference." }, 400);
  await ensureTable(env);
  const now = new Date().toISOString();
  const put = `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;
  await env.DB.batch([
    env.DB.prepare(put).bind("bins.uprn", uprn, now),
    env.DB.prepare(put).bind("bins.address", address, now),
  ]);
  return json({ ok: true });
}
