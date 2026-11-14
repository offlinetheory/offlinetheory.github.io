import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { ARTICLES } from './src/data/articles.js'
import { SECTIONS } from './src/data/sections.js'

// BASE_PATH lets the same code run at the domain root (dev, Netlify, Vercel)
// or under a subpath such as GitHub Pages: BASE_PATH=/offline-theory/
const base = process.env.BASE_PATH || '/'
// Public origin + base, used for canonical/og:url tags and the sitemap.
const siteUrl = (process.env.VITE_SITE_URL || 'https://offlinetheory.github.io' + base).replace(/\/$/, '')

const SITE = 'Offline Theory'
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Static hosts without SPA rewrites (GitHub Pages) return 404 for deep links.
 * This writes a copy of index.html for every known route (with that route's
 * <title> and description baked in, which also helps crawlers), plus 404.html
 * as the fallback for anything else.
 */

/**
 * Preload the two masthead face files (Inter + Bodoni Moda, latin opsz)
 * so the home-page wordmark paints with the display fonts instead of a fallback.
 */
function preloadMastheadFonts() {
  return {
    name: 'preload-masthead-fonts',
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html
      const hrefs = []
      for (const file of Object.keys(ctx.bundle)) {
        if (
          file.endsWith('.woff2') &&
          /inter-latin-opsz-normal|bodoni-moda-latin-opsz-normal/.test(file) &&
          !/italic|latin-ext/.test(file)
        ) {
          hrefs.push(file)
        }
      }
      hrefs.sort()
      const tags = hrefs
        .map(
          (file) =>
            `    <link rel="preload" href="${base}${file}" as="font" type="font/woff2" crossorigin />`,
        )
        .join('\n')
      if (!tags) return html
      return html.replace('</head>', `${tags}\n  </head>`)
    },
  }
}

function staticRoutes() {
  return {
    name: 'offline-theory-static-routes',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist')
      const indexPath = path.join(dist, 'index.html')
      if (!fs.existsSync(indexPath)) return
      const html = fs.readFileSync(indexPath, 'utf8')
      const page = (title, desc, route) => {
        const full = `${title} — ${SITE}`
        const url = route == null ? null : `${siteUrl}/${route ? route + '/' : ''}`
        const head = url
          ? `<link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n  </head>`
          : '</head>'
        return html
          .replace('</head>', head)
          .replace(/<title>.*?<\/title>/, `<title>${esc(full)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
          .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(full)}$2`)
          .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
      }
      const routes = [
        ...SECTIONS.map((s) => [s.slug, s.title, s.description]),
        ['about', 'About', 'The mission, principles and masthead of Offline Theory.'],
        ['search', 'Search', 'Search every article in Offline Theory.'],
        ...ARTICLES.map((a) => [`article/${a.slug}`, a.title, a.dek]),
      ]
      for (const [route, title, desc] of routes) {
        const dir = path.join(dist, route)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'index.html'), page(title, desc, route))
      }
      // Homepage keeps its own title but gains canonical + og:url.
      fs.writeFileSync(indexPath, html.replace('</head>', `<link rel="canonical" href="${siteUrl}/" />\n    <meta property="og:url" content="${siteUrl}/" />\n  </head>`))
      fs.writeFileSync(path.join(dist, '404.html'), page('Page not found', 'This page is offline.'))
      const urls = ['', ...routes.map(([r]) => r + '/')]
      fs.writeFileSync(
        path.join(dist, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${siteUrl}/${u}</loc></url>`).join('\n')}\n</urlset>\n`,
      )
      fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`)
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), preloadMastheadFonts(), staticRoutes()],
})
