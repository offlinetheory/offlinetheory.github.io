import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  DEFAULT_DESC,
  DEFAULT_SOCIAL,
  HOME_OG_DESC,
  pageTitle,
  websiteJsonLd,
} from '../data/seo.js'

const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')

function origin() {
  return SITE_URL || (typeof window !== 'undefined'
    ? window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')
    : 'https://offlinetheory.github.io')
}

function absUrl(pathOrUrl) {
  if (!pathOrUrl) return origin() + DEFAULT_SOCIAL.path
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return origin() + (pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`)
}

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (content == null || content === '') {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setJsonLd(data) {
  let el = document.getElementById('ot-jsonld')
  if (!data) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = 'ot-jsonld'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

/** Sets <title>, description, Open Graph, Twitter, canonical, and JSON-LD per route. */
export function useMeta({
  title,
  description,
  type = 'website',
  image,
  imageAlt,
  imageWidth,
  imageHeight,
  imageType,
  publishedTime,
  author,
  jsonLd,
  noindex = false,
} = {}) {
  const { pathname } = useLocation()
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : ''
  useEffect(() => {
    const isHome = !title
    const full = pageTitle(title)
    const pageDesc = description ?? DEFAULT_DESC
    const ogDesc = isHome && description == null ? HOME_OG_DESC : pageDesc
    const root = origin()
    const href = root + pathname.replace(/\/?$/, '/')
    const social = {
      url: absUrl(image || DEFAULT_SOCIAL.path),
      alt: imageAlt || DEFAULT_SOCIAL.alt,
      width: String(imageWidth || DEFAULT_SOCIAL.width),
      height: String(imageHeight || DEFAULT_SOCIAL.height),
      type: imageType || DEFAULT_SOCIAL.type,
    }

    document.title = full
    setMeta('name', 'description', pageDesc)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', ogDesc)
    setMeta('property', 'og:type', type)
    setMeta('property', 'og:url', href)
    setMeta('property', 'og:site_name', 'OFFLINE THEORY')
    setMeta('property', 'og:image', social.url)
    setMeta('property', 'og:image:width', social.width)
    setMeta('property', 'og:image:height', social.height)
    setMeta('property', 'og:image:alt', social.alt)
    setMeta('property', 'og:image:type', social.type)
    setMeta('property', 'article:published_time', publishedTime || '')
    setMeta('property', 'article:author', author || '')
    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', full)
    setMeta('name', 'twitter:description', ogDesc)
    setMeta('name', 'twitter:image', social.url)
    setMeta('name', 'twitter:image:alt', social.alt)
    setMeta('name', 'robots', noindex ? 'noindex' : '')

    let link = document.head.querySelector('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = href

    const parsed = jsonLdKey ? JSON.parse(jsonLdKey) : null
    const schema = parsed ?? (isHome ? websiteJsonLd({ url: href, description: HOME_OG_DESC }) : null)
    setJsonLd(schema)
  }, [
    title,
    description,
    type,
    image,
    imageAlt,
    imageWidth,
    imageHeight,
    imageType,
    publishedTime,
    author,
    noindex,
    jsonLdKey,
    pathname,
  ])
}

export { origin as siteOrigin }
