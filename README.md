# OFFLINE THEORY

An independent digital publication on cybersecurity, technology and the culture of the internet.
**Live site:** https://offlinetheory.github.io/
**Repository:** https://github.com/offlinetheory/offlinetheory.github.io

(The project previously lived at `jamiahmcquiller/offline-theory`; that address now redirects here.)

Built with **React 19 + Vite + React Router + plain CSS** (CSS variables, one stylesheet per component), self-hosted fonts via `@fontsource`.

## Run it

Requires Node 20+ (tested with Node 24, npm 11).

```bash
npm install
npm run dev        # http://localhost:5173 (hot reload)
npm run build      # production build into dist/
npm run preview    # serve the production build at http://localhost:4173
npm run lint       # oxlint
```

Optional: copy `.env.example` to `.env` and fill it in (see *Connecting the newsletter*).

## What's included

| Route | Page |
| --- | --- |
| `/` | Homepage: header + logo, oversized masthead, journal issues / open-book hero / latest, info bar, newsletter |
| `/news`, `/analysis`, `/tools`, `/guides` | Section pages (Tools has a toolkit table, Guides has downloadable-product cards) |
| `/about` | Mission, editorial principles, masthead, contact |
| `/article/:slug` | Article pages (drop cap, pull quotes, monospaced code blocks, tags, related reading) |
| `/search?q=` | Full search results page |
| `/threat-map` | Threat map backed by a 15-minute server-side intelligence snapshot |
| `*` | 404 page |

- **Search**: the magnifier (or the `/` key) opens an accessible `<dialog>` with live results; Enter goes to `/search?q=`. Search runs client-side over every article's title, dek, tags, section and body (`src/data/articles.js → searchArticles`).
- **SEO**: per-route `<title>`, meta description, canonical URL, Open Graph and Twitter tags, and JSON-LD (`src/hooks/useMeta.js` for in-browser navigation; `staticRoutes()` in `vite.config.js` bakes the same tags into a real `index.html` for every route at build time, so crawlers and social scrapers do not need JavaScript). Articles with a unique cover use that image in `og:image` / `twitter:image` and include Article/NewsArticle JSON-LD. Placeholder (sample) articles get `noindex` and are omitted from the sitemap so only real editorial pages are submitted to search engines. The build also writes `sitemap.xml` (with `lastmod` on article URLs) and `robots.txt`.
- **Accessibility**: semantic landmarks (`header`, `nav`, `main`, `article`, `footer`), skip link, labelled forms, `aria-current` on active nav links (via NavLink), `aria-expanded` mobile menu, live regions for search and newsletter status, visible focus styles, reduced-motion support.
- **Responsive**: desktop three-column layout; tablet (≤900px) puts the hero full-width above journal + latest; mobile (≤640px) is single-column with a menu button. The masthead is auto-fitted to the container width (`src/hooks/useFitText.js`) so it never overflows.
- **Threat intelligence**: `.github/workflows/threat-snapshot.yml` refreshes same-origin snapshots every 15 minutes (best effort). `scripts/build-threat-snapshot.mjs` retrieves DShield and CISA KEV; `scripts/build-threat-intel-snapshot.mjs` adds NVD CVEs and Cloudflare Radar's aggregated Layer 7 country pairs. The browser reads only published snapshots. `CLOUDFLARE_RADAR_API_TOKEN` is supplied only as a GitHub Actions repository secret to the server-side ingestion step; it is never a `VITE_` variable or browser credential. GitHub Actions secrets are not injected into Codespaces. The API response and upstream `lastUpdated` are saved to `public/data/cloudflare-attack-pairs.json`; DShield source-IP locations remain separate from Cloudflare's aggregated country pairs. DShield is enabled with visible SANS Technology Institute / Internet Storm Center attribution and is not resold. ThreatFox is **disabled by default** pending confirmation of commercial-use eligibility or an appropriate paid subscription; only after that is resolved, set the Actions variable `ENABLE_THREATFOX=true` and add the `THREATFOX_AUTH_KEY` secret (Auth-Key required). `NVD_API_KEY` is optional and used only server-side. Provider freshness/errors are recorded and prior data is retained on temporary feed outages. NVD/CISA and ipwho.is sources are linked on the map. **Recent Breaches is not fetched or republished until permission for this site's intended use is confirmed**; its public API terms limit use to non-commercial purposes and require visible attribution. For normalization and map tests run `npm run test:threat-intel`.
- **Threat-map freshness and timeline**: the DShield top-ports request uses the date-qualified endpoint for the previous UTC day, and only provider-supplied ranks and report counts are plotted. Each DShield subfeed retains its own last-successful-fetch timestamp; the map labels each feed LIVE, RECENT, STALE or OFFLINE. Timeline events use the providers' supported resolution: DShield and CISA dates, NVD publication timestamps, and ThreatFox first-seen timestamps when enabled. Missing event times are not inferred.
- **Images**: separate WebP assets with explicit width/height, `srcset`/`sizes`, lazy-loaded thumbnails and a high-priority hero. The logo is a vector SVG traced from the supplied logo artwork.

## Project structure

```
src/
  main.jsx, App.jsx          routing + layout
  styles/                    tokens.css (colors, fonts, spacing), base.css (shared primitives), fonts.js
  components/                Header, Logo, Masthead, JournalList, HeroBook, LatestList, InfoBar,
                             Newsletter, SearchDialog, ArticleRow, PageHeader, Footer, Icons (+ .css each)
  pages/                     Home, SectionPage, ArticlePage, AboutPage, SearchPage, NotFound
  data/                      articles.js (all content + search), sections.js, nav.js, images.js, covers.js, seo.js
  services/newsletter.js     newsletter signup (beehiiv official Slim Inline embed by default)
  hooks/                     useMeta.js, useFitText.js
  assets/images/             logo.svg, hero-book-*.webp, thumb-*.webp
```

Typefaces: **Archivo 700** (OFFLINE masthead, width 100), **Bodoni Moda** (THEORY, book text, page titles), **Newsreader** (article headlines), **Source Serif 4** (body and reading text), **Inter** (navigation, metadata), **IBM Plex Mono** (code only). All are self-hosted and licensed under the SIL Open Font License 1.1.

## Content

Most articles and the toolkit table are still **placeholder copy**. The About page lists Jamiah McQuiller as founder and editor. Replace remaining sample articles in `src/data/` before promoting those pages.

## Connecting the newsletter

The heading and tagline stay on the site. `src/components/Newsletter.jsx` loads beehiiv's official Slim Inline subscribe form (email field + Subscribe button) into that section with the public v3 loader — no API key and no custom POST:

`<script async src="https://subscribe-forms.beehiiv.com/v3/loader.js" data-beehiiv-form="ef3fc9ae-3ac2-4e1b-9569-4f9329d9b5aa"></script>`

Each Newsletter instance (Home, section pages, article pages, and About) injects its own script tag on mount and tears it down on unmount, so client-side navigation still gets a working form. The form itself is styled in the beehiiv form builder.

Set `VITE_BEEHIIV_FORM_ID` to override the form id. No `VITE_` variable should ever hold a secret API key, because those values are bundled into the public JavaScript.

## Deploying

### GitHub Pages (current)

The site is published from the `offlinetheory` organization's user-site repo, so it is served at the domain root: https://offlinetheory.github.io/.

Every push to `main` runs `.github/workflows/deploy.yml`: it installs with Node 20, builds with `BASE_PATH` and `VITE_SITE_URL` taken from the Pages settings (for this repo `BASE_PATH=/` and `VITE_SITE_URL=https://offlinetheory.github.io`), and publishes `dist/` with `actions/deploy-pages`. Pages is configured with **Source: GitHub Actions** (Settings → Pages).

- **Base path:** `BASE_PATH` (default `/`) sets Vite's `base`; the router's `basename` and canonical URLs follow `import.meta.env.BASE_URL`, and all images, fonts and the favicon are emitted under that path. To host under a subpath instead, build with e.g. `BASE_PATH=/some-path/`.
- **Deep links:** GitHub Pages has no SPA rewrites, so the build writes a real `index.html` for every route (`/news/`, `/article/<slug>/`, ...) with that page's title, description, canonical link, Open Graph / Twitter tags and JSON-LD baked in, plus `404.html` as the fallback for anything else, and `sitemap.xml` + `robots.txt` (see `staticRoutes()` in `vite.config.js`). New articles in `src/data/articles.js` get their own page and sitemap entry on the next deploy. The visible page is still rendered by React in the browser; only the document `<head>` is pre-filled.
- **Newsletter on Pages:** the signup form uses beehiiv's official Slim Inline embed by default. To point it at a different form, set a repository variable `BEEHIIV_FORM_ID` and uncomment the `VITE_BEEHIIV_FORM_ID` line in the workflow.
- **Test the production build locally:** `npm run build && npm run preview`, then open http://localhost:4173/.

### Other hosts

`npm run build` (no `BASE_PATH`) outputs a root-path build in `dist/`. `public/_redirects` handles Netlify and `vercel.json` handles Vercel rewrites. Set `VITE_SITE_URL` for canonical URLs.

## Needs external services / keys

| Feature | Status |
| --- | --- |
| Newsletter delivery | beehiiv official Slim Inline embed (no API key). Override with `VITE_BEEHIIV_FORM_ID`. |
| CMS | Not implemented: content lives in `src/data/articles.js` |
| Analytics, comments, accounts | Not implemented |

Everything else (navigation, search, article pages, responsive layouts, metadata) works with no keys.
