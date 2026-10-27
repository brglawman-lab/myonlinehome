# Database and login setup

One-off Cloudflare steps. Everything else is already in the repo and deploys
itself on push.

## 1. Create the database

Cloudflare dashboard → **Storage & Databases → D1** → **Create database**.

Name it **`myonlinehome`**. Copy the **Database ID** it gives you.

## 2. Create the tables

Open the new database → **Console** tab. Paste the whole of
[`db/schema.sql`](./schema.sql) and run it. It is safe to run more than once —
every statement is `CREATE TABLE IF NOT EXISTS`.

Check it worked: the Tables list should show `sightings`, `custom_species`,
`recipes`, `storage_rooms` and `storage_readings`. (`contact_messages`,
`gallery_photos` and `signin_failures` are created by the site on first use.)

**Already have a database from before the storage feature?** Everything above
is still safe to re-run, except one thing SQLite can't express as "if not
exists": paste this once, on its own, in the Console tab —

    ALTER TABLE recipes ADD COLUMN storage TEXT;

(Running it twice errors on the second try — that's fine, it just means it's
already there.)

## 3. Bind the database to the site

This project is a **Worker with static assets**, not a classic Pages project,
so the binding lives in `wrangler.toml` at the repo root rather than in the
dashboard. Uncomment the block at the bottom of that file and paste in the
Database ID from step 1:

    [[d1_databases]]
    binding = "DB"
    database_name = "myonlinehome"
    database_id = "<the id from step 1>"

The binding name must be exactly `DB` — that is what the code reads. Pushing
the change redeploys automatically.

Sanity check: <https://myonlinehome.co.uk/api/sightings> should return `[]`
rather than an error.

## 4. Set the sign-in password

The owner's area (`/admin/` — photos, recipes, room storage tracker,
messages) uses the site's own sign-in at `/signin/`. Its password lives in a
Cloudflare secret, never in the repo.

Cloudflare dashboard → **Workers & Pages** → **myonlinehome** → **Settings** →
**Variables and Secrets** → **Add**:

| Type | Name | Value |
|---|---|---|
| Secret | `ADMIN_PASSWORD` | a long password — let Chrome suggest one |
| Secret | `ADMIN_USERNAME` | optional; if set, the username must match too (any case) |
| Secret | `SESSION_SECRET` | optional; a long random string. Without it, sessions are signed with the password, so changing the password signs every device out |

Save, then open <https://myonlinehome.co.uk/signin/>, type the username and
password once, and let Chrome save them. After that Chrome signs you in
automatically whenever you open the sign-in page (Chrome Settings → Passwords
→ "Sign in automatically" must be on, which it is by default). Signing out
from `/admin/` stops Chrome doing it again until you next sign in by hand.

Until `ADMIN_PASSWORD` is set, the sign-in page says it isn't set up yet and
nothing under `/admin/` can be opened.

## 5. (Older) Cloudflare Access on /private/

Before the sign-in above existed, the private area was behind Cloudflare
Access. The `/private/api/` write endpoints are now retired (they answer 410),
and the old `/private/` pages redirect to `/admin/`. Nothing on the site
depends on the Access application any more, so it can be deleted. The original
setup, for reference:

Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** →
**Add an application** → **Self-hosted**.

| Field | Value |
|---|---|
| Application name | `myonlinehome private` |
| Session duration | 1 month (so you are not logging in constantly) |
| Domain | `myonlinehome.co.uk` |
| Path | `private` |

Then add a policy:

| Field | Value |
|---|---|
| Policy name | `Ben only` |
| Action | Allow |
| Include | **Emails** → `benlawman@outlook.com` |

Leave the identity provider as **One-time PIN**. That emails you a six-digit
code — no password to manage, nothing to forget.

This covers both `/private/` (the page) and `/private/api/…` (every write
endpoint), because Access matches on the path prefix.

## How it fits together

    GET  /api/sightings              public    anyone can see what's been logged
    GET  /api/custom-species         public
    POST /private/api/sightings      Ben only  Access checks before the code runs
    DEL  /private/api/sightings/:id  Ben only
    GET  /admin/                     Ben only  the site's own sign-in (step 4)

The wildlife app writes to the `/admin/api/` endpoints. If you are not signed in,
or have no signal, the sighting is saved on the device and queued — a small
note appears bottom-right — and it syncs the moment you are back online and
signed in. Nothing is lost by logging a sighting on a cliff with no bars.
