# About magazine experience

The About route (`/about/`) is an animated, CSS 3D magazine page-turn, then a readable typographic spread. Header, navigation, logo, footer, and the site newsletter are unchanged.

Nothing here is wired to the live `main` branch until it is approved. The work lives on the `about-redesign` preview branch.

## How it plugs in

- Route: `src/pages/AboutPage.jsx` renders `<AboutMagazine />` and the existing Beehiiv newsletter.
- Component: `src/components/AboutMagazine.jsx` + `AboutMagazine.css`.
- Copy, layout fractions, portrait, and image imports: `src/data/about.js`.
- Photograph assets: `src/assets/about/`.

The component is client-side React. No additional build steps are required beyond the existing Vite build (`npm run build`). Static-route prerendering for `/about/` continues to work because the page still uses `useMeta` for title and description.

## Replacing the left-page portrait

The opening photograph has a blank studio-gray well on the left page. The headshot is a separate layer, so it can be swapped without editing the magazine photo.

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
4. No other layout math needs to be edited. The well position is `MAGAZINE_LAYOUT.portrait` in the same file (fractions of the 1505×1045 opening photograph).

## Animation behavior

- On load, the opening photograph is shown for about 1.5 seconds.
- The right-hand page then turns right-to-left around the spine as a single CSS 3D plane (perspective, transform-origin at the spine, backface-visibility, a typographic back face). Dynamic shading and a slight rotateZ suggest paper curl. The page underneath is the typographic right page of the About spread. A multi-strip curl was tried and dropped: overflow clipping failed under preserve-3d and garbled the type mid-turn.
- After a short hold, the photo framing fades into a larger, readable two-page spread (stacked on small screens).
- Visitors can turn early with a click, tap, left swipe, Enter, Space, or the arrow keys.
- “Skip animation” jumps to the spread. “Replay” plays the sequence again.
- `prefers-reduced-motion: reduce` skips the turn and shows the spread immediately.

## Assets

| File | Role |
| --- | --- |
| `opening-{800,1200,1505}.webp` | Opening photograph, portrait well filled with studio gray, transparent surround |
| `hands-{800,1200,1505}.webp` | Hands/thumbs overlay, kept above the turning page |
| `portrait.webp` | Default left-page headshot |
| `leaf-mask.png` | Alpha mask for the turning leaf (punches out the right thumb) |
