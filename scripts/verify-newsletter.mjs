/**
 * Verifies the beehiiv embed wiring.
 * Does not contact beehiiv or submit a real subscription.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('..', import.meta.url))
const srcPath = join(root, 'src/services/newsletter.js')
const componentPath = join(root, 'src/components/Newsletter.jsx')
const cssPath = join(root, 'src/components/Newsletter.css')

const source = (await readFile(srcPath, 'utf8')).replaceAll(
  'import.meta.env.VITE_BEEHIIV_FORM_ID',
  'undefined',
)
const dir = await mkdtemp(join(tmpdir(), 'ot-newsletter-'))
const tmp = join(dir, 'newsletter.mjs')
await writeFile(tmp, source)

const {
  BEEHIIV_FORM_ID,
  BEEHIIV_FORM_ID_DEFAULT,
  BEEHIIV_LOADER_SRC,
} = await import(pathToFileURL(tmp).href)

assert.equal(BEEHIIV_FORM_ID_DEFAULT, 'ef3fc9ae-3ac2-4e1b-9569-4f9329d9b5aa')
assert.equal(BEEHIIV_FORM_ID, BEEHIIV_FORM_ID_DEFAULT)
assert.equal(BEEHIIV_LOADER_SRC, 'https://subscribe-forms.beehiiv.com/v3/loader.js')

const overrideSource = (await readFile(srcPath, 'utf8')).replaceAll(
  'import.meta.env.VITE_BEEHIIV_FORM_ID',
  '"custom-form-id"',
)
const overrideTmp = join(dir, 'newsletter-override.mjs')
await writeFile(overrideTmp, overrideSource)
const overridden = await import(pathToFileURL(overrideTmp).href)
assert.equal(overridden.BEEHIIV_FORM_ID, 'custom-form-id')

const jsx = await readFile(componentPath, 'utf8')
assert.match(jsx, /Stay offline, in the know\./)
assert.match(jsx, /A weekly dispatch on security, tech, and the internet\./)
assert.match(jsx, /useEffect/)
assert.match(jsx, /document\.createElement\('script'\)/)
assert.match(jsx, /script\.async = true/)
assert.match(jsx, /script\.src = BEEHIIV_LOADER_SRC/)
assert.match(jsx, /data-beehiiv-form/)
assert.doesNotMatch(jsx, /<form[\s>]/)
assert.doesNotMatch(jsx, /subscribe\(/)
assert.doesNotMatch(jsx, /Magic Link|magic\.beehiiv|buttondown/i)

const css = await readFile(cssPath, 'utf8')
assert.match(css, /\.newsletter__embed\s*\{[^}]*width:\s*418px/s)
assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.newsletter__embed \{ width: 100%; \}/)

console.log('newsletter embed wiring ok (no real subscription)')
