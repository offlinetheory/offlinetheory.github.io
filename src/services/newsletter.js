/**
 * Newsletter signup service.
 *
 * By default the email is POSTed as FormData to Buttondown's public
 * embed-subscribe endpoint (no API key). The request uses mode "no-cors",
 * so a completed (opaque) response is treated as success; a network failure
 * shows the existing reachability error.
 *
 * Set VITE_NEWSLETTER_ENDPOINT to override the URL.
 */

export const BUTTONDOWN_EMBED_SUBSCRIBE =
  'https://buttondown.com/api/emails/embed-subscribe/offlinetheory'

const ENDPOINT = (import.meta.env.VITE_NEWSLETTER_ENDPOINT || BUTTONDOWN_EMBED_SUBSCRIBE).trim()

export const isDemoMode = false

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(value) {
  const email = String(value || '').trim()
  if (!email) return 'Please enter your email address.'
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'Please enter a valid email address.'
  return null
}

/**
 * Build the POST used by subscribe(). Exported so tests can inspect the shape
 * without sending a real request.
 * @param {string} email
 * @param {string} [endpoint]
 */
export function buildSubscribeRequest(email, endpoint = ENDPOINT) {
  const body = new FormData()
  body.append('email', email)
  return {
    url: endpoint,
    options: { method: 'POST', body, mode: 'no-cors' },
  }
}

/**
 * @returns {Promise<{ ok: true, demo: boolean, message: string }>}
 * @throws {Error} with a user-facing message on failure
 */
export async function subscribe(rawEmail, { signal, fetch: fetchFn = globalThis.fetch } = {}) {
  const email = String(rawEmail || '').trim().toLowerCase()
  const invalid = validateEmail(email)
  if (invalid) throw new Error(invalid)

  const { url, options } = buildSubscribeRequest(email)
  try {
    await fetchFn(url, { ...options, signal })
  } catch {
    throw new Error('We could not reach the newsletter service. Please try again.')
  }
  // mode: 'no-cors' yields an opaque response (status 0, ok false) on success,
  // so any completed fetch is treated as success.
  return { ok: true, demo: false, message: 'Thank you. Check your inbox to confirm your subscription.' }
}
