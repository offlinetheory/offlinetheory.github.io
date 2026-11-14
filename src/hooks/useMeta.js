import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'Offline Theory'
const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')
const DEFAULT_DESC =
  'Offline Theory is an independent publishing initiative exploring cybersecurity, technology, and the culture of the internet.'

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
export function useMeta({ title, description = DEFAULT_DESC, type = 'website' } = {}) {
  const { pathname } = useLocation()
  useEffect(() => {
    const full = title ? `${title} — ${SITE}` : `${SITE} — The Digital Security Journal`
    document.title = full
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:type', type)
    const root = SITE_URL || window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')
    const href = root + pathname.replace(/\/?$/, '/')
    setMeta('property', 'og:url', href)
    let link = document.head.querySelector('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = href
  }, [title, description, type, pathname])
}
