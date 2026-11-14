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
