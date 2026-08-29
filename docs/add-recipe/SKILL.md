---
name: add-recipe
description: >
  Use this skill any time Ben wants to add, update, or fill in a recipe in the Recipe Book
  at myonlinehome.co.uk/recipes. Trigger whenever the user says things like "add this recipe
  to my recipe book", "save this recipe", "update the recipe book", "fill in the recipe for X", or
  pastes a recipe they developed in Claude Chat. Also trigger if the user asks to add a "no recipe
  saved" placeholder for a dish they haven't developed yet.
---

# Add a recipe to the Recipe Book

## Where the recipe book actually is

The recipe book is a page on Ben's website:

    live    https://myonlinehome.co.uk/recipes/
    source  brglawman-lab/myonlinehome → public/recipes/index.html

**The old locations are dead.** The `RecipeBook` and `chef-claude-recipes`
repositories have been deleted, and `Desktop\Claude\Chef Claude\Chef Claude —
Recipe Book.html` is a stale snapshot. Editing any of them changes nothing.

Recipes live in a JavaScript array called `DEFAULT_RECIPES` in a `<script>` tag
in `public/recipes/index.html`, one object per line. Everything on the page is
rendered from that array.

## Before editing the file: check which layer the recipe is in

The page has two sources. `DEFAULT_RECIPES` in the file holds the original 51
recipes. A **database** holds anything Ben has added, edited or deleted through
the site. Where both have a recipe with the same id, **the database wins**.

- **Adding a new recipe** — edit the file, or use the site's `+ Add` form.
  Either works.
- **Changing an existing recipe** — ask whether Ben has edited that recipe on
  the site. If he has, or does not know, a file edit will be silently
  overridden and the change must go to the database instead.

Check by fetching `https://myonlinehome.co.uk/api/recipes` — anything listed
there is in the database and overrides the file.

## Recipe object format

```js
{ id:'kebab-case-id', section:'starters', title:'Full Recipe Title', category:'starters',
  serves:'2–3', time:'35 mins', calories:'640',
  description:'One or two sentences for the list view.',
  ingredients:[{amount:'250g',item:'macaroni'},{amount:'1 tsp',item:'Dijon mustard'}],
  steps:['Step one text.','Step two text.'],
  notes:'Optional tips, substitutions, make-ahead advice.' },
```

### `section` — only these nine values exist

| Value | Shown as |
|---|---|
| `starters` | Starters |
| `fish` | Seafood |
| `beef` | Beef |
| `pork` | Pork |
| `chicken` | Chicken |
| `veg` | Veg |
| `sides` | Sides |
| `dips` | Dips |
| `baking` | Baking |
| `soft-drinks` | Soft Drinks |

Any other value — `pasta`, `rice`, `meat`, `tacos`, `soup`, `other` — saves
without error and then renders nowhere. This has already happened: a roast
tomato and whipped feta toast sat invisible under `section:'other'` until it
was found by counting rows against the header total.

`category` no longer controls grouping. Set it to the same value as `section`.

### Other fields

- **id** — lowercase, hyphens, from the title, filler words dropped.
  "Gambas al ajillo with crusty bread" → `gambas-al-ajillo`. Must be unique.
- **serves** — `2`, `4–6`. En-dash for ranges.
- **time** — total time, `—` if unknown.
- **calories** — per serving, optional, digits as a string.
- **ingredients** — `amount` concise (`250g`, `2 tbsp`, `pinch`, `to taste`);
  `item` lowercase and descriptive (`Gruyère, grated`).
- **steps** — active imperative. Do not number them; they are auto-numbered.
- **description** — describe the dish directly, never "This recipe features…".
- **notes** — omit the field entirely rather than leaving it empty.
- **noRecipe: true** — placeholder for a dish with no recipe yet. Include only
  when true, alongside empty `ingredients:[]` and `steps:[]`.

## Workflow

1. Read `public/recipes/index.html` and find `const DEFAULT_RECIPES`.
2. Search for the title and a likely id. If a `noRecipe: true` placeholder
   exists, **replace that object** rather than adding a second entry.
3. Parse the recipe from what Ben gave you. Ask about anything ambiguous —
   quantities and timings especially — rather than inventing it.
4. Insert the object before the closing `];`, keeping one object per line and
   the comma placement correct.
5. Check the file still parses. Extracting the `<script>` block and running
   `node --check` on it catches a stray comma or quote immediately.
6. Commit and push to `main`. Cloudflare redeploys in about a minute.
7. Verify on the live page: the header count should have gone up by one, and
   the recipe should appear under the right section. If the count says
   "52 RECIPES · 51 SHOWN", the `section` value is wrong.

## Style

- **description** — punchy, one or two sentences.
- **steps** — complete sentences, one action or closely-related group each.
- **notes** — what Ben has actually found useful: substitutions, make-ahead,
  what goes wrong.
- Straight quotes inside JavaScript strings; escape any apostrophe.
- En-dash for ranges (`2–3`, `230–250°C`), em-dash in prose.

## Careful when patching this file

The page also contains cocktail, seasonal-produce and foraging sections whose
render functions reuse identical helper names and SVG strings. An anchor that
looks unique across the file often is not. Slice out the target function body
first, patch inside it, then splice it back.
