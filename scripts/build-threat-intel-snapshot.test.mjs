import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildCloudflareHistoryManifest,
  cloudflareIntervalWindow,
  collectCloudflareRadar,
  collectCloudflareRadarInterval,
  collectCloudflareRadarIntervals,
  dshieldPortEvent,
  dshieldSourceEvent,
  normalizeCloudflareRadarResponse,
  normalizeDshieldPorts,
  normalizeEvent,
  validateCloudflareIntervalMeta,
  writeCloudflareIntervalOutputs,
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
  // 24h window ending at now floored to the nearest 15 minutes (03:46 -> 03:45).
  assert.deepEqual(Object.fromEntries(requestUrl.searchParams), {
    dateStart: '2026-11-25T03:45:00.000Z',
    dateEnd: '2026-11-26T03:45:00.000Z',
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
    // Fixture window ends 2026-11-26T03:45Z, so pin "now" to match it.
    now: () => new Date('2026-11-26T03:46:00.000Z'),
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

// --- Statistics intervals + historical retention ---

// Clearly-marked fixture token: used ONLY as a stand-in Authorization value
// in mocked requests. It must never appear in any file the builder writes.
const FIXTURE_TOKEN = 'FIXTURE-TOKEN-DO-NOT-USE-7f3a9c2e'

function cloudflareFixtureForWindow(dateStart, dateEnd, extraRowFields = {}) {
  return {
    success: true,
    result: {
      meta: {
        lastUpdated: dateEnd,
        dateRange: [{ startTime: dateStart, endTime: dateEnd }],
        units: [{ name: 'percentage', value: '%' }],
        normalization: 'PERCENTAGE',
      },
      top_0: [{
        originCountryAlpha2: 'US',
        originCountryName: 'United States',
        targetCountryAlpha2: 'DE',
        targetCountryName: 'Germany',
        value: '12.5',
        ...extraRowFields,
      }],
    },
  }
}

// Mock request that answers every interval with a response whose meta
// matches exactly the window that was requested.
function matchingCloudflareRequest() {
  return async (url) => {
    const requested = new URL(url)
    return cloudflareFixtureForWindow(
      requested.searchParams.get('dateStart'),
      requested.searchParams.get('dateEnd'),
    )
  }
}

test('computes each interval window from a fixed now with the end floored to 15 minutes', () => {
  const now = new Date('2026-11-26T03:47:12.000Z')
  assert.deepEqual(cloudflareIntervalWindow('1h', now), {
    dateStart: '2026-11-26T02:45:00.000Z',
    dateEnd: '2026-11-26T03:45:00.000Z',
    durationMs: 60 * 60 * 1000,
  })
  assert.deepEqual(cloudflareIntervalWindow('6h', now), {
    dateStart: '2026-11-25T21:45:00.000Z',
    dateEnd: '2026-11-26T03:45:00.000Z',
    durationMs: 6 * 60 * 60 * 1000,
  })
  assert.deepEqual(cloudflareIntervalWindow('24h', now), {
    dateStart: '2026-11-25T03:45:00.000Z',
    dateEnd: '2026-11-26T03:45:00.000Z',
    durationMs: 24 * 60 * 60 * 1000,
  })
  assert.deepEqual(cloudflareIntervalWindow('7d', now), {
    dateStart: '2026-11-19T03:45:00.000Z',
    dateEnd: '2026-11-26T03:45:00.000Z',
    durationMs: 7 * 24 * 60 * 60 * 1000,
  })
  assert.throws(() => cloudflareIntervalWindow('30d', now), /Unknown Cloudflare interval/)
})

test('validates a matching Cloudflare window and rejects a wrong-duration window', () => {
  const window = { dateStart: '2026-11-26T02:45:00.000Z', dateEnd: '2026-11-26T03:45:00.000Z' }
  assert.equal(validateCloudflareIntervalMeta({
    lastUpdated: '2026-11-26T03:45:00Z',
    dateRange: [{ startTime: '2026-11-26T02:45:00Z', endTime: '2026-11-26T03:45:00Z' }],
  }, window), null)
  assert.match(
    validateCloudflareIntervalMeta({
      lastUpdated: '2026-11-26T03:45:00Z',
      dateRange: [{ startTime: '2026-11-25T03:45:00Z', endTime: '2026-11-26T03:45:00Z' }],
    }, window),
    /instead of the requested/,
  )
  assert.match(validateCloudflareIntervalMeta(null, window), /missing meta/)
  assert.match(validateCloudflareIntervalMeta({}, window), /dateRange is missing/)
})

test('requests a distinct exact dateStart/dateEnd window per interval', async () => {
  const seen = {}
  const results = await collectCloudflareRadarIntervals({}, {
    token: FIXTURE_TOKEN,
    now: () => new Date('2026-11-26T03:47:12.000Z'),
    request: async (url, options) => {
      const requested = new URL(url)
      assert.equal(options.headers.Authorization, `Bearer ${FIXTURE_TOKEN}`)
      seen[requested.searchParams.get('dateEnd') + '|' + requested.searchParams.get('dateStart')] = true
      return cloudflareFixtureForWindow(
        requested.searchParams.get('dateStart'),
        requested.searchParams.get('dateEnd'),
      )
    },
  })

  assert.deepEqual(Object.keys(seen).sort(), [
    '2026-11-26T03:45:00.000Z|2026-11-19T03:45:00.000Z',
    '2026-11-26T03:45:00.000Z|2026-11-25T03:45:00.000Z',
    '2026-11-26T03:45:00.000Z|2026-11-25T21:45:00.000Z',
    '2026-11-26T03:45:00.000Z|2026-11-26T02:45:00.000Z',
  ])
  for (const interval of ['1h', '6h', '24h', '7d']) {
    assert.equal(results[interval].interval, interval)
    assert.equal(results[interval].intervalStatus, 'live')
    assert.equal(results[interval].intervalError, null)
    assert.equal(results[interval].window.dateEnd, '2026-11-26T03:45:00.000Z')
  }
  assert.equal(results['1h'].window.dateStart, '2026-11-26T02:45:00.000Z')
  assert.equal(results['7d'].window.dateStart, '2026-11-19T03:45:00.000Z')
})

test('marks an interval unavailable on window mismatch and never uses the wrong data', async () => {
  // The mock always answers with a 24h window, even when 1h was requested.
  const wrongWindow = async () => cloudflareFixtureForWindow('2026-11-25T03:45:00.000Z', '2026-11-26T03:45:00.000Z')
  const result = await collectCloudflareRadarInterval('1h', null, {
    token: FIXTURE_TOKEN,
    now: () => new Date('2026-11-26T03:46:00.000Z'),
    request: wrongWindow,
  })

  assert.equal(result.intervalStatus, 'unavailable')
  assert.equal(result.provider.status, 'offline')
  assert.match(result.intervalError, /instead of the requested/)
  assert.deepEqual(result.pairs, [])
  assert.equal(result.meta, null)
})

test('marks an interval stale on window mismatch when previous data exists', async () => {
  const previous = {
    generatedAt: '2026-11-26T03:30:00.000Z',
    provider: { status: 'live', fetchedAt: '2026-11-26T03:30:00.000Z' },
    meta: cloudflareResponse.result.meta,
    pairs: [{
      originCountryAlpha2: 'US',
      originCountryName: 'United States',
      targetCountryAlpha2: 'DE',
      targetCountryName: 'Germany',
      value: 12.5,
    }],
  }
  const result = await collectCloudflareRadarInterval('1h', previous, {
    token: FIXTURE_TOKEN,
    now: () => new Date('2026-11-26T03:46:00.000Z'),
    request: async () => cloudflareFixtureForWindow('2026-11-25T03:45:00.000Z', '2026-11-26T03:45:00.000Z'),
  })

  assert.equal(result.intervalStatus, 'stale')
  assert.equal(result.provider.status, 'stale')
  assert.deepEqual(result.pairs, previous.pairs)
  assert.deepEqual(result.meta, previous.meta)
  assert.match(result.intervalError, /instead of the requested/)
})

test('handles a Cloudflare response with missing meta as unavailable without using its rows', async () => {
  const result = await collectCloudflareRadarInterval('6h', null, {
    token: FIXTURE_TOKEN,
    now: () => new Date('2026-11-26T03:46:00.000Z'),
    request: async () => ({
      success: true,
      result: {
        top_0: [{
          originCountryAlpha2: 'US',
          originCountryName: 'United States',
          targetCountryAlpha2: 'DE',
          targetCountryName: 'Germany',
          value: '12.5',
        }],
      },
    }),
  })

  assert.equal(result.intervalStatus, 'unavailable')
  assert.deepEqual(result.pairs, [])
  assert.equal(result.meta, null)
  assert.match(result.intervalError, /missing valid upstream metadata/)
})

test('one interval failing does not poison the others', async () => {
  const results = await collectCloudflareRadarIntervals({}, {
    token: FIXTURE_TOKEN,
    now: () => new Date('2026-11-26T03:46:00.000Z'),
    request: async (url) => {
      const requested = new URL(url)
      const duration = Date.parse(requested.searchParams.get('dateEnd')) - Date.parse(requested.searchParams.get('dateStart'))
      if (duration === 6 * 60 * 60 * 1000) throw new Error('HTTP 500: 6h endpoint down')
      return cloudflareFixtureForWindow(
        requested.searchParams.get('dateStart'),
        requested.searchParams.get('dateEnd'),
      )
    },
  })

  assert.equal(results['1h'].intervalStatus, 'live')
  assert.equal(results['6h'].intervalStatus, 'unavailable')
  assert.equal(results['6h'].provider.status, 'offline')
  assert.match(results['6h'].intervalError, /6h endpoint down/)
  assert.equal(results['24h'].intervalStatus, 'live')
  assert.equal(results['7d'].intervalStatus, 'live')
  assert.equal(results['1h'].pairs[0].value, 12.5)
})

test('passes through only provider-returned pair fields and invents no values', async () => {
  const result = await collectCloudflareRadarInterval('24h', null, {
    token: FIXTURE_TOKEN,
    now: () => new Date('2026-11-26T03:46:00.000Z'),
    request: async (url) => {
      const requested = new URL(url)
      // Extra provider-side fields must be dropped, never carried into output.
      return cloudflareFixtureForWindow(
        requested.searchParams.get('dateStart'),
        requested.searchParams.get('dateEnd'),
        { latitude: 52.52, longitude: 13.405, inventedField: 'must-not-appear' },
      )
    },
  })

  assert.deepEqual(Object.keys(result.pairs[0]).sort(), [
    'originCountryAlpha2',
    'originCountryName',
    'targetCountryAlpha2',
    'targetCountryName',
    'value',
  ])
  assert.deepEqual(result.pairs, [{
    originCountryAlpha2: 'US',
    originCountryName: 'United States',
    targetCountryAlpha2: 'DE',
    targetCountryName: 'Germany',
    value: 12.5,
  }])
})

test('history manifest merges, sorts oldest to newest, and caps per interval', () => {
  const manifest = buildCloudflareHistoryManifest(null, [
    { interval: '24h', generatedAt: '2026-11-26T04:16:00.000Z', path: 'data/history/cloudflare/24h/c.json', pairCount: 50, lastUpdated: '2026-11-26T04:15:00Z' },
    { interval: '24h', generatedAt: '2026-11-26T03:46:00.000Z', path: 'data/history/cloudflare/24h/a.json', pairCount: 50, lastUpdated: '2026-11-26T03:45:00Z' },
    { interval: '24h', generatedAt: '2026-11-26T04:01:00.000Z', path: 'data/history/cloudflare/24h/b.json', pairCount: 50, lastUpdated: '2026-11-26T04:00:00Z' },
  ], { retentionPerInterval: 2, generatedAt: '2026-11-26T04:16:00.000Z' })

  assert.deepEqual(manifest.intervals['24h'].map((entry) => entry.path), [
    'data/history/cloudflare/24h/b.json',
    'data/history/cloudflare/24h/c.json',
  ])
  assert.deepEqual(Object.keys(manifest.intervals['24h'][0]).sort(), [
    'generatedAt',
    'lastUpdated',
    'pairCount',
    'path',
  ])
  assert.deepEqual(manifest.intervals['1h'], [])
})

test('writes per-interval files, legacy 24h copy, history snapshots and manifest, and prunes beyond the cap', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threatmap-cf-'))
  try {
    const times = ['2026-11-26T03:46:00.000Z', '2026-11-26T04:01:00.000Z', '2026-11-26T04:16:00.000Z']
    let lastOutcome
    for (const time of times) {
      const now = new Date(time)
      const results = await collectCloudflareRadarIntervals({}, {
        token: FIXTURE_TOKEN,
        now: () => now,
        request: matchingCloudflareRequest(),
      })
      lastOutcome = writeCloudflareIntervalOutputs(results, { root, now: () => now, retentionPerInterval: 2 })
    }

    for (const interval of ['1h', '6h', '24h', '7d']) {
      const file = path.join(root, 'public/data', `cloudflare-attack-pairs-${interval}.json`)
      const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.equal(snapshot.interval, interval)
      assert.equal(snapshot.intervalStatus, 'live')
      assert.equal(snapshot.intervalError, null)
      assert.equal(snapshot.window.dateEnd, '2026-11-26T04:15:00.000Z')
    }
    assert.equal(
      fs.readFileSync(path.join(root, 'public/data/cloudflare-attack-pairs.json'), 'utf8'),
      fs.readFileSync(path.join(root, 'public/data/cloudflare-attack-pairs-24h.json'), 'utf8'),
    )

    const historyDir = path.join(root, 'public/data/history/cloudflare/24h')
    const historyFiles = fs.readdirSync(historyDir).sort()
    assert.deepEqual(historyFiles, ['20261126T040100000Z.json', '20261126T041600000Z.json'])
    assert.equal(fs.existsSync(path.join(historyDir, '20261126T034600000Z.json')), false)

    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/history/cloudflare-manifest.json'), 'utf8'))
    assert.equal(manifest.intervals['24h'].length, 2)
    assert.deepEqual(manifest.intervals['24h'].map((entry) => entry.generatedAt), [
      '2026-11-26T04:01:00.000Z',
      '2026-11-26T04:16:00.000Z',
    ])
    assert.deepEqual(manifest.intervals['24h'][1], {
      generatedAt: '2026-11-26T04:16:00.000Z',
      path: 'data/history/cloudflare/24h/20261126T041600000Z.json',
      pairCount: 1,
      lastUpdated: '2026-11-26T04:15:00.000Z',
    })
    assert.equal(lastOutcome.pruned.filter((file) => file.includes('/24h/')).length, 1)

    // No credential anywhere in anything the builder wrote.
    const writtenFiles = []
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        if (fs.statSync(full).isDirectory()) walk(full)
        else writtenFiles.push(full)
      }
    }
    walk(path.join(root, 'public'))
    assert.ok(writtenFiles.length > 0)
    for (const file of writtenFiles) {
      assert.equal(fs.readFileSync(file, 'utf8').includes(FIXTURE_TOKEN), false, `${file} leaks the fixture token`)
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
