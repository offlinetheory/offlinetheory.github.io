import { useEffect, useId, useRef } from 'react'
import { BEEHIIV_FORM_ID, BEEHIIV_LOADER_SRC } from '../services/newsletter.js'
import './Newsletter.css'

export default function Newsletter({ compact = false }) {
  const id = useId()
  const embedRef = useRef(null)

  useEffect(() => {
    const host = embedRef.current
    if (!host || !BEEHIIV_FORM_ID) return
    if (host.querySelector('script[data-beehiiv-form]')) return

    const script = document.createElement('script')
    script.async = true
    script.src = BEEHIIV_LOADER_SRC
    script.setAttribute('data-beehiiv-form', BEEHIIV_FORM_ID)
    host.appendChild(script)

    return () => {
      const embed = window.__bhv_embeds?.[BEEHIIV_FORM_ID]
      if (embed && embed.script === script && typeof embed.destroy === 'function') {
        embed.destroy()
      }
      if (script.parentNode) script.remove()
      host.replaceChildren()
    }
  }, [])

  return (
    <section className={`newsletter ${compact ? 'newsletter--compact' : ''}`} aria-labelledby={`${id}-h`}>
      <div className="newsletter__copy">
        <h2 id={`${id}-h`} className="newsletter__title">Stay offline, in the know.</h2>
        <p className="newsletter__dek">A weekly dispatch on security, tech, and the internet.</p>
      </div>
      <div
        ref={embedRef}
        className="newsletter__embed"
        data-beehiiv-form-id={BEEHIIV_FORM_ID}
      />
    </section>
  )
}
