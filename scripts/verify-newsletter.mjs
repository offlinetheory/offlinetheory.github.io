/**
 * Verifies the newsletter request shape with a mocked fetch.
 * Does not contact beehiiv or submit a real subscription.
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

const {
  subscribe,
  validateEmail,
  buildSubscribeRequest,
  BEEHIIV_MAGIC_LINK,
  SUCCESS_MESSAGE,
  isDemoMode,
} = await import(pathToFileURL(tmp).href)

assert.equal(isDemoMode, false)
assert.equal(
  BEEHIIV_MAGIC_LINK,
  'https://magic.beehiiv.com/v1/bc0634fe-2700-45f4-bb11-ccabad602e31',
)
assert.equal(validateEmail(''), 'Please enter your email address.')
assert.equal(validateEmail('not-an-email'), 'Please enter a valid email address.')
assert.equal(validateEmail('reader@example.com'), null)

const built = buildSubscribeRequest('reader@example.com')
const builtUrl = new URL(built.url)
assert.equal(builtUrl.origin + builtUrl.pathname, BEEHIIV_MAGIC_LINK)
assert.equal(builtUrl.searchParams.get('email'), 'reader@example.com')
assert.equal(built.options.method, 'POST')
assert.equal(built.options.mode, 'no-cors')
assert.ok(built.options.body instanceof URLSearchParams, 'body must be URLSearchParams')
assert.equal(built.options.body.get('signup[email]'), 'reader@example.com')
assert.equal(built.options.body.get('redirect_to'), '')
assert.deepEqual(
  [...built.options.body.keys()],
  ['signup[email]', 'redirect_to'],
)

const override = buildSubscribeRequest(
  'reader@example.com',
  'https://example.test/subscribe?utm=test',
)
const overrideUrl = new URL(override.url)
assert.equal(overrideUrl.origin + overrideUrl.pathname, 'https://example.test/subscribe')
assert.equal(overrideUrl.searchParams.get('utm'), 'test')
assert.equal(overrideUrl.searchParams.get('email'), 'reader@example.com')

const calls = []
const mockFetch = async (url, options = {}) => {
  calls.push({ url, options })
  return { type: 'opaque', ok: false, status: 0 }
}

const result = await subscribe('Reader@Example.COM', { fetch: mockFetch })
assert.equal(calls.length, 1, 'fetch should be called once')
const { url, options } = calls[0]
const called = new URL(url)
assert.equal(called.origin + called.pathname, BEEHIIV_MAGIC_LINK)
assert.equal(called.searchParams.get('email'), 'reader@example.com')
assert.equal(options.method, 'POST')
assert.equal(options.mode, 'no-cors')
assert.ok(options.body instanceof URLSearchParams)
assert.equal(options.body.get('signup[email]'), 'reader@example.com')
assert.equal(options.body.get('redirect_to'), '')
assert.equal(result.ok, true)
assert.equal(result.demo, false)
assert.equal(result.message, SUCCESS_MESSAGE)
assert.match(result.message, /welcome email/i)
assert.doesNotMatch(result.message, /confirm/i)

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
