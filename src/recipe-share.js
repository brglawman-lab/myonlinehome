/* Shareable recipe links: /recipes/r/<id>
 *
 * The recipe book opens a recipe from /recipes/#recipe-<id>, but the part after
 * the # never reaches the server, so a link like that previews in WhatsApp,
 * iMessage, Slack and so on as the generic recipe book. This address carries
 * the id in the path instead.
 *
 * - Link-preview crawlers get a small page with Open Graph tags: the recipe's
 *   title, description and main photo.
 * - Everyone else is redirected straight to /recipes/#recipe-<id>.
 * - An unknown or deleted recipe goes to /recipes/.
 *
 * The recipe is looked up the same way the recipe book does it: the database
 * overlay wins (including deletions), otherwise the seed in recipes.json. A
 * database row with no photos of its own (image NULL) keeps the seed's photos.
 */

/* Crawlers that fetch a link to build a preview. iMessage identifies itself as
 * "facebookexternalhit … Twitterbot", so it is covered by those. A crawler not
 * on this list just gets the redirect — a generic preview, as before. */
const PREVIEW_BOTS =
  /facebookexternalhit|facebot|twitterbot|whatsapp|slackbot|slack-imgproxy|linkedinbot|discordbot|telegrambot|skypeuripreview|applebot|googlebot|bingbot|duckduckbot|yandexbot|redditbot|pinterest|embedly|vkshare|mastodon|cardyb|iframely|linkpreview/i;

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

function photosFrom(raw) {
  if (raw == null || raw === "") return null;
  const t = String(raw).trim();
  if (t.startsWith("[")) {
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return v.filter((p) => p && typeof p.src === "string" && p.src);
    } catch {
      /* a plain URL after all */
    }
  }
  return [{ src: t }];
}

async function seedRecipe(env, url, id) {
  try {
    const res = await env.ASSETS.fetch(new Request(new URL("/recipes/recipes.json", url)));
    if (!res.ok) return null;
    const list = await res.json();
    return Array.isArray(list) ? list.find((r) => r && r.id === id) || null : null;
  } catch {
    return null;
  }
}

async function findRecipe(env, url, id) {
  const seed = await seedRecipe(env, url, id);
  const seedPhotos = seed ? (Array.isArray(seed.photos) ? seed.photos : seed.image ? [{ src: seed.image }] : []) : [];
  let row = null;
  if (env.DB) {
    try {
      row = await env.DB.prepare(
        "SELECT title, description, serves, time, image, deleted_at FROM recipes WHERE id = ?"
      ).bind(id).first();
    } catch {
      row = null; // no database: fall back to the file alone
    }
  }
  if (row) {
    if (row.deleted_at) return null;
    const own = photosFrom(row.image);
    return {
      title: row.title || (seed && seed.title),
      description: row.description || (seed && seed.description),
      serves: row.serves || (seed && seed.serves),
      time: row.time || (seed && seed.time),
      photos: own === null ? seedPhotos : own,
    };
  }
  if (!seed) return null;
  return { title: seed.title, description: seed.description, serves: seed.serves, time: seed.time, photos: seedPhotos };
}

function previewPage(r, shareUrl, bookUrl, imageUrl) {
  const facts = [r.serves && r.serves !== "—" ? "Serves " + r.serves : "", r.time && r.time !== "—" ? r.time : ""]
    .filter(Boolean)
    .join(" · ");
  const desc = r.description || (facts ? facts + ". " : "") + "A recipe from Chef Claude.";
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.title)} — Chef Claude</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(shareUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Chef Claude · My Online Home">
<meta property="og:title" content="${esc(r.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(shareUrl)}">
${imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}">\n<meta property="og:image:alt" content="${esc(r.title)}">\n` : ""}<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(r.title)}">
<meta name="twitter:description" content="${esc(desc)}">
${imageUrl ? `<meta name="twitter:image" content="${esc(imageUrl)}">\n` : ""}<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#2a2622;background:#faf7f2}a{color:#2d4a3e}</style>
</head>
<body>
<h1>${esc(r.title)}</h1>
${facts ? `<p>${esc(facts)}</p>\n` : ""}<p>${esc(desc)}</p>
<p><a href="${esc(bookUrl)}">Open the recipe</a></p>
</body>
</html>
`;
}

export async function shareRecipe(request, env, id) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  const r = id ? await findRecipe(env, url, id) : null;
  if (!r) return Response.redirect(new URL("/recipes/", url).toString(), 302);

  const bookUrl = new URL("/recipes/#recipe-" + encodeURIComponent(id), url).toString();
  const ua = request.headers.get("user-agent") || "";
  if (!PREVIEW_BOTS.test(ua)) {
    const res = new Response(null, { status: 302, headers: { location: bookUrl } });
    res.headers.set("cache-control", "no-store");
    return res;
  }

  const shareUrl = new URL("/recipes/r/" + encodeURIComponent(id), url).toString();
  const main = r.photos && r.photos[0];
  let imageUrl = null;
  if (main && main.src) {
    try {
      imageUrl = new URL(main.src, url).toString();
    } catch {
      imageUrl = null;
    }
  }
  const html = previewPage(r, shareUrl, bookUrl, imageUrl);
  return new Response(method === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex",
      vary: "user-agent",
    },
  });
}
