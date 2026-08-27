# myonlinehome

Source for **myonlinehome.co.uk** — Ben Lawman's personal site.

## Layout

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

## Known limitations (to be fixed)

Both the wildlife tracker and the recipe book currently save anything you enter
into browser `localStorage`. That means data does not sync between phone and
laptop, and clearing browser data loses it. The plan is to move this to a
Cloudflare D1 database with a small Worker API, and to put a private area
behind Cloudflare Access.

## Changes from the original sources

- WY Food: header logo image replaced with a text wordmark and the header
  background image removed — `images/wylogo1.png` and `images/header-hills2.png`
  no longer exist anywhere. Favicon repointed to `/assets/favicon.svg`.
- All three sub-pages: a small fixed "Home" link added at top-left.
