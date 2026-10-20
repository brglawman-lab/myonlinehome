# The Cookbook — ways to make it better

`/private/cookbook/` (sign-in only until it's ready to show) is built live from the recipe book, so it improves on its own as
recipes and photos are added. These are the things that need Ben (or a
decision from him) rather than more code. Roughly in order of how much
difference they would make.

## Things only Ben can supply

1. **A photo of the cook.** The "About the cook" page shows a monogram in a
   polaroid frame. Any decent photo of Ben in the kitchen, at a market or with
   a camera would replace it — set `BOOK.cookPhoto` in
   `public/private/cookbook/index.html`.
2. **More food photos.** A cookbook feels real when about a third of the
   recipes have a photo. Each new photo appears automatically: as a full-page
   photo facing its recipe, as a photo across the top of the recipe page, or as
   a chapter opener. Process shots (dough mid-knead, the pan before the sauce
   goes in) work well as second and third photos; they become tucked-in
   polaroids on the page.
3. **A cover photo.** The cover uses the first recipe photo it finds. A
   chosen hero shot, ideally an overhead of a table of food, would look better
   — set `BOOK.coverPhoto`.
4. **The introduction in Ben's own words.** The intro, "About the cook" and
   chapter blurbs were written by Claude from what is on the site. They are
   plausible but generic. Even a few personal details would make it his book:
   where he learned to cook, the dish he makes most, who he cooks for. They
   all live in the `BOOK` object at the top of the page's script.
5. **A headnote for each recipe.** Real cookbooks have a paragraph above each
   recipe about where it came from and when to make it. At the moment the
   one-line description stands in. A `headnote` field on the recipe would be
   easy to add to both the recipe book and the cookbook.
6. **Real kitchen rules.** The "Kitchen rule no. N" filler pages are made up.
   Ben's own sayings, or tips that actually come up, would be better.
7. **Photos of places.** Markets, the allotment, a foraging walk. The
   between-chapter filler pages currently borrow wildlife photos from the
   gallery, which works but is a step removed from food.

## Decisions to make

- **Title.** "Cooked at Home" is a placeholder. Alternatives: "Chef Claude",
  "My Online Home: The Cookbook", or something personal.
- **Chapter order and names.** The chapters follow the recipe book's sections.
  A real book might group by occasion instead: weeknights, weekends, the BBQ,
  feeding a crowd.
- **What to leave out.** At the moment everything is in, including
  dips that are a single line. A tighter edit (the 40 best) would read more
  like a book and less like a database.

## Things that could be built next

- **Print / PDF export.** The pages are already set at a fixed size, so a
  print stylesheet could produce an A5 PDF to send to a print-on-demand
  service (Blurb, Lulu) for a physical copy.
- **Upload photos from the site.** At present photos have to be committed to
  the repository. A Cloudflare R2 bucket with an upload button in the recipe
  editor would let Ben add photos from his phone. This needs an R2 bucket
  created and bound in `wrangler.toml` (a few clicks in the Cloudflare
  dashboard).
- **Bookmarks and a ribbon.** Remember the last page read and show a ribbon on
  that spread.
- **"Cooked it" stamps and margin notes.** Let Ben tick off recipes and add
  handwritten-style notes that show up in the margins of the book.
- **Seasonal edition.** Re-order the book so the recipes that use what is in
  season right now come first.
