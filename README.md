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
| `*` | 404 page |

- **Search**: the magnifier (or the `/` key) opens an accessible `<dialog>` with live results; Enter goes to `/search?q=`. Search runs client-side over every article's title, dek, tags, section and body (`src/data/articles.js → searchArticles`).
- **SEO**: per-route `<title>`, meta description, Open Graph tags and canonical link (`src/hooks/useMeta.js`). Note: this is a client-rendered SPA, so crawlers that don't run JavaScript only see the defaults in `index.html`. Add pre-rendering/SSR if that matters for launch.
- **Accessibility**: semantic landmarks (`header`, `nav`, `main`, `article`, `footer`), skip link, labelled forms, `aria-current` on active nav links (via NavLink), `aria-expanded` mobile menu, live regions for search and newsletter status, visible focus styles, reduced-motion support.
- **Responsive**: desktop three-column layout; tablet (≤900px) puts the hero full-width above journal + latest; mobile (≤640px) is single-column with a menu button. The masthead is auto-fitted to the container width (`src/hooks/useFitText.js`) so it never overflows.
- **Images**: separate WebP assets with explicit width/height, `srcset`/`sizes`, lazy-loaded thumbnails and a high-priority hero. The logo is a vector SVG traced from the supplied logo artwork.

## Project structure

```
src/
  main.jsx, App.jsx          routing + layout
  styles/                    tokens.css (colors, fonts, spacing), base.css (shared primitives), fonts.js
  components/                Header, Logo, Masthead, JournalList, HeroBook, LatestList, InfoBar,
                             Newsletter, SearchDialog, ArticleRow, PageHeader, Footer, Icons (+ .css each)
  pages/                     Home, SectionPage, ArticlePage, AboutPage, SearchPage, NotFound
  data/                      articles.js (all content + search), sections.js, nav.js, images.js
  services/newsletter.js     newsletter signup (demo mode or live endpoint)
  hooks/                     useMeta.js, useFitText.js
  assets/images/             logo.svg, hero-book-*.webp, thumb-*.webp
```

Typefaces: **Inter 900** (OFFLINE masthead), **Bodoni Moda** (THEORY, book text, page titles), **Newsreader** (article headlines), **Source Serif 4** (body and reading text), **Inter** (navigation, metadata), **IBM Plex Mono** (code only). All are self-hosted and licensed under the SIL Open Font License 1.1.

## Content

All articles, authors, the toolkit table and the About page are **fictional placeholder copy**. The three Guides products are **placeholders**: they have no files, prices or checkout, and their buttons are disabled. `editors@offlinetheory.example` is a placeholder address. Replace these in `src/data/` and `src/pages/AboutPage.jsx` before launch.

## Connecting the newsletter

`src/services/newsletter.js` validates the address client-side, then:

- **No `VITE_NEWSLETTER_ENDPOINT` set (default): DEMO MODE.** Nothing is sent anywhere. The success message says so explicitly, and the address is kept only in the browser's localStorage (`ot-demo-subscribers`).
- **`VITE_NEWSLETTER_ENDPOINT` set:** the form POSTs `{"email": "..."}` (JSON) to that URL, or `email=...` form data if `VITE_NEWSLETTER_FORMAT=form`. Any 2xx response counts as success; otherwise the error message (`message` in a JSON body, if present) is shown.

Buttondown, Mailchimp and Kit (ConvertKit) all require a **secret API key** for their subscriber APIs, and the key must **never** go in a `VITE_` variable (those get bundled into the public JavaScript). So point `VITE_NEWSLETTER_ENDPOINT` at a small server-side function you control (Netlify/Vercel/Cloudflare function, etc.) that receives `{ email }` and calls the provider with the key from a server-side env var:

```js
// Example serverless handler. This is a sketch: it is not part of this build and has not been run against the live APIs.
export default async function handler(req) {
  const { email } = await req.json()
  // Buttondown: https://docs.buttondown.com/api-subscribers-create
  const r = await fetch('https://api.buttondown.com/v1/subscribers', {
    method: 'POST',
    headers: { Authorization: `Token ${process.env.BUTTONDOWN_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_address: email }),
  })
  return new Response(null, { status: r.ok ? 200 : 400 })
}
```

Provider calls for that function:

- **Buttondown**: `POST https://api.buttondown.com/v1/subscribers`, header `Authorization: Token <API_KEY>`, body `{"email_address": "..."}` (double opt-in by default).
- **Mailchimp**: `POST https://<dc>.api.mailchimp.com/3.0/lists/<AUDIENCE_ID>/members`, HTTP basic auth `anystring:<API_KEY>`, body `{"email_address": "...", "status": "pending"}` (`pending` sends a confirmation email). `<dc>` is the suffix of your API key, e.g. `us21`.
- **Kit (ConvertKit)**: `POST https://api.kit.com/v4/forms/<FORM_ID>/subscribers`, header `X-Kit-Api-Key: <API_KEY>`, body `{"email_address": "..."}`.

Then set `VITE_NEWSLETTER_ENDPOINT=https://your-site/api/subscribe` and rebuild. Also add spam protection there (the form already includes a hidden honeypot field named `company`).

## Deploying

### GitHub Pages (current)

The site is published from the `offlinetheory` organization's user-site repo, so it is served at the domain root: https://offlinetheory.github.io/.

Every push to `main` runs `.github/workflows/deploy.yml`: it installs with Node 20, builds with `BASE_PATH` and `VITE_SITE_URL` taken from the Pages settings (for this repo `BASE_PATH=/` and `VITE_SITE_URL=https://offlinetheory.github.io`), and publishes `dist/` with `actions/deploy-pages`. Pages is configured with **Source: GitHub Actions** (Settings → Pages).

- **Base path:** `BASE_PATH` (default `/`) sets Vite's `base`; the router's `basename` and canonical URLs follow `import.meta.env.BASE_URL`, and all images, fonts and the favicon are emitted under that path. To host under a subpath instead, build with e.g. `BASE_PATH=/some-path/`.
- **Deep links:** GitHub Pages has no SPA rewrites, so the build writes a real `index.html` for every route (`/news/`, `/article/<slug>/`, ...) with that page's title, description, canonical link and `og:url` baked in, plus `404.html` as the fallback for anything else, and `sitemap.xml` + `robots.txt` (see `staticRoutes()` in `vite.config.js`). New articles in `src/data/articles.js` get their own page and sitemap entry on the next deploy.
- **Newsletter on Pages:** to go live, create a repository variable `NEWSLETTER_ENDPOINT` and uncomment the `VITE_NEWSLETTER_ENDPOINT` line in the workflow.
- **Test the production build locally:** `npm run build && npm run preview`, then open http://localhost:4173/.

### Other hosts

`npm run build` (no `BASE_PATH`) outputs a root-path build in `dist/`. `public/_redirects` handles Netlify and `vercel.json` handles Vercel rewrites. Set `VITE_SITE_URL` for canonical URLs.

## Needs external services / keys

| Feature | Status |
| --- | --- |
| Newsletter delivery | Demo mode until you deploy a proxy endpoint + provider API key (above) |
| Guides downloads / purchases | Not implemented (placeholders) |
| CMS | Not implemented: content lives in `src/data/articles.js` |
| Analytics, comments, accounts | Not implemented |

Everything else (navigation, search, article pages, responsive layouts, metadata) works with no keys.
