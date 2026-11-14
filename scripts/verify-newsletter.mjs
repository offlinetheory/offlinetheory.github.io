/**
 * Verifies the newsletter request shape with a mocked fetch.
 * Does not contact Buttondown or submit a real subscription.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const srcPath = join(fileURLToPath(new URL('..', import.meta.url)), 'src/services/newsletter.js')
const source = (await readFile(srcPath, 'utf8')).replaceAll(
  'import.meta.env.VITE_NEWSLETTER_ENDPOINT',
  'undefined',
)
const dir = await mkdtemp(join(tmpdir(), 'ot-newsletter-'))
const tmp = join(dir, 'newsletter.mjs')
await writeFile(tmp, source)

const { subscribe, validateEmail, BUTTONDOWN_EMBED_SUBSCRIBE, isDemoMode } = await import(
  pathToFileURL(tmp).href
)

assert.equal(isDemoMode, false)
assert.equal(
  BUTTONDOWN_EMBED_SUBSCRIBE,
  'https://buttondown.com/api/emails/embed-subscribe/offlinetheory',
)
assert.equal(validateEmail(''), 'Please enter your email address.')
assert.equal(validateEmail('not-an-email'), 'Please enter a valid email address.')
assert.equal(validateEmail('reader@example.com'), null)

const calls = []
const mockFetch = async (url, options = {}) => {
  calls.push({ url, options })
  return { type: 'opaque', ok: false, status: 0 }
}

const result = await subscribe('Reader@Example.COM', { fetch: mockFetch })
assert.equal(calls.length, 1, 'fetch should be called once')
const { url, options } = calls[0]
assert.equal(url, BUTTONDOWN_EMBED_SUBSCRIBE)
assert.equal(options.method, 'POST')
assert.equal(options.mode, 'no-cors')
assert.ok(options.body instanceof FormData, 'body must be FormData')
assert.equal(options.body.get('email'), 'reader@example.com')
assert.deepEqual(
  [...options.body.keys()],
  ['email'],
  'the only form field should be email',
)
assert.equal(result.ok, true)
assert.equal(result.demo, false)
assert.match(result.message, /check your inbox/i)

let reachedNetwork = false
const throwingFetch = async () => {
  reachedNetwork = true
  throw new TypeError('Failed to fetch')
}
await assert.rejects(
  () => subscribe('reader@example.com', { fetch: throwingFetch }),
  (err) => {
    assert.equal(err.message, 'We could not reach the newsletter service. Please try again.')
    return true
  },
)
assert.equal(reachedNetwork, true)

console.log('newsletter request shape ok (mocked fetch, no real subscription)')
