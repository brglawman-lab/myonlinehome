# myonlinehome

Source for **myonlinehome.co.uk** — Ben Lawman's personal site.

## Repository layout

    wrangler.toml   Worker config — assets directory, D1 binding
    src/            the Worker: src/index.js routes, src/api.js handles
    public/         everything served as a static file
    db/             schema.sql and the Cloudflare setup instructions (not served)

This is a **Worker with static assets**, not a classic Pages project. There is
no "build output directory" setting and the Pages `functions/` convention does
not apply — routing is in `src/index.js`. The dashboard deploy command is
`npx wrangler deploy`, which reads `wrangler.toml`.

## URL layout

| Path | What it is | Source |
|---|---|---|
| `/` | Landing page | authored here |
| `/wildlife/` | Yorkshire Wildlife Tracker — 468-species checklist, county map, sighting log | from `brglawman-lab/YorkshireWildlife` |
| `/recipes/` | Chef Claude recipe book — 51 recipes | from `Desktop\Claude\Chef Claude` (canonical copy) |
| `/wyfood/` | WY Food — West Yorkshire farmers markets and food festivals | from `Desktop\Claude\Farmers Market` |
| `/assets/` | Photographs (Ben's own) and site favicon | — |

## Hosting

Static site served by Cloudflare Pages, connected to this repo. Every push to
`main` redeploys automatically. No build step — the files are served as-is.

## API

    GET  /api/sightings              public
    GET  /api/custom-species         public
    POST /private/api/sightings      behind Cloudflare Access
    DEL  /private/api/sightings/:id  behind Cloudflare Access
    POST /private/api/custom-species behind Cloudflare Access

The wildlife tracker is offline-first: the database is the source of truth,
localStorage is a cache, and writes made with no signal or no login are queued
and flushed automatically. See `db/SETUP.md` for the Cloudflare steps.

The recipe book still uses `localStorage` for recipes added through its form —
the `recipes` table exists but the client is not wired up yet.

## Changes from the original sources

- WY Food: header logo image replaced with a text wordmark and the header
  background image removed — `images/wylogo1.png` and `images/header-hills2.png`
  no longer exist anywhere. Favicon repointed to `/assets/favicon.svg`.
- All three sub-pages: a small fixed "Home" link added at top-left.
