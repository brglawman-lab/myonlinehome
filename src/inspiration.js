/* Inspiration — a handful of recipes recently published by UK food sites.
 *
 *   GET /api/inspiration   public, cached for three hours
 *
 * Reads each site's public RSS feed on the server (browsers can't, because of
 * CORS), keeps only real recipes, and returns the headline, the site's own
 * one-paragraph summary, a picture and a link back. Nothing is copied beyond
 * what the feed itself publishes for syndication; the full recipe stays on
 * the publisher's site.
 *
 * To add or drop a site, edit SOURCES. Each `isRecipe` filters out articles,
 * collections and paywalled pages, which the feeds mix in with recipes.
 */

import { json } from "./api.js";

const PER_SOURCE = 4;
const CACHE_SECONDS = 3 * 60 * 60;
const PARTIAL_CACHE_SECONDS = 15 * 60;

const SOURCES = [
  {
    id: "guardian",
    name: "The Guardian",
    site: "https://www.theguardian.com/food",
    feed: "https://www.theguardian.com/tone/recipes/rss",
    // The tone feed also carries the odd advice column; recipe headlines say so.
    isRecipe: (it) => /recipe/i.test(it.title),
    // "… recipe for fritters | Quick and easy" — drop the series name.
    cleanTitle: (t) => t.replace(/\s+\|\s+[^|]+$/, ""),
  },
  {
    id: "bbcgoodfood",
    name: "BBC Good Food",
    site: "https://www.bbcgoodfood.com",
    feed: "https://www.bbcgoodfood.com/recipes/feed",
    isRecipe: (it) =>
      /\/recipes\//.test(it.link) && !/\/(collection|premium)\//.test(it.link) &&
      !it.categories.some((c) => /podcast/i.test(c)),
  },
  {
    id: "olive",
    name: "olive",
    site: "https://www.olivemagazine.com",
    feed: "https://www.olivemagazine.com/recipes/feed/",
    isRecipe: (it) => /\/recipes\//.test(it.link) && !/\/collection\//.test(it.link),
  },
];

/* ---------- a deliberately small RSS reader ---------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]).trim() : "";
};

const plainText = (html) =>
  decode(html)
    .replace(/<a\b[^>]*>\s*Continue reading[\s\S]*?<\/a>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const shorten = (s, max) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:–—-]$/, "") + "…";
};

/* The biggest picture the item offers. Guardian items list several sizes
 * (their URLs are signed, so they can't be resized); Immediate Media's image
 * server (BBC Good Food, olive) takes a resize parameter. */
function pickImage(xml) {
  let best = null;
  for (const m of xml.matchAll(/<(?:media:content|media:thumbnail|enclosure)\b([^>]*)>/gi)) {
    const url = (m[1].match(/\burl="([^"]+)"/) || [])[1];
    if (!url) continue;
    const width = Number((m[1].match(/\bwidth="(\d+)"/) || [])[1] || (url.match(/[?&]width=(\d+)/) || [])[1] || 0);
    if (!best || width > best.width) best = { url: decode(url), width };
  }
  if (!best) return null;
  if (best.url.includes("images.immediate.co.uk") && !best.url.includes("?")) return best.url + "?quality=80&resize=640,480";
  return best.url;
}

function parseFeed(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, it]) => {
    const pub = tag(it, "pubDate");
    return {
      categories: [...it.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => decode(m[1]).trim()),
      title: plainText(tag(it, "title")),
      link: tag(it, "link"),
      summary: shorten(plainText(tag(it, "description")), 240),
      image: pickImage(it),
      published: pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : null,
    };
  });
}

async function readSource(src) {
  try {
    const res = await fetch(src.feed, {
      headers: { "user-agent": "myonlinehome.co.uk inspiration reader", accept: "application/rss+xml, text/xml" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text())
      .filter((it) => it.title && /^https:\/\//.test(it.link) && src.isRecipe(it))
      .slice(0, PER_SOURCE)
      .map(({ categories, ...it }) => (src.cleanTitle ? { ...it, title: src.cleanTitle(it.title) } : it));
    return { id: src.id, name: src.name, site: src.site, items };
  } catch (err) {
    console.warn("Inspiration feed failed", src.id, err);
    return { id: src.id, name: src.name, site: src.site, items: [], error: "Could not reach this site just now." };
  }
}

export async function getInspiration(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/inspiration", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const sources = await Promise.all(SOURCES.map(readSource));
  const res = json({ fetchedAt: new Date().toISOString(), sources });

  // Cache a full answer for hours, a partial one (a site was down) for a few
  // minutes, and nothing at all if every site failed.
  if (sources.some((s) => s.items.length)) {
    const seconds = sources.every((s) => s.items.length) ? CACHE_SECONDS : PARTIAL_CACHE_SECONDS;
    const cached = new Response(res.clone().body, res);
    cached.headers.set("cache-control", `public, max-age=${seconds}`);
    ctx.waitUntil(cache.put(key, cached));
  }
  return res;
}
