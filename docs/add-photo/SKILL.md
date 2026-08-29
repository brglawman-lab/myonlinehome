---
name: add-photo
description: >
  Use this skill any time Ben wants to add one or more photos to his Wildlife Photography
  gallery at myonlinehome.co.uk/gallery. Trigger whenever he attaches photo files and asks to
  add them to the gallery, pastes a Google Photos link and asks for it to be added, or points
  to a folder on his own machine (only possible when this session has real filesystem access —
  see "Where the photos come from" below) and asks for its contents to be added.
---

# Add a photo to the Wildlife Photography gallery

## Where the gallery actually is

    live    https://myonlinehome.co.uk/gallery/
    source  brglawman-lab/myonlinehome → public/gallery/index.html
    photos  brglawman-lab/myonlinehome → public/gallery/photos/

Photos live as committed JPEG files under `public/gallery/photos/`, and the gallery's data —
one object per photo — is a JavaScript array called `PHOTOS` in a `<script>` tag in
`public/gallery/index.html`. There is no database layer for this section (unlike the recipe
book or wildlife tracker) — everything is driven from that one file plus the image files
alongside it. Editing the array and committing is the whole workflow.

## Where the photos come from

There are three ways a photo reaches this workflow, and only one of them requires care about
*where this session is running*:

1. **Attached in chat.** Ben drags or pastes photo files directly into the conversation. Works
   from any session, remote or local.
2. **A Google Photos link.** Ben pastes a share link (`photos.app.goo.gl/…` or
   `photos.google.com/share/…`). Fetch it and pull out the actual image — do not just embed
   the Google Photos URL directly in `src`. Google's CDN URLs for shared photos are not
   guaranteed to stay valid indefinitely, so download a real copy and serve it from this
   repo, the same as everything else in `public/`.
3. **"Add everything in this folder."** This only works if the current session has real
   filesystem access to Ben's machine — i.e. Claude Code running locally, not a remote/cloud
   session. If asked to do this from a remote session, say so plainly and ask Ben to attach
   the files instead rather than pretending to browse a folder that isn't reachable.

## Photo object format

```js
{ id: 'kebab-case-id', src: '/gallery/photos/filename.jpg', title: 'Short Evocative Title',
  species: 'Common Name', tags: ['seabirds'], location: 'Place, County', date: 'YYYY-MM-DD',
  camera: 'Optional EXIF string, e.g. "Canon R5, 600mm f/4, 1/2000s"',
  caption: 'One or two sentences, written like a caption in a photography book — specific to
    what is actually happening in the frame, not generic.',
  size: 'wide',   // omit entirely for a normal tile; 'wide' makes it a large 2-column tile
  hero: true },   // omit entirely; set on exactly one photo — it becomes the homepage backdrop
```

- **id** — lowercase, hyphens, derived from subject + something distinguishing (location,
  behaviour). Must be unique and match the image filename (without extension).
- **title** — short and evocative ("The Catch", "Among the Daisies"), not just the species name.
- **species** — common name. If you can't identify the species with real confidence from the
  image, say so to Ben rather than guessing — a wrong ID undermines the "professional
  portfolio" the whole page is going for. It's fine to add the photo with a best-guess species
  and flag it as unconfirmed in your reply.
- **tags** — freeform, but keep to a small consistent vocabulary so the filter bar stays
  useful rather than turning into one pill per photo. Known tags and their display labels are
  in `TAG_LABELS` near the top of the `<script>` block in `public/gallery/index.html`
  (`birds-of-prey`, `seabirds`, `waders`, `mammals`, `garden-birds` as of writing). Reuse an
  existing tag where it genuinely fits; add a new one (and a `TAG_LABELS` entry for it) only
  when nothing existing does.
- **location** / **date** — real information only. Leave both `''` rather than inventing them.
  Ask Ben if he wants to supply them, or check EXIF if you have the original file (see below).
- **camera** — optional, from EXIF if available and interesting; omit the field entirely rather
  than leaving it empty.
- **hero** — exactly one photo across the whole array should carry `hero: true`. It becomes the
  full-bleed image behind the name on the gallery's landing view. When adding a new photo that
  should replace the current hero, add `hero: true` to it and remove the field from whichever
  photo had it before.

## Workflow

1. **Get the image onto disk.**
   - *Attachment*: it's already a local file — use it directly.
   - *Google Photos link*: fetch the share page and locate the direct image URL (it's usually
     the `og:image` meta tag, or a `lh3.googleusercontent.com/...` URL in the page). Download
     the actual bytes to a local file rather than linking to that URL from the gallery.
   - *Folder* (local-filesystem sessions only): read each image file in turn.
2. **Look at the photo properly before writing anything.** Read/view the image file directly —
   don't guess from a filename. Note what's actually happening: species (if identifiable),
   behaviour, setting, light, composition.
3. **Resize for the web if the source is large.** Portfolio images should be large enough to
   look good in the lightbox but not raw camera-file sized — repo size matters since these are
   committed files, not object storage. Aim for roughly 2000px on the long edge, JPEG quality
   ~85. In a remote session, Pillow is the easiest way to do this (`pip install --quiet --user
   Pillow` if not already available, then a short resize script); locally, `sips` (macOS),
   ImageMagick, or any equivalent works fine. The two seed photos already in the gallery
   (`osprey-post-catch.jpg`, `puffin-bempton-daisies.jpg`) are representative of the target
   size — both well under 100KB at ~900–1600px on the long edge.
4. **Save the file** to `public/gallery/photos/<id>.jpg`, matching the object's `id`.
5. **Write the object**: title, species, tags, caption, and location/date/camera if you
   genuinely have them. Insert it into the `PHOTOS` array in `public/gallery/index.html`,
   keeping one object per line like the existing entries.
6. **Check it still parses.** Extract the `<script>` block and run `node --check` on it — same
   discipline as the recipe book, and just as easy to get a stray comma or quote wrong by hand.
7. **Commit and push.** Cloudflare redeploys in about a minute.
8. **Tell Ben what you added** — title, species (flagging if it's a guess), and where it landed
   in the gallery. If you made a judgement call (cropped tightly, picked a species guess,
   chose the hero photo), say so rather than presenting it as fact.

## Style

- **caption** — written like the caption under a photograph in a proper photography book:
  specific to the frame, a little literary, never generic ("A [species] perched on a branch").
  Say what's actually going on — the light, the behaviour, the moment.
- **title** — short, evocative, not just the species repeated.
- Don't invent location, date, or camera details. An empty field is honest; a plausible-sounding
  fabricated one is not, especially on a page presenting itself as a professional's portfolio.
