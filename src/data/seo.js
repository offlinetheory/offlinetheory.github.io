export const SITE_NAME = 'Offline Theory'
export const SITE_BRAND = 'OFFLINE THEORY'
export const DEFAULT_DESC =
  'Offline Theory is an independent publishing initiative exploring cybersecurity, technology, and the culture of the internet.'
export const HOME_OG_TITLE = 'OFFLINE THEORY — The Digital Security Journal'
export const HOME_OG_DESC =
  'Independent perspectives on cybersecurity, technology, and internet culture.'

export const DEFAULT_SOCIAL = {
  path: '/assets/offline-theory-social.png',
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'OFFLINE THEORY — The Digital Security Journal',
}

export function pageTitle(title) {
  return title ? `${title} — ${SITE_NAME}` : HOME_OG_TITLE
}

/** Pick the largest URL from a srcset string. */
export function largestSrc(srcSet, fallback) {
  if (!srcSet) return fallback
  let best = fallback
  let bestW = -1
  for (const part of srcSet.split(',')) {
    const [url, w] = part.trim().split(/\s+/)
    const n = Number.parseInt(w, 10)
    if (url && n > bestW) {
      best = url
      bestW = n
    }
  }
  return best
}

export function articleJsonLd({
  title,
  description,
  url,
  image,
  date,
  author,
  section,
  category,
}) {
  const type = section === 'news' ? 'NewsArticle' : 'Article'
  const data = {
    '@context': 'https://schema.org',
    '@type': type,
    headline: title,
    description,
    datePublished: date,
    dateModified: date,
    author: { '@type': 'Person', name: author },
    publisher: {
      '@type': 'Organization',
      name: SITE_BRAND,
      url: url ? new URL('/', url).origin + '/' : undefined,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
  if (image) data.image = [image]
  const sectionLabel = category || section
  if (sectionLabel) data.articleSection = sectionLabel
  if (!data.publisher.url) delete data.publisher.url
  return data
}

export function websiteJsonLd({ url, description }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_BRAND,
    alternateName: SITE_NAME,
    url,
    description: description || HOME_OG_DESC,
    publisher: { '@type': 'Organization', name: SITE_BRAND, url },
  }
}

export function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<script type="application/ld+json" id="ot-jsonld">${json}</script>`
}
