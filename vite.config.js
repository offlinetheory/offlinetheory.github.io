import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { ARTICLES } from './src/data/articles.js'
import { SECTIONS } from './src/data/sections.js'
import { getSeoCover } from './src/data/covers.js'
import {
  DEFAULT_DESC,
  DEFAULT_SOCIAL,
  HOME_OG_DESC,
  HOME_OG_TITLE,
  articleJsonLd,
  jsonLdScript,
  pageTitle,
  websiteJsonLd,
} from './src/data/seo.js'

// BASE_PATH lets the same code run at the domain root (dev, Netlify, Vercel)
// or under a subpath such as GitHub Pages: BASE_PATH=/offline-theory/
const base = process.env.BASE_PATH || '/'
// Public origin + base, used for canonical/og:url tags and the sitemap.
const siteUrl = (process.env.VITE_SITE_URL || 'https://offlinetheory.github.io' + base).replace(/\/$/, '')

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Static hosts without SPA rewrites (GitHub Pages) return 404 for deep links.
 * This writes a copy of index.html for every known route with that route's
 * <title>, description, canonical, Open Graph, Twitter, and JSON-LD baked in
 * so crawlers and social scrapers do not have to run JavaScript. 404.html is
 * the fallback for anything else. Visible design is unchanged: the document
 * body is still the empty #root shell that React hydrates in the browser.
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
          /inter-latin-opsz-normal|bodoni-moda-latin-opsz-normal|archivo-latin-wdth-normal/.test(file) &&
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

function findHashedAsset(dist, prefix) {
  const dir = path.join(dist, 'assets')
  if (!fs.existsSync(dir)) return null
  const match = fs.readdirSync(dir).find(
    (f) => f === prefix || f.startsWith(prefix + '-') || f.startsWith(prefix + '.'),
  )
  return match ? `${base}assets/${match}`.replace(/\/{2,}/g, '/') : null
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
      const setOrInsert = (doc, pattern, replacement, insertBeforeHeadEnd) => {
        if (pattern.test(doc)) return doc.replace(pattern, replacement)
        return doc.replace('</head>', `    ${insertBeforeHeadEnd}\n  </head>`)
      }
      const setAttr = (doc, pattern, value, tag) =>
        setOrInsert(doc, pattern, `$1${esc(value)}$2`, tag)

      const page = ({ title, desc, ogDesc, route, type = 'website', image, publishedTime, author, jsonLd, noindex = false }) => {
        const full = title ? pageTitle(title) : HOME_OG_TITLE
        const url = route == null ? null : `${siteUrl}/${route ? route + '/' : ''}`
        const socialDesc = ogDesc || desc
        const img = image || {
          url: `${siteUrl}${DEFAULT_SOCIAL.path}`,
          width: DEFAULT_SOCIAL.width,
          height: DEFAULT_SOCIAL.height,
          type: DEFAULT_SOCIAL.type,
          alt: DEFAULT_SOCIAL.alt,
        }
        let out = html
        out = setOrInsert(out, /<title>.*?<\/title>/, `<title>${esc(full)}</title>`, `<title>${esc(full)}</title>`)
        out = setAttr(out, /(<meta name="description" content=")[^"]*(")/, desc, `<meta name="description" content="${esc(desc)}" />`)
        out = setAttr(out, /(<meta property="og:title" content=")[^"]*(")/, full, `<meta property="og:title" content="${esc(full)}" />`)
        out = setAttr(out, /(<meta property="og:description" content=")[^"]*(")/, socialDesc, `<meta property="og:description" content="${esc(socialDesc)}" />`)
        out = setAttr(out, /(<meta property="og:type" content=")[^"]*(")/, type, `<meta property="og:type" content="${esc(type)}" />`)
        if (url) {
          out = setAttr(out, /(<link rel="canonical" href=")[^"]*(")/, url, `<link rel="canonical" href="${esc(url)}" />`)
          out = setAttr(out, /(<meta property="og:url" content=")[^"]*(")/, url, `<meta property="og:url" content="${esc(url)}" />`)
        }
        out = setAttr(out, /(<meta property="og:image" content=")[^"]*(")/, img.url, `<meta property="og:image" content="${esc(img.url)}" />`)
        out = setAttr(out, /(<meta property="og:image:width" content=")[^"]*(")/, String(img.width), `<meta property="og:image:width" content="${esc(String(img.width))}" />`)
        out = setAttr(out, /(<meta property="og:image:height" content=")[^"]*(")/, String(img.height), `<meta property="og:image:height" content="${esc(String(img.height))}" />`)
        out = setAttr(out, /(<meta property="og:image:alt" content=")[^"]*(")/, img.alt, `<meta property="og:image:alt" content="${esc(img.alt)}" />`)
        out = setAttr(out, /(<meta property="og:image:type" content=")[^"]*(")/, img.type, `<meta property="og:image:type" content="${esc(img.type)}" />`)
        out = setAttr(out, /(<meta name="twitter:title" content=")[^"]*(")/, full, `<meta name="twitter:title" content="${esc(full)}" />`)
        out = setAttr(out, /(<meta name="twitter:description" content=")[^"]*(")/, socialDesc, `<meta name="twitter:description" content="${esc(socialDesc)}" />`)
        out = setAttr(out, /(<meta name="twitter:image" content=")[^"]*(")/, img.url, `<meta name="twitter:image" content="${esc(img.url)}" />`)
        out = setAttr(out, /(<meta name="twitter:image:alt" content=")[^"]*(")/, img.alt, `<meta name="twitter:image:alt" content="${esc(img.alt)}" />`)
        if (noindex) {
          out = setAttr(out, /(<meta name="robots" content=")[^"]*(")/, 'noindex', `<meta name="robots" content="noindex" />`)
        }
        if (publishedTime) {
          out = setAttr(out, /(<meta property="article:published_time" content=")[^"]*(")/, publishedTime, `<meta property="article:published_time" content="${esc(publishedTime)}" />`)
        }
        if (author) {
          out = setAttr(out, /(<meta property="article:author" content=")[^"]*(")/, author, `<meta property="article:author" content="${esc(author)}" />`)
        }
        if (jsonLd) {
          const script = jsonLdScript(jsonLd)
          if (out.includes('id="ot-jsonld"')) {
            out = out.replace(/<script type="application\/ld\+json" id="ot-jsonld">[\s\S]*?<\/script>/, script)
          } else {
            out = out.replace('</head>', `    ${script}\n  </head>`)
          }
        }
        return out
      }

      const aboutDesc = 'The mission, principles and editor of Offline Theory, an independent publication on cybersecurity, technology and internet culture.'
      const searchDesc = 'Search every article in Offline Theory.'

      const routes = [
        ...SECTIONS.map((s) => ({
          route: s.slug,
          title: s.title,
          desc: s.description,
        })),
        { route: 'about', title: 'About', desc: aboutDesc },
        { route: 'privacy', title: 'Privacy policy', desc: 'How OFFLINE THEORY collects and uses information, including the newsletter, hosting, and affiliate links.' },
        { route: 'search', title: 'Search', desc: searchDesc },
        { route: 'threat-map', title: 'Live Cyber Threat Map', desc: 'A live map of cyber threat reports, source addresses, targeted ports, breach targets and exploited vulnerabilities from public data feeds.' },
        ...ARTICLES.map((a) => {
          const cover = getSeoCover(a.thumb)
          const hashed = cover ? findHashedAsset(dist, cover.filePrefix) : null
          const image = cover && hashed
            ? {
                url: `${siteUrl}${hashed}`,
                width: cover.width,
                height: cover.height,
                type: cover.type,
                alt: cover.alt,
              }
            : undefined
          const url = `${siteUrl}/article/${a.slug}/`
          return {
            route: `article/${a.slug}`,
            title: a.title,
            desc: a.dek,
            type: 'article',
            image,
            publishedTime: a.date,
            author: a.author,
            noindex: a.placeholder !== false,
            jsonLd: articleJsonLd({
              title: a.title,
              description: a.dek,
              url,
              image: image?.url,
              date: a.date,
              author: a.author,
              section: a.section,
              category: a.category,
            }),
          }
        }),
      ]
      for (const entry of routes) {
        const dir = path.join(dist, entry.route)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'index.html'), page(entry))
      }
      const homeHtml = page({
        title: '',
        desc: DEFAULT_DESC,
        ogDesc: HOME_OG_DESC,
        route: '',
        jsonLd: websiteJsonLd({
          url: `${siteUrl}/`,
          description: HOME_OG_DESC,
        }),
      })
      fs.writeFileSync(indexPath, homeHtml)
      const notFound = page({
        title: 'Page not found',
        desc: 'This page is offline.',
      })
      const notFoundIndexed = notFound.includes('name="robots"')
        ? notFound.replace(/(<meta name="robots" content=")[^"]*(")/, '$1noindex$2')
        : notFound.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>')
      const notFoundClean = notFoundIndexed
        .replace(/\s*<link rel="canonical" href="[^"]*" \/>/, '')
        .replace(/\s*<meta property="og:url" content="[^"]*" \/>/, '')
      fs.writeFileSync(path.join(dist, '404.html'), notFoundClean)
      const sitemapUrls = [
        { loc: `${siteUrl}/` },
        ...routes.filter((r) => !r.noindex).map((r) => {
          const loc = `${siteUrl}/${r.route}/`
          return r.publishedTime ? { loc, lastmod: r.publishedTime } : { loc }
        }),
      ]
      fs.writeFileSync(
        path.join(dist, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((u) => {
          const last = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''
          return `  <url>\n    <loc>${u.loc}</loc>${last}\n  </url>`
        }).join('\n')}\n</urlset>\n`,
      )
      fs.writeFileSync(
        path.join(dist, 'robots.txt'),
        `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
      )
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), preloadMastheadFonts(), staticRoutes()],
})
