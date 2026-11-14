/**
 * Newsletter signup config.
 *
 * The site embeds beehiiv's official Slim Inline subscribe form (email +
 * Subscribe button) via the v3 loader. No API key is used.
 *
 * Set VITE_BEEHIIV_FORM_ID to override the form id.
 */

export const BEEHIIV_FORM_ID_DEFAULT = 'ef3fc9ae-3ac2-4e1b-9569-4f9329d9b5aa'

export const BEEHIIV_LOADER_SRC = 'https://subscribe-forms.beehiiv.com/v3/loader.js'

export const BEEHIIV_FORM_ID = (
  import.meta.env.VITE_BEEHIIV_FORM_ID || BEEHIIV_FORM_ID_DEFAULT
).trim()

// beehiiv publication id; the loader sets bhv_<id>_subscribed after a signup
// and then hides its form in that browser for a year.
export const BEEHIIV_PUBLICATION_ID = 'bc0634fe-2700-45f4-bb11-ccabad602e31'

export function isBeehiivSubscribed() {
  if (typeof document === 'undefined') return false
  const name = `bhv_${BEEHIIV_PUBLICATION_ID}_subscribed=`
  return document.cookie.split('; ').some((c) => c.startsWith(name))
}
