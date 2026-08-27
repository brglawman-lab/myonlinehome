# How to post updates to myonlinehome.co.uk

Paste this into the project instructions of any Claude project that used to
work on the old repositories — Chef Claude, Yorkshire Wildlife, WY Food.

---

## What changed (August 2026)

Three separate projects were merged into one website at
**https://myonlinehome.co.uk**, and the old repositories have been **deleted**.

| If you were told to use… | It is now |
|---|---|
| `brglawman-lab/RecipeBook` | **deleted** |
| `brglawman-lab/chef-claude-recipes` | **deleted** |
| `brglawman-lab/YorkshireWildlife` | **deleted** |
| `Desktop\Claude\Chef Claude\Chef Claude — Recipe Book.html` | a stale snapshot, no longer the source |
| `Desktop\Claude\Farmers Market\WY Food V1.1 230526.html` | a stale snapshot, no longer the source |

Everything now lives in one repository, **`brglawman-lab/myonlinehome`**:

    public/recipes/index.html     Chef Claude — the recipe book
    public/wildlife/              Yorkshire Wildlife Tracker
    public/wyfood/index.html      WY Food — markets and festivals
    src/                          the API
    db/                           database schema and setup notes

Pushing to `main` redeploys the live site automatically, in about a minute.

**Do not edit the files on Ben's Desktop.** They are snapshots left over from
before the merge. Editing them changes nothing on the site and creates exactly
the drift this merge was done to end.

---

## First, work out which kind of update this is

**Content** — a new recipe, a wildlife sighting, a market that has changed its
dates. This belongs in the **database**, added through the site itself. No file
needs editing and no repository access is needed.

**Design or behaviour** — layout, a new feature, a bug, restyling. This belongs
in the **repository**, as a change to a file under `public/` or `src/`.

Most requests are content. Reach for a file edit only when the request is
genuinely about how the site works rather than what is on it.

---

## If your project cannot reach GitHub

Most chat projects cannot. That is fine — the job is to produce correct content
and hand it over, not to pretend to have published it.

**Do not tell Ben the site has been updated.** Say what you have produced and
what he needs to do with it. Getting this wrong is worse than useless: he will
believe a recipe is saved when it is not.

Give him the content in the format below, then one line telling him how to
apply it.

### How Ben applies it

1. **Through the site.** Open the relevant page and use its own form — `+ Add`
   on the recipe book, `Log a sighting` on the wildlife tracker. Best for a
   single item. It syncs to the database on its own.
2. **Hand it to the myonlinehome project**, which has repository access and can
   push the change directly. Best for several items at once, or anything that
   needs a file edited.
3. **GitHub's web editor**, for a one-off text fix he is comfortable making
   himself.

---

## Recipe format

A recipe is a JavaScript object in the `DEFAULT_RECIPES` array in
`public/recipes/index.html`, one object per line.

```js
{ id:'kebab-case-id', section:'starters', title:'Full Recipe Title', category:'starters',
  serves:'2–3', time:'35 mins', calories:'640',
  description:'One or two sentences for the list view.',
  ingredients:[{amount:'250g',item:'macaroni'},{amount:'1 tsp',item:'Dijon mustard'}],
  steps:['Step one text.','Step two text.'],
  notes:'Optional tips, substitutions, make-ahead advice.' },
```

### `section` must be one of these nine values

| Value | Shown as |
|---|---|
| `starters` | Starters |
| `fish` | Seafood |
| `beef` | Beef |
| `pork` | Pork |
| `chicken` | Chicken |
| `veg` | Veg |
| `sides` | Sides |
| `baking` | Baking |
| `soft-drinks` | Soft Drinks |

**This list is not optional and no other value works.** A recipe filed under
anything else — `pasta`, `rice`, `meat`, `tacos`, `soup`, `other` — saves
without complaint and then renders nowhere at all. It has already happened
once: a roast tomato and whipped feta toast sat invisible in the file for
weeks under `section:'other'`.

`category` is not used for grouping any more. Set it to the same value as
`section` and move on.

### The rest of the fields

- **id** — lowercase, hyphens, derived from the title, no filler words.
  "Gambas al ajillo with crusty bread" → `gambas-al-ajillo`. Must be unique.
- **serves** — `2`, `4–6`. En-dash for ranges, not a hyphen.
- **time** — total time, `—` if unknown.
- **calories** — per serving, optional, digits only as a string.
- **ingredients** — `amount` concise (`250g`, `2 tbsp`, `pinch`, `to taste`);
  `item` lowercase and descriptive (`Gruyère, grated`).
- **steps** — active imperative, "Cook the pasta…". Do not number them; they
  are numbered automatically.
- **description** — describe the dish directly. Never "This recipe features…".
- **notes** — optional. Omit the field entirely rather than leaving it empty.
- **noRecipe: true** — a placeholder for a dish with no recipe yet. Include
  only when true.

---

## Wildlife sighting format

```js
{ speciesId:'mammalia-roe-deer', date:'2026-08-27', time:null,
  locationName:'Adel', county:'West Yorkshire', note:'',
  lat:53.855889, lon:-1.5909013 }
```

`speciesId` must match an entry in `public/wildlife/data/species.json` — 468
Yorkshire vertebrates. If the species is not on the list it has to be added as
a custom species first. `county` is one of the four Yorkshire ceremonial
counties. `lat`/`lon` are optional but make the map useful.

Realistically, sightings are far easier logged through the app on a phone than
handed over as data.

---

## One rule that catches people out

The recipe book and the wildlife tracker both work the same way: the **file**
holds the original content, and the **database** holds anything Ben has added,
edited or deleted on the site. Where both have the same item, **the database
wins**.

So if a recipe has ever been edited or deleted through the site, changing it in
the file does nothing visible — the database row overrides it. When Ben asks
for a change to an existing recipe, ask whether he has edited that one on the
site. If he has, or if he does not know, the change has to go to the database
rather than the file.

New recipes are unaffected. This only bites on ones already touched.

---

## Things not to do

- Do not reference the deleted repositories, or the local Desktop files.
- Do not use the old category list. It is the single most likely way to make a
  recipe vanish.
- Do not claim the site has been updated unless the change actually reached
  `brglawman-lab/myonlinehome` or the database.
- Do not add a recipe that already exists — check the title first. If a
  `noRecipe: true` placeholder exists, replace it rather than adding a second
  entry.
