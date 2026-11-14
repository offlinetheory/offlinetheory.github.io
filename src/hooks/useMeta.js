import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'Offline Theory'
const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')
const DEFAULT_DESC =
  'Offline Theory is an independent publishing initiative exploring cybersecurity, technology, and the culture of the internet.'
const HOME_OG_TITLE = 'OFFLINE THEORY — The Digital Security Journal'
const HOME_OG_DESC =
  'Independent perspectives on cybersecurity, technology, and internet culture.'
const SOCIAL_IMAGE_PATH = '/assets/offline-theory-social.png'
const SOCIAL_IMAGE_ALT = 'OFFLINE THEORY — The Digital Security Journal'

function origin() {
  return SITE_URL || (typeof window !== 'undefined'
    ? window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')
    : 'https://offlinetheory.github.io')
}

function socialImageUrl() {
  return origin() + SOCIAL_IMAGE_PATH
}

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/** Sets <title>, description, Open Graph tags and canonical link per route. */
export function useMeta({ title, description, type = 'website' } = {}) {
  const { pathname } = useLocation()
  useEffect(() => {
    const isHome = !title
    const full = title ? `${title} — ${SITE}` : HOME_OG_TITLE
    const pageDesc = description ?? DEFAULT_DESC
    const ogDesc = isHome && description == null ? HOME_OG_DESC : pageDesc
    const root = origin()
    const href = root + pathname.replace(/\/?$/, '/')
    const image = socialImageUrl()

    document.title = full
    setMeta('name', 'description', pageDesc)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', ogDesc)
    setMeta('property', 'og:type', type)
    setMeta('property', 'og:url', href)
    setMeta('property', 'og:site_name', 'OFFLINE THEORY')
    setMeta('property', 'og:image', image)
    setMeta('property', 'og:image:width', '1200')
    setMeta('property', 'og:image:height', '630')
    setMeta('property', 'og:image:alt', SOCIAL_IMAGE_ALT)
    setMeta('property', 'og:image:type', 'image/png')
    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', full)
    setMeta('name', 'twitter:description', ogDesc)
    setMeta('name', 'twitter:image', image)
    setMeta('name', 'twitter:image:alt', SOCIAL_IMAGE_ALT)

    let link = document.head.querySelector('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = href
  }, [title, description, type, pathname])
}
