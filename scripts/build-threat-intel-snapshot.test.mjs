import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dshieldPortEvent,
  dshieldSourceEvent,
  collectCloudflareRadar,
  normalizeCloudflareRadarResponse,
  normalizeDshieldPorts,
  normalizeEvent,
} from './build-threat-intel-snapshot.mjs'

test('normalizes DShield date-qualified topports rows from the provider response shape', () => {
  const ports = normalizeDshieldPorts({
    0: { rank: 2, targetport: 22, records: 125, targets: 12, sources: 9 },
    1: { rank: 1, targetport: 443, records: 200, targets: 20, sources: 15 },
    date: '2026-11-25',
    limit: 10,
  })

  assert.equal(ports.date, '2026-11-25')
  assert.deepEqual(ports.topports.map(({ rank, targetport, records }) => ({ rank, targetport, records })), [
    { rank: 1, targetport: 443, records: 200 },
    { rank: 2, targetport: 22, records: 125 },
  ])
})

test('rejects empty or count-free DShield topports responses', () => {
  assert.throws(
    () => normalizeDshieldPorts({ date: '2026-11-25', limit: 10 }),
    /contains no valid ranked ports with report counts/,
  )
  assert.throws(
    () => normalizeDshieldPorts({
      date: '2026-11-25',
      0: { rank: 1, targetport: 443, records: null },
    }),
    /contains no valid ranked ports with report counts/,
  )
  assert.throws(
    () => normalizeDshieldPorts({
      date: '2026-11-25',
      0: { rank: 1, targetport: 443, records: 0 },
    }),
    /contains no valid ranked ports with report counts/,
  )
})

test('uses the DShield supplied port date and report count as the event timestamp and value', () => {
  const event = dshieldPortEvent({
    rank: 1,
    targetport: 443,
    records: 200,
    date: '2026-11-25',
  })

  assert.equal(event.firstObservedAt, '2026-11-25T00:00:00.000Z')
  assert.equal(event.lastObservedAt, '2026-11-25T00:00:00.000Z')
  assert.equal(event.details.reports, 200)
  assert.equal(event.details.rank, 1)
  assert.equal(dshieldPortEvent({ rank: 1, targetport: 443, date: '2026-11-25' }), null)
})

test('leaves DShield source event timestamps null when the provider supplies none', () => {
  const event = dshieldSourceEvent({ ip: '13.94.254.200', reports: 10 })

  assert.equal(event.firstObservedAt, null)
  assert.equal(event.lastObservedAt, null)
})

test('normalizes provider timestamps and gives records stable provider-scoped IDs', () => {
  const event = normalizeEvent({
    provider: 'nvd',
    providerId: 'CVE-2026-1234',
    category: 'vulnerability',
    firstObservedAt: '2026-11-25T18:00:00.000Z',
    lastObservedAt: '2026-11-25T19:00:00.000Z',
    title: 'CVE-2026-1234',
    sourceUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1234',
  })

  assert.equal(event.id, 'nvd:CVE-2026-1234')
  assert.equal(event.firstObservedAt, '2026-11-25T18:00:00.000Z')
  assert.equal(event.lastObservedAt, '2026-11-25T19:00:00.000Z')
  assert.deepEqual(event.location, {
    country: null,
    countryCode: null,
    latitude: null,
    longitude: null,
  })
})

test('keeps unavailable source timestamps null rather than inventing observation times', () => {
  const event = normalizeEvent({
    provider: 'dshield',
    providerId: '203.0.113.8',
    category: 'scanning',
    title: 'Reported source',
    sourceUrl: 'https://isc.sans.edu/api/',
    firstObservedAt: null,
    lastObservedAt: 'not-a-timestamp',
  })

  assert.equal(event.firstObservedAt, null)
  assert.equal(event.lastObservedAt, null)
})

test('interprets NVD timestamps without an offset as UTC', () => {
  const event = normalizeEvent({
    provider: 'nvd',
    providerId: 'CVE-2026-5678',
    category: 'vulnerability',
    firstObservedAt: '2026-11-25T18:00:00.123',
    title: 'CVE-2026-5678',
    sourceUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2026-5678',
  })

  assert.equal(event.firstObservedAt, '2026-11-25T18:00:00.123Z')
})

test('rejects events missing required identity and source fields', () => {
  assert.throws(
    () => normalizeEvent({ provider: 'nvd', providerId: 'CVE-1', title: 'CVE-1' }),
    /requires provider, providerId, category, title, and sourceUrl/,
  )
})

const cloudflareResponse = {
  success: true,
  result: {
    meta: {
      lastUpdated: '2026-11-26T03:45:00Z',
      dateRange: [{
        startTime: '2026-11-25T03:45:00Z',
        endTime: '2026-11-26T03:45:00Z',
      }],
      units: [{ name: 'percentage', value: '%' }],
      normalization: 'PERCENTAGE',
    },
    top_0: [
      {
        originCountryAlpha2: 'US',
        originCountryName: 'United States',
        targetCountryAlpha2: 'DE',
        targetCountryName: 'Germany',
        value: '12.5',
      },
    ],
  },
}

test('normalizes Cloudflare Radar country pairs and preserves upstream response metadata', () => {
  const result = normalizeCloudflareRadarResponse(cloudflareResponse)

  assert.deepEqual(result, {
    meta: cloudflareResponse.result.meta,
    pairs: [{
      originCountryAlpha2: 'US',
      originCountryName: 'United States',
      targetCountryAlpha2: 'DE',
      targetCountryName: 'Germany',
      value: 12.5,
    }],
  })
  assert.throws(
    () => normalizeCloudflareRadarResponse({
      ...cloudflareResponse,
      result: { ...cloudflareResponse.result, top_0: [{ ...cloudflareResponse.result.top_0[0], value: 101 }] },
    }),
    /invalid country or percentage data/,
  )
  assert.throws(
    () => normalizeCloudflareRadarResponse({
      ...cloudflareResponse,
      result: {
        ...cloudflareResponse.result,
        meta: { ...cloudflareResponse.result.meta, dateRange: '1d' },
      },
    }),
    /missing valid upstream metadata/,
  )
  assert.throws(
    () => normalizeCloudflareRadarResponse({
      ...cloudflareResponse,
      result: {
        ...cloudflareResponse.result,
        meta: { ...cloudflareResponse.result.meta, dateRange: [] },
      },
    }),
    /missing valid upstream metadata/,
  )
  assert.throws(
    () => normalizeCloudflareRadarResponse({
      ...cloudflareResponse,
      result: {
        ...cloudflareResponse.result,
        meta: {
          ...cloudflareResponse.result.meta,
          dateRange: [{ startTime: 'not-a-timestamp', endTime: '2026-11-26T03:45:00Z' }],
        },
      },
    }),
    /missing valid upstream metadata/,
  )
  assert.throws(
    () => normalizeCloudflareRadarResponse({
      ...cloudflareResponse,
      result: {
        ...cloudflareResponse.result,
        meta: { ...cloudflareResponse.result.meta, units: 'percentage' },
      },
    }),
    /missing valid upstream metadata/,
  )
  assert.throws(
    () => normalizeCloudflareRadarResponse({
      ...cloudflareResponse,
      result: {
        ...cloudflareResponse.result,
        meta: { ...cloudflareResponse.result.meta, units: [{ name: 'percentage' }] },
      },
    }),
    /missing valid upstream metadata/,
  )
  assert.throws(
    () => normalizeCloudflareRadarResponse({
      success: false,
      errors: [{ code: 9106, message: 'Missing Authorization header' }],
      result: null,
    }),
    /success=false; errors: 9106: Missing Authorization header/,
  )
})

test('requests the official Cloudflare Radar API with bearer auth and prescribed query', async () => {
  let requestUrl
  let requestOptions
  const timestamp = new Date('2026-11-26T03:46:00.000Z')
  const result = await collectCloudflareRadar(null, {
    token: 'test-secret',
    now: () => timestamp,
    request: async (url, options) => {
      requestUrl = new URL(url)
      requestOptions = options
      return cloudflareResponse
    },
  })

  assert.equal(requestUrl.pathname, '/client/v4/radar/attacks/layer7/top/attacks')
  assert.deepEqual(Object.fromEntries(requestUrl.searchParams), {
    dateRange: '1d',
    limit: '50',
    normalization: 'PERCENTAGE',
    format: 'JSON',
  })
  assert.deepEqual(requestOptions.headers, { Authorization: 'Bearer test-secret' })
  assert.equal(result.provider.status, 'live')
  assert.equal(result.generatedAt, timestamp.toISOString())
  assert.equal(result.provider.fetchedAt, timestamp.toISOString())
  assert.equal(result.provider.lastUpdated, cloudflareResponse.result.meta.lastUpdated)
  assert.equal(result.pairs[0].value, 12.5)
})

test('accepts a successful empty Cloudflare result without inventing pairs', async () => {
  const result = await collectCloudflareRadar(null, {
    token: 'test-secret',
    request: async () => ({
      ...cloudflareResponse,
      result: { ...cloudflareResponse.result, top_0: [] },
    }),
  })

  assert.equal(result.provider.status, 'live')
  assert.equal(result.provider.pairCount, 0)
  assert.deepEqual(result.pairs, [])
  assert.deepEqual(result.meta, cloudflareResponse.result.meta)
})

test('retains the last successful Cloudflare Radar pairs and metadata after API failure', async () => {
  const previous = {
    generatedAt: '2026-11-26T03:30:00.000Z',
    provider: {
      status: 'live',
      fetchedAt: '2026-11-26T03:30:00.000Z',
    },
    meta: cloudflareResponse.result.meta,
    pairs: [{
      originCountryAlpha2: 'US',
      originCountryName: 'United States',
      targetCountryAlpha2: 'DE',
      targetCountryName: 'Germany',
      value: 12.5,
    }],
  }
  const result = await collectCloudflareRadar(previous, {
    token: 'configured-token',
    now: () => new Date('2026-11-26T03:46:00.000Z'),
    request: async () => { throw new Error('HTTP 401: invalid token') },
  })

  assert.equal(result.provider.status, 'stale')
  assert.equal(result.provider.fetchedAt, previous.provider.fetchedAt)
  assert.deepEqual(result.meta, previous.meta)
  assert.deepEqual(result.pairs, previous.pairs)
  assert.match(result.provider.error, /HTTP 401/)
})

test('marks Cloudflare Radar unconfigured without credentials and leaves data empty', async () => {
  const result = await collectCloudflareRadar(null, {
    token: '',
    request: async () => assert.fail('must not request Cloudflare without a token'),
  })

  assert.equal(result.provider.status, 'not_configured')
  assert.match(result.provider.error, /CLOUDFLARE_RADAR_API_TOKEN is not configured/)
  assert.equal(result.meta, null)
  assert.deepEqual(result.pairs, [])
})

test('marks Cloudflare Radar offline when a configured API request fails with no cache', async () => {
  const result = await collectCloudflareRadar(null, {
    token: 'configured-token',
    request: async () => { throw new Error('HTTP 401: invalid credentials') },
  })

  assert.equal(result.provider.status, 'offline')
  assert.equal(result.provider.pairCount, 0)
  assert.match(result.provider.error, /HTTP 401/)
})

test('records Cloudflare HTTP status, success field, errors, and response structure on API failure', async () => {
  const result = await collectCloudflareRadar(null, {
    token: 'configured-token',
    request: async () => ({
      httpStatus: 400,
      body: {
        success: false,
        errors: [{ code: 9106, message: 'Missing Authorization header' }],
        result: null,
      },
    }),
  })

  assert.equal(result.provider.status, 'offline')
  assert.match(result.provider.error, /HTTP 400/)
  assert.match(result.provider.error, /success=false/)
  assert.match(result.provider.error, /9106: Missing Authorization header/)
  assert.match(result.provider.error, /response keys=success,errors,result/)
  assert.match(result.provider.error, /result keys=none/)
})
