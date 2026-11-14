/**
 * Newsletter signup service.
 *
 * - If VITE_NEWSLETTER_ENDPOINT is set, the email is POSTed there.
 *   VITE_NEWSLETTER_FORMAT = "json" (default) sends {"email": "..."} as JSON,
 *   "form" sends `email=...` as application/x-www-form-urlencoded.
 * - If it is NOT set, the form runs in DEMO MODE: nothing leaves the browser.
 *   The address is kept in localStorage only so the UI can show a realistic state.
 *
 * See README.md ("Connecting the newsletter") for Buttondown, Mailchimp and Kit (ConvertKit).
 */

const ENDPOINT = (import.meta.env.VITE_NEWSLETTER_ENDPOINT || '').trim()
const FORMAT = (import.meta.env.VITE_NEWSLETTER_FORMAT || 'json').trim().toLowerCase()

export const isDemoMode = !ENDPOINT

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(value) {
  const email = String(value || '').trim()
  if (!email) return 'Please enter your email address.'
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'Please enter a valid email address.'
  return null
}

/**
 * @returns {Promise<{ ok: true, demo: boolean, message: string }>}
 * @throws {Error} with a user-facing message on failure
 */
export async function subscribe(rawEmail, { signal } = {}) {
  const email = String(rawEmail || '').trim().toLowerCase()
  const invalid = validateEmail(email)
  if (invalid) throw new Error(invalid)

  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 450))
    try {
      const list = JSON.parse(localStorage.getItem('ot-demo-subscribers') || '[]')
      if (!list.includes(email)) list.push(email)
      localStorage.setItem('ot-demo-subscribers', JSON.stringify(list))
    } catch { /* storage unavailable: fine in demo mode */ }
    return {
      ok: true,
      demo: true,
      message: 'Demo mode: your address was validated but not sent anywhere. Connect a newsletter service to go live.',
    }
  }

  const isForm = FORMAT === 'form'
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: isForm
        ? { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
        : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: isForm ? new URLSearchParams({ email }).toString() : JSON.stringify({ email }),
      signal,
    })
  } catch {
    throw new Error('We could not reach the newsletter service. Please try again.')
  }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json())?.message || '' } catch { /* not JSON */ }
    throw new Error(detail || `Subscription failed (${res.status}). Please try again.`)
  }
  return { ok: true, demo: false, message: 'Thank you. Check your inbox to confirm your subscription.' }
}
