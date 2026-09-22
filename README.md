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
| `/` | Landing page — just "Food" and "Photos" | authored here |
| `/food/` | Food dashboard — what's on, what's fresh, what's cooking, plus links into the pages below | authored here |
| `/photos/` | Photography hub — wildlife photography, work in progress | authored here |
| `/wildlife/` | Yorkshire Wildlife Tracker — 468-species checklist, county map, sighting log | from `brglawman-lab/YorkshireWildlife` |
| `/recipes/` | Recipe Book — 58 recipes | from `Desktop\Claude\Chef Claude` (canonical copy) |
| `/recipes/combinator/` | Meal Builder — pairs recipes into a meal | authored here |
| `/recipes/storage/` | Food Storage — ingredient storage lookup + room temperature/humidity monitor | authored here |
| `/wyfood/` | WY Farmer's Markets — West Yorkshire farmers markets and food festivals | from `Desktop\Claude\Farmers Market` |
| `/gallery/` | Wildlife Photography — portfolio gallery | authored here |
| `/assets/` | Photographs (Ben's own) and site favicon | — |

## Hosting

Static site served by Cloudflare Pages, connected to this repo. Every push to
`main` redeploys automatically. No build step — the files are served as-is.

## API

    GET  /api/sightings                  public
    GET  /api/custom-species             public
    GET  /api/recipes                    public
    GET  /api/recipes/deleted            public
    GET  /api/storage-rooms              public
    GET  /api/storage-readings           public
    POST /private/api/sightings          behind Cloudflare Access
    DEL  /private/api/sightings/:id      behind Cloudflare Access
    POST /private/api/custom-species     behind Cloudflare Access
    POST /private/api/recipes            behind Cloudflare Access
    DEL  /private/api/recipes/:id        behind Cloudflare Access
    POST /private/api/storage-rooms      behind Cloudflare Access
    DEL  /private/api/storage-rooms/:id  behind Cloudflare Access
    POST /private/api/storage-readings   behind Cloudflare Access
    DEL  /private/api/storage-readings/:id behind Cloudflare Access

The wildlife tracker is offline-first: the database is the source of truth,
localStorage is a cache, and writes made with no signal or no login are queued
and flushed automatically. See `db/SETUP.md` for the Cloudflare steps.

The recipe book works the same way. The 58 recipes in
`public/recipes/index.html` stay in the file as a seed — they render instantly
and work offline — and the database holds the overlay: recipes added through
the form, edits to seeded ones, and deletions. The database wins by id.
Deleting a seeded recipe writes a tombstone row, otherwise the seed would put
it straight back on the next load.

Every recipe shows storage and reheating advice for leftovers — either its own
`storage` field, or sensible category-based default guidance when it doesn't
have one (see `defaultStorageAdvice()` in `public/recipes/index.html`).

Food Storage (`/recipes/storage/`) has two tabs. **Ingredients** lists every
distinct ingredient across the book (same seed + database merge as the recipe
book) and matches it against a hand-written storage guide — general
food-safety guidance on how to store something once it's opened, not
product-specific advice. **Room Monitor** is for tracking real conditions:
named rooms (pantry, garage store, …) with logged temperature/humidity
readings, trend charts per room, and a CSV export for analysis outside the
site. It follows the same offline-first pattern as sightings and recipes.

The home page (`/`) is deliberately just two words — Food and Photos — that
split the site in two. `/food/` is a read-only dashboard: it scrapes
`/recipes/` and `/wyfood/` the same way the Meal Builder and Food Storage
pages do (fetch the page, lift a named array out of its `<script>`), reads
the public storage-rooms/readings API, and shows what's relevant right now —
markets this weekend, upcoming festivals, the latest recipe added, what's in
season, what's worth foraging, storage room conditions, and a "what to cook
tonight" shuffle — plus buttons into the recipe book, Meal Builder, Food
Storage and WY Farmer's Markets. `/photos/` carries the wildlife photography
and work-in-progress links that used to live on the home page. The recipe
book supports `#recipe-<id>` and `#seasonal`/`#foraging`/`#drinks` in its URL
so the dashboard's widgets can link straight into the right recipe or tab.

## Changes from the original sources

- WY Farmer's Markets: header logo image replaced with a text wordmark and the header
  background image removed — `images/wylogo1.png` and `images/header-hills2.png`
  no longer exist anywhere. Favicon repointed to `/assets/favicon.svg`.
- All three sub-pages: a small fixed "Home" link added at top-left.
