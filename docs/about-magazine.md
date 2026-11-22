# About magazine experience

The About route (`/about/`) is a physical magazine held in a photograph (source: the v2 opening photograph, with leftover reference-magazine type replaced). The magazine, hands, portrait well and surrounding composition stay fixed. Visitors turn pages inside that magazine; About copy is printed on the pages and never appears beside, below or over it as a separate document.

Header, navigation, logo, footer and typography of the rest of the site are unchanged.

This rebuild lives on the `about-pageturn` preview branch until it is approved for `main`.

## How it plugs in

- Route: `src/pages/AboutPage.jsx` renders only `<AboutMagazine />` (no kicker or newsletter under the magazine).
- Component: `src/components/AboutMagazine.jsx` + `AboutMagazine.css`.
- Curl engine: `src/components/magazine/PageCurlEngine.js` (three.js, a subdivided page mesh deformed by a tilted cylinder / cone-style curl, with a contact shadow under the roll).
- Copy, layout fractions, portrait, page textures: `src/data/about.js`.
- Photograph and page assets: `src/assets/about/` and `src/assets/about/pages/`.
- Page typography is pre-rendered by `scripts/build-about-pages.py`.

If WebGL is unavailable, the same pages still appear inside the magazine and change instantly.

## Pagination

The opening photograph is spread 0. The right-hand ABOUT leaf is the first sheet; the portrait stays on the left until that sheet is turned over it.

| Spread | Left page | Right page |
| --- | --- | --- |
| 0 (opening) | Portrait in the photograph | Opening ABOUT leaf (Offline Theory folio and intro dek; leftover reference-magazine type has been removed) |
| 1 (after first turn) | Page 1 — introduction and publication philosophy | Page 2 — editorial principles 01–04 |
| 2 (after second turn) | Page 3 — masthead and founder & editor biography | Page 4 — contact and sponsorship disclosure |

Turns are visitor-controlled (no auto-advance after a page settles). Each animated turn takes about 5.2 seconds. A single small corner-lift hint plays once on the opening, then waits.

## Controls

- Click or tap a page, or the outer corners.
- Drag from a page toward the spine to curl it; release past a short threshold to finish, or before it to snap back.
- Swipe, arrow keys, PageUp/PageDown, Home and End.
- Small folio arrows (`‹  01–02  ›`) sit in the bottom margin of the magazine, not outside it.

`prefers-reduced-motion: reduce` replaces the curl with an instant page change, still inside the magazine.

On narrow screens the magazine zooms so one page at a time fills the view (left or right), still cropped to the photograph and hands.

## Replacing the left-page portrait

The opening photograph has a cream well on the left page, not a baked-in face. The headshot is a separate layer.

1. Drop the new headshot in as `src/assets/about/portrait.webp` (a 3:4 or similar vertical portrait works best; it is displayed with `object-fit: cover`).
2. If the file has a different name or path, change the import and `src` in `src/data/about.js`:

```js
import portraitSrc from '../assets/about/portrait.webp'

export const ABOUT_PORTRAIT = {
  src: portraitSrc,
  alt: 'Jamiah McQuiller, founder and editor of Offline Theory',
}
```

3. Update `alt` if the description should change.
4. No other layout math needs to be edited. The well position is `MAGAZINE_LAYOUT.portrait`.

### Blending the portrait into the page

The well behind the portrait is the site cream (`--bg`). The image uses `mix-blend-mode: multiply` and a ~10px feathered mask so a white or light-gray studio backdrop melts into the page instead of showing as a hard rectangle.

This is applied at display time, not baked into `portrait.webp`, so a new headshot is blended the same way. The blend is designed for portraits on a light studio background. If a future headshot has a dark or strongly colored backdrop, crop tighter to the subject or supply a version with a light or transparent ground; otherwise multiply will darken that backdrop.

## Opening page typography

The right-hand page of the opening photograph no longer uses the reference magazine's copy. The perfume interview, “NEZ #10 / 59,” and “INTERVIEW” labels were removed from `opening-*.webp` and replaced with an “OFFLINE THEORY” folio line and the publication’s intro sentence (the same dek as `ABOUT_COPY.leftDek`). The giant vertical “ABOUT,” the hands, the layout and the portrait well were kept.

Those strings are baked into the opening photograph. To change them, update the copy and rebuild with `scripts/build-about-pages.py` (and the opening-asset builder if the photograph itself needs to be re-set).

## Assets

| File | Role |
| --- | --- |
| `opening-{800,1200,1904}.webp` | Opening photograph, cream portrait well, studio punched out, Offline Theory folio and intro on the right page, transparent surround |
| `hands-{800,1200,1904}.webp` | Hands/thumbs overlay, kept above the turning page |
| `portrait.webp` | Default left-page headshot (blended at display time) |
| `pages/opening-right.webp` | Right-leaf texture for the first turning sheet (thumb lifted off so it stays with the hands) |
| `pages/page-{1,2,3,4}.webp` | Pre-rendered typographic pages |

## QA

Append `?scene=` to `/about/`:

- `open` — opening spread at rest
- `lift` — outer corner beginning to lift
- `mid`, `mid2`, `mid3` — along the first turn
- `settled` or `spread1` — first content spread at rest
- `spread2` — masthead / contact spread
- `back` — mid backward turn from spread 1

`?spread=0&t=0.5` and `?turn=back` can also be combined.
