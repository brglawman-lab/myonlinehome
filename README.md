# myonlinehome

Source for **myonlinehome.co.uk**, a personal site. The site itself deliberately shows no owner name or email address; visitors use the contact form.

## Repository layout

    wrangler.toml   Worker config — assets directory, D1 binding
    src/            the Worker: src/index.js routes; api.js, gallery.js, contact.js,
                    auth.js (the sign-in) and inspiration.js handle
    public/         everything served as a static file
    db/             schema.sql and the Cloudflare setup instructions (not served)

This is a **Worker with static assets**, not a classic Pages project. There is
no "build output directory" setting and the Pages `functions/` convention does
not apply — routing is in `src/index.js`. The dashboard deploy command is
`npx wrangler deploy`, which reads `wrangler.toml`.

`run_worker_first` in `wrangler.toml` lists the paths the Worker sees before
the static files: `/admin/*` (so it can check the sign-in), `/api/*` and
`/private/*`. **A path not on that list never reaches the Worker** — a new API
prefix has to be added there or it will just get the 404 page.

## URL layout

| Path | What it is | Source |
|---|---|---|
| `/` | Landing page — "Food" (→ `/recipes/`), "Photos" (→ `/gallery/`) and a smaller "Dashboard"; Contact, Privacy, Site map and Sign in in the footer | authored here |
| `/contact/` | Contact form. Messages are stored in D1 (`contact_messages`) and read at `/admin/messages/` — no email address is published | authored here |
| `/sitemap/` | Site map — every page and endpoint grouped by who can reach it, with a link checker. Public. **Add new pages to its list** | authored here |
| `/signin/` | Sign-in for the owner. A normal username/password form so Chrome's password manager saves it, plus the Credential Management API so Chrome signs straight in next time. Goes to `/admin/` | authored here |
| `/admin/` | The owner's area, behind the sign-in: **Photos** (`/admin/photos/` — upload to and remove from the gallery), **Recipes** (`/admin/recipes/` — delete here; add and edit open the recipe book's own form), the **Shopping list** (`/admin/shopping/`), the **Room storage tracker** (`/admin/storage/`), **Messages** (`/admin/messages/`) and **The Cookbook** (`/admin/cookbook/`). The old `/private/` addresses redirect here | authored here |
| `/privacy/` | Privacy notice. Update it if the site starts collecting anything new or loads a new third-party service | authored here |
| `/dashboard/` | Food dashboard — what's on, what's fresh, what's cooking, plus links into the pages below (`/food/` redirects here) | authored here |
| `/admin/cookbook/` | The Cookbook — the recipe book typeset as a page-turning book, built live from `/recipes/`. Work in progress: behind the sign-in and not linked from any public page (reach it from `/admin/`) | authored here |
| `/photos/` | Photography hub — wildlife photography, work in progress | authored here |
| `/wildlife/` | Yorkshire Wildlife Tracker — 468-species checklist, county map, sighting log | from `brglawman-lab/YorkshireWildlife` |
| `/recipes/` | Recipe Book — 65+ recipes, with photos in `public/recipes/photos/`. The row of big buttons under the header on it and its sub-pages comes from `public/assets/recipe-nav.js` — change destinations there, not in the pages | from `Desktop\Claude\Chef Claude` (canonical copy) |
| `/recipes/inspiration/` | Inspiration — a handful of recipes recently published by The Guardian, BBC Good Food and olive, read from their RSS feeds by `/api/inspiration` (`src/inspiration.js`) and cached for 3 hours | authored here |
| `/recipes/combinator/` | Meal Builder — pairs recipes into a meal | authored here |
| `/recipes/jodie/` | What does Jodie want to eat? — a mood board of up to 5 picks (chicken, spicy, really hungry, healthy, …) that ranks mains, starters and sides by how many they match | authored here |
| `/recipes/storage/` | Food Storage — how to store each ingredient once opened. (The room temperature/humidity tracker moved to `/admin/storage/`) | authored here |
| `/recipes/cocktail-menu/` | Cocktail Menu — the house cocktail list in two pages: Classics (to memorise), then Modern & Lesser-Known drinks the bar stock can make. Prints as two pages | authored here |
| `/recipes/bar-stock/` | Bar Stock — checklist of everything the cocktail menu needs, with which drinks use each item. Ticks are saved per browser; when signed in, "Add missing to shopping list" sends unticked items to `/admin/shopping/` | authored here |
| `/wyfood/` | WY Farmer's Markets — West Yorkshire farmers markets and food festivals | from `Desktop\Claude\Farmers Market` |
| `/gallery/` | Wildlife Photography — portfolio gallery. Photos committed in `PHOTOS`, plus any uploaded or removed at `/admin/photos/` | authored here |
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
    GET  /api/inspiration                public, cached 3 h
    GET  /api/gallery                    public — {added, removed}
    GET  /api/gallery/image/:id          public — an uploaded photo
    GET  /api/session                    public — {signedIn, configured}
    POST /api/signin                     public (10 wrong attempts/hour per connection)
    POST /api/signout                    public
    POST /api/contact                    public (honeypot, timing check, 5/hour per connection)
    GET  /admin/api/contact              signed in
    GET  /admin/api/shopping             signed in — the shopping list
    POST /admin/api/shopping             signed in — save items (newest change wins)
    POST /admin/api/shopping/add         signed in — add items, merging duplicates
    GET  /admin/api/shopping/key         signed in — the voice key (POST replaces it)
    POST /admin/api/shopping/transcribe  signed in — audio in, {text} out (Workers AI Whisper)
    GET  /api/shopping/voice             voice key — read the list out (plain text)
    POST /api/shopping/voice             voice key — add what was said (plain text reply)
    DEL  /admin/api/contact/:id          signed in
    POST /admin/api/sightings            signed in
    DEL  /admin/api/sightings/:id        signed in
    POST /admin/api/custom-species       signed in
    POST /admin/api/recipes              signed in
    DEL  /admin/api/recipes/:id          signed in
    POST /admin/api/storage-rooms        signed in
    DEL  /admin/api/storage-rooms/:id    signed in
    POST /admin/api/storage-readings     signed in
    DEL  /admin/api/storage-readings/:id signed in
    POST /admin/api/gallery              signed in — multipart photo upload
    DEL  /admin/api/gallery/:id          signed in — remove from the gallery
    POST /admin/api/gallery/:id/restore  signed in

Every `/admin/api/` write is also still served at `/private/api/` behind
Cloudflare Access, so nothing breaks for an old cached page; the pages
themselves all use `/admin/api/` now.

**Signing in.** One account, whose password is the `ADMIN_PASSWORD` secret
(optionally with an `ADMIN_USERNAME`) set in the Cloudflare dashboard — see
`db/SETUP.md`. Signing in sets a signed, HttpOnly cookie that lasts 30 days;
`src/auth.js` has the details. While signed in, the recipe book shows its
+ Add / edit / delete controls; signed out, they are hidden.

**Gallery uploads.** `/admin/photos/` resizes each photo in the browser to
2000px on the long edge, reads the date and camera from its EXIF, and asks you
to click the subject. That point is saved as the photo's `focus`, and the
gallery uses it to keep the subject in the middle of every cropped tile (the
committed photos in `PHOTOS` have a `focus` too). Uploaded photos are stored in
D1 (`gallery_photos`), not committed; removing a committed photo writes a
tombstone row and can be undone from the same page.

The wildlife tracker is offline-first: the database is the source of truth,
localStorage is a cache, and writes made with no signal or no login are queued
and flushed automatically. See `db/SETUP.md` for the Cloudflare steps.

The recipe book works the same way. The recipes in
`public/recipes/recipes.json` are the seed — the page caches them in
localStorage, so a return visit paints instantly and works offline — and the
database holds the overlay: recipes added through
the form, edits to seeded ones, and deletions. The database wins by id.
Deleting a seeded recipe writes a tombstone row, otherwise the seed would put
it straight back on the next load.

Every recipe shows storage and reheating advice for leftovers — either its own
`storage` field, or sensible category-based default guidance when it doesn't
have one (see `defaultStorageAdvice()` in `public/recipes/index.html`).

Food Storage (`/recipes/storage/`) lists every
distinct ingredient across the book (same seed + database merge as the recipe
book) and matches it against a hand-written storage guide — general
food-safety guidance on how to store something once it's opened, not
product-specific advice. The **Room storage tracker** (`/admin/storage/`,
signed in) is for tracking real conditions:
named rooms (pantry, garage store, …) with logged temperature/humidity
readings, trend charts per room, and a CSV export for analysis outside the
site. It follows the same offline-first pattern as sightings and recipes.

The home page (`/`) is deliberately just a few words: Recipes goes straight
to the recipe book, Photos to the photography hub, and a smaller Dashboard
link to `/dashboard/`. `/dashboard/` is a read-only dashboard: it scrapes
`/recipes/` and `/wyfood/` the same way the Meal Builder and Food Storage
pages do (fetch the page, lift a named array out of its `<script>`), reads
the public storage-rooms/readings API, and shows what's relevant right now —
markets this weekend, upcoming festivals, the latest recipe added, what's in
season, what's worth foraging, storage room conditions, and a "what to cook
tonight" shuffle — plus buttons into the recipe book, Meal Builder, What does Jodie want to eat?, Food
Storage and WY Farmer's Markets. `/photos/` carries the wildlife photography
and work-in-progress links that used to live on the home page. The recipe
book supports `#recipe-<id>` and `#seasonal`/`#foraging`/`#drinks` in its URL
so the dashboard's widgets can link straight into the right recipe or tab.

Recipes can carry several photos: `photos: [{src, caption}]`, the first being
the main photo used as the thumbnail in the list, on the dashboard and in the
cookbook. Photo files are committed under `public/recipes/photos/` (about
1600px on the long edge, JPEG ~82). In the database they are stored as a JSON
array in the existing `image` column, so no migration was needed; a database
row with no photos of its own keeps the photos listed in the file.

**Shopping list.** `/admin/shopping/` (`src/shopping.js`) is a list shared
between phones. It keeps a copy in localStorage and queues changes made with
no signal, sending them when the connection comes back; each change carries
its time and the newest wins, so two phones editing at once agree. The
microphone button records a few seconds of audio and posts it to
`/admin/api/shopping/transcribe`, which turns it into text with Workers AI
(Whisper, the `AI` binding in `wrangler.toml`); the browser's own speech
recognition is only a fallback, because on Android it can sit "listening"
without returning anything. No audio is stored. For "Hey Siri",
an iPhone Shortcut posts what was said to `/api/shopping/voice` with the
voice key in an `Authorization: Bearer` header — the key is shown, copied and
replaced on the page, is stored in D1 (`site_settings`), and reaches nothing
but the shopping list. The page's "Paste a list" box takes one item per line.
Signed in, every recipe in the book has an **Add to shopping list** button
that ticks off pantry staples and sends the rest (scaled to the servings
shown) to `/admin/api/shopping/add`, which folds duplicates together. The
tables are created on first use. `/assets/shopping.webmanifest` lets the page
be added to a phone's home screen, with an "Add by voice" shortcut.

The Cookbook (`/admin/cookbook/`, sign-in only while it's unfinished) reads the same recipes, drinks, seasonal and
foraging lists (and gallery photographs for the interludes) and typesets them
into pages: cover, contents, introduction, chapter openers, recipe pages,
interludes and an index. The words that only exist in the book — intro,
chapter blurbs, "kitchen rules", the cook's photo — are in the `BOOK` object at
the top of its script. See `docs/cookbook-ideas.md` for what would improve it.

## Changes from the original sources

- WY Farmer's Markets: header logo image replaced with a text wordmark and the header
  background image removed — `images/wylogo1.png` and `images/header-hills2.png`
  no longer exist anywhere. Favicon repointed to `/assets/favicon.svg`.
- All three sub-pages: a small fixed "Home" link added at top-left.
