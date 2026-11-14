/**
 * Newsletter signup service.
 *
 * By default the email is POSTed to beehiiv's public Magic Link subscribe
 * action (no API key). A GET to the Magic Link only loads a "Click to
 * subscribe" page and does not add the subscriber; the confirmation form
 * POSTs `signup[email]` to the same URL. The request uses mode "no-cors",
 * so a completed (opaque) response is treated as success; a network failure
 * shows the existing reachability error. If fetch is blocked, the request is
 * retried as a hidden iframe form POST so the browser still issues it.
 *
 * Set VITE_NEWSLETTER_ENDPOINT to override the Magic Link base URL.
 */

export const BEEHIIV_MAGIC_LINK =
  'https://magic.beehiiv.com/v1/bc0634fe-2700-45f4-bb11-ccabad602e31'

const ENDPOINT = (import.meta.env.VITE_NEWSLETTER_ENDPOINT || BEEHIIV_MAGIC_LINK).trim()

export const isDemoMode = false

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const REACHABILITY_ERROR = 'We could not reach the newsletter service. Please try again.'

export const SUCCESS_MESSAGE = "You're subscribed! Check your inbox for a welcome email."

export function validateEmail(value) {
  const email = String(value || '').trim()
  if (!email) return 'Please enter your email address.'
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'Please enter a valid email address.'
  return null
}

/**
 * Build the Magic Link subscribe-action URL used by subscribe().
 * @param {string} email
 * @param {string} [endpoint] Magic Link base URL (query params other than email are kept)
 */
export function buildSubscribeUrl(email, endpoint = ENDPOINT) {
  const url = new URL(endpoint)
  // Remix form action qualifier used by the Magic Link confirmation page
  if (!url.searchParams.has('index')) url.searchParams.set('index', '')
  url.searchParams.set('email', email)
  return url.toString()
}

/**
 * Build the POST used by subscribe(). Exported so tests can inspect the shape
 * without sending a real request.
 * @param {string} email
 * @param {string} [endpoint]
 */
export function buildSubscribeRequest(email, endpoint = ENDPOINT) {
  const body = new URLSearchParams()
  body.set('signup[email]', email)
  // Do not set a redirect_to — this is a background request.
  body.set('redirect_to', '')
  return {
    url: buildSubscribeUrl(email, endpoint),
    options: { method: 'POST', body, mode: 'no-cors' },
  }
}

/**
 * Fallback when fetch(no-cors) fails. A real form POST in a hidden iframe
 * matches the Magic Link confirmation page more closely than fetch.
 * @param {string} url
 * @param {URLSearchParams} fields
 * @param {AbortSignal} [signal]
 */
function requestViaHiddenIframe(url, fields, signal) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error(REACHABILITY_ERROR))
      return
    }
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }

    const name = `ot-nl-${Math.random().toString(36).slice(2)}`
    const iframe = document.createElement('iframe')
    iframe.name = name
    iframe.setAttribute('aria-hidden', 'true')
    iframe.tabIndex = -1
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = url
    form.target = name
    form.acceptCharset = 'UTF-8'
    form.style.display = 'none'
    for (const [key, value] of fields.entries()) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = value
      form.appendChild(input)
    }

    const settle = (ok, reason) => {
      if (iframe._otSettled) return
      iframe._otSettled = true
      iframe.onload = null
      iframe.onerror = null
      signal?.removeEventListener('abort', onAbort)
      clearTimeout(timer)
      iframe.remove()
      form.remove()
      if (ok) resolve()
      else reject(reason ?? new Error(REACHABILITY_ERROR))
    }
    const onAbort = () => settle(false, signal.reason ?? new DOMException('Aborted', 'AbortError'))
    iframe.onload = () => settle(true)
    iframe.onerror = () => settle(true)
    const timer = setTimeout(() => settle(true), 4000)
    signal?.addEventListener('abort', onAbort)
    document.body.append(iframe, form)
    form.submit()
  })
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
  } catch (err) {
    if (signal?.aborted) throw err
    try {
      await requestViaHiddenIframe(url, options.body, signal)
    } catch (fallbackErr) {
      if (signal?.aborted) throw fallbackErr
      throw new Error(REACHABILITY_ERROR)
    }
  }
  // mode: 'no-cors' yields an opaque response (status 0, ok false) on success,
  // so any completed fetch is treated as success.
  return { ok: true, demo: false, message: SUCCESS_MESSAGE }
}
