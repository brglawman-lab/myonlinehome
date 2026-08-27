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

Check it worked: the Tables list should show `sightings`, `custom_species`
and `recipes`.

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

## 4. Put the private area behind a login

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
    GET  /private/                   Ben only  landing page behind the login

The wildlife app writes to the `/private/` endpoints. If you are not signed in,
or have no signal, the sighting is saved on the device and queued — a small
note appears bottom-right — and it syncs the moment you are back online and
signed in. Nothing is lost by logging a sighting on a cliff with no bars.
