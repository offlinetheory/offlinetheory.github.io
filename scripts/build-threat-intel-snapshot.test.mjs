import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  CLOUDFLARE_PRODUCTS,
  CLOUDFLARE_TIMESERIES_AGG_INTERVAL,
  buildCloudflareHistoryManifest,
  cloudflareIntervalWindow,
  cloudflareWindowShiftMinutes,
  collectCloudflareRadar,
  collectCloudflareRadarInterval,
  collectCloudflareRadarIntervals,
  collectCloudflareRadarMatrix,
  collectCloudflareRadarTimeseries,
  dshieldPortEvent,
  dshieldSourceEvent,
  normalizeCloudflareRadarResponse,
  normalizeCloudflareRadarTimeseriesResponse,
  normalizeDshieldPorts,
  normalizeEvent,
  validateCloudflareIntervalMeta,
  validateCloudflareTimeseriesMeta,
  validateCloudflareTimeseriesSerie,
  writeCloudflareIntervalOutputs,
  writeCloudflareOutputs,
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

    const historyDir = path.join(root, 'public/data/history/cloudflare/24h/all')
    const historyFiles = fs.readdirSync(historyDir).sort()
    assert.deepEqual(historyFiles, ['20261126T040100000Z.json', '20261126T041600000Z.json'])
    assert.equal(fs.existsSync(path.join(historyDir, '20261126T034600000Z.json')), false)

    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/history/cloudflare-manifest.json'), 'utf8'))
    assert.equal(manifest.schemaVersion, 2)
    assert.equal(manifest.intervals['24h'].length, 2)
    assert.deepEqual(manifest.intervals['24h'].map((entry) => entry.generatedAt), [
      '2026-11-26T04:01:00.000Z',
      '2026-11-26T04:16:00.000Z',
    ])
    assert.deepEqual(manifest.intervals['24h'][1], {
      generatedAt: '2026-11-26T04:16:00.000Z',
      path: 'data/history/cloudflare/24h/all/20261126T041600000Z.json',
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

// --- Round 2: per-product matrix, timeseries, manifest v2 ---

const TIMESERIES_AGG_MS = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
}

function timeseriesFixtureForWindow(dateStart, dateEnd, aggInterval, { normalization, lastUpdated = null } = {}) {
  const aggMs = TIMESERIES_AGG_MS[aggInterval]
  const count = Math.round((Date.parse(dateEnd) - Date.parse(dateStart)) / aggMs)
  const timestamps = Array.from(
    { length: count },
    (_, index) => new Date(Date.parse(dateStart) + index * aggMs).toISOString(),
  )
  const values = timestamps.map((_, index) => `${100 + index * 7}.5`)
  const meta = {
    aggInterval,
    dateRange: [{ startTime: dateStart, endTime: dateEnd }],
    lastUpdated: lastUpdated || dateEnd,
    units: [{ name: 'requests', value: 'count' }],
  }
  // normalization is included only when the caller supplies it, so the
  // absent case is a genuinely absent key, not a null or a default.
  if (normalization !== undefined) meta.normalization = normalization
  return { success: true, result: { meta, serie_0: { timestamps, values } } }
}

// Mock request answering every matrix cell: pairs with the matching
// window, timeseries with points at the requested aggInterval. `failCell`
// ({ product, kind }) makes that one product/kind throw on every
// interval, to prove failure isolation.
function matrixMockRequest({ failCell = null, delayMs = 0 } = {}) {
  let calls = 0
  let inFlight = 0
  let maxInFlight = 0
  const request = async (url) => {
    calls += 1
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    try {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
      const requested = new URL(url)
      const product = requested.searchParams.get('mitigationProduct') || 'all'
      const isTimeseries = requested.pathname.endsWith('/timeseries')
      const kind = isTimeseries ? 'timeseries' : 'pairs'
      if (failCell && failCell.product === product && failCell.kind === kind) {
        throw new Error(`HTTP 500: ${product} ${kind} endpoint down`)
      }
      const dateStart = requested.searchParams.get('dateStart')
      const dateEnd = requested.searchParams.get('dateEnd')
      if (isTimeseries) {
        return timeseriesFixtureForWindow(dateStart, dateEnd, requested.searchParams.get('aggInterval'), { normalization: 'MIN0_MAX' })
      }
      return cloudflareFixtureForWindow(dateStart, dateEnd)
    } finally {
      inFlight -= 1
    }
  }
  return { request, stats: () => ({ calls, maxInFlight }) }
}

test('normalizes Cloudflare Radar timeseries and records meta.normalization faithfully', () => {
  const withNormalization = timeseriesFixtureForWindow(
    '2026-11-25T03:45:00.000Z', '2026-11-26T03:45:00.000Z', '1h', { normalization: 'MIN0_MAX' },
  )
  const normalized = normalizeCloudflareRadarTimeseriesResponse(withNormalization)
  assert.equal(normalized.meta.normalization, 'MIN0_MAX')
  assert.equal(normalized.meta.aggInterval, '1h')
  assert.equal(normalized.serie.timestamps.length, 24)
  assert.deepEqual(normalized.serie.values.slice(0, 2), ['100.5', '107.5'])
  assert.deepEqual(normalized.meta.dateRange, [{ startTime: '2026-11-25T03:45:00.000Z', endTime: '2026-11-26T03:45:00.000Z' }])

  // (a) Normalization absent from the API response is recorded as
  // absent (null), not invented or defaulted.
  const absent = timeseriesFixtureForWindow(
    '2026-11-25T03:45:00.000Z', '2026-11-26T03:45:00.000Z', '1h', { normalization: undefined },
  )
  assert.equal('normalization' in absent.result.meta, false)
  assert.equal(normalizeCloudflareRadarTimeseriesResponse(absent).meta.normalization, null)

  // (b) Normalization present is recorded verbatim.
  const percentageChange = timeseriesFixtureForWindow(
    '2026-11-25T03:45:00.000Z', '2026-11-26T03:45:00.000Z', '1h', { normalization: 'PERCENTAGE_CHANGE' },
  )
  assert.equal(
    normalizeCloudflareRadarTimeseriesResponse(percentageChange).meta.normalization,
    'PERCENTAGE_CHANGE',
  )

  assert.throws(
    () => normalizeCloudflareRadarTimeseriesResponse({ success: true, result: { meta: null, serie_0: { timestamps: [], values: [] } } }),
    /missing valid upstream metadata/,
  )
  assert.throws(
    () => normalizeCloudflareRadarTimeseriesResponse({
      success: true,
      result: { meta: withNormalization.result.meta },
    }),
    /missing the expected serie_0/,
  )
  assert.throws(
    () => normalizeCloudflareRadarTimeseriesResponse({
      success: true,
      result: {
        meta: { ...withNormalization.result.meta, aggInterval: '' },
        serie_0: withNormalization.result.serie_0,
      },
    }),
    /missing valid upstream metadata/,
  )
})

test('validates timeseries meta: aggInterval mismatch names the actual resolution', () => {
  const window = { dateStart: '2026-11-26T02:45:00.000Z', dateEnd: '2026-11-26T03:45:00.000Z' }
  const meta = {
    aggInterval: '15m',
    dateRange: [{ startTime: '2026-11-26T02:45:00Z', endTime: '2026-11-26T03:45:00Z' }],
    lastUpdated: '2026-11-26T03:45:00Z',
    normalization: 'MIN0_MAX',
    units: [{ name: 'requests', value: 'count' }],
  }
  assert.equal(validateCloudflareTimeseriesMeta(meta, window, '15m'), null)
  assert.match(
    validateCloudflareTimeseriesMeta({ ...meta, aggInterval: '1h' }, window, '15m'),
    /returned aggInterval 1h instead of the requested 15m/,
  )
  assert.match(
    validateCloudflareTimeseriesMeta({ ...meta, dateRange: [{ startTime: '2026-11-25T03:45:00Z', endTime: '2026-11-26T03:45:00Z' }] }, window, '15m'),
    /instead of the requested/,
  )

  // Window shift is requested end minus returned end, in minutes.
  assert.equal(cloudflareWindowShiftMinutes(window, meta), 0)
  assert.equal(cloudflareWindowShiftMinutes(
    { dateStart: '2026-11-26T21:30:00.000Z', dateEnd: '2026-11-26T22:30:00.000Z' },
    { dateRange: [{ startTime: '2026-11-26T21:00:00Z', endTime: '2026-11-26T22:00:00Z' }] },
  ), 30)
  assert.equal(cloudflareWindowShiftMinutes(
    { dateStart: '2026-11-26T21:30:00.000Z', dateEnd: '2026-11-26T22:30:00.000Z' },
    { dateRange: [{ startTime: '2026-11-26T21:45:00Z', endTime: '2026-11-26T22:45:00Z' }] },
  ), -15)
  assert.equal(cloudflareWindowShiftMinutes(window, null), null)
})

test('validates timeseries serie: bad timestamps, count mismatch, non-numeric values', () => {
  const window = { dateStart: '2026-11-26T02:45:00.000Z', dateEnd: '2026-11-26T03:45:00.000Z' }
  const valid = timeseriesFixtureForWindow(window.dateStart, window.dateEnd, '15m').result.serie_0
  assert.equal(validateCloudflareTimeseriesSerie(valid, window, '15m'), null)

  // Point count within ±1 of duration/aggInterval is accepted.
  const fivePoints = {
    timestamps: ['2026-11-26T02:45:00.000Z', '2026-11-26T03:00:00.000Z', '2026-11-26T03:15:00.000Z', '2026-11-26T03:30:00.000Z', '2026-11-26T03:45:00.000Z'],
    values: ['1', '2', '3', '4', '5'],
  }
  assert.equal(validateCloudflareTimeseriesSerie(fivePoints, window, '15m'), null)

  assert.match(
    validateCloudflareTimeseriesSerie({ timestamps: ['not-a-timestamp', '2026-11-26T03:00:00.000Z'], values: ['1', '2'] }, window, '15m'),
    /not a valid ISO string/,
  )
  assert.match(
    validateCloudflareTimeseriesSerie({ timestamps: ['2026-11-26T03:00:00.000Z', '2026-11-26T03:00:00.000Z'], values: ['1', '2'] }, window, '15m'),
    /not strictly increasing/,
  )
  assert.match(
    validateCloudflareTimeseriesSerie({ timestamps: valid.timestamps, values: valid.values.slice(0, 3) }, window, '15m'),
    /timestamps but 3 values/,
  )
  assert.match(
    validateCloudflareTimeseriesSerie({ timestamps: valid.timestamps, values: ['1', 'two', '3', '4'] }, window, '15m'),
    /value 1 is not numeric/,
  )
  assert.match(
    validateCloudflareTimeseriesSerie({ timestamps: valid.timestamps.slice(0, 2), values: ['1', '2'] }, window, '15m'),
    /returned 2 points.*expected 4/,
  )
  assert.match(validateCloudflareTimeseriesSerie(null, window, '15m'), /missing serie_0/)
})

test('collects a live timeseries cell with the prescribed query and snapshot shape', async () => {
  let requestUrl
  const result = await collectCloudflareRadarTimeseries('24h', null, {
    token: FIXTURE_TOKEN,
    now: () => new Date('2026-11-26T03:47:12.000Z'),
    request: async (url, options) => {
      requestUrl = new URL(url)
      assert.deepEqual(options.headers, { Authorization: `Bearer ${FIXTURE_TOKEN}` })
      return timeseriesFixtureForWindow(
        requestUrl.searchParams.get('dateStart'),
        requestUrl.searchParams.get('dateEnd'),
        requestUrl.searchParams.get('aggInterval'),
        { normalization: 'MIN0_MAX' },
      )
    },
  })

  assert.equal(requestUrl.pathname, '/client/v4/radar/attacks/layer7/timeseries')
  assert.deepEqual(Object.fromEntries(requestUrl.searchParams), {
    dateStart: '2026-11-25T03:45:00.000Z',
    dateEnd: '2026-11-26T03:45:00.000Z',
    aggInterval: '1h',
    format: 'JSON',
  })
  assert.equal(requestUrl.searchParams.has('normalization'), false)
  assert.equal(requestUrl.searchParams.has('limit'), false)
  assert.equal(requestUrl.searchParams.has('mitigationProduct'), false)
  assert.equal(result.timeseriesStatus, 'live')
  assert.equal(result.timeseriesError, null)
  assert.equal(result.product, 'all')
  assert.equal(result.aggInterval, '1h')
  assert.equal(result.interval, '24h')
  assert.equal(result.windowShiftMinutes, 0)
  assert.deepEqual(result.returnedWindow, { startTime: '2026-11-25T03:45:00.000Z', endTime: '2026-11-26T03:45:00.000Z' })
  assert.equal(result.serie.timestamps.length, 24)
  assert.equal(result.provider.status, 'live')
  assert.equal(result.provider.pointCount, 24)
  assert.equal(result.meta.normalization, 'MIN0_MAX')
  assert.equal(result.meta.aggInterval, '1h')
})

test('requests the interval aggInterval and point count for every interval', async () => {
  const expected = {
    '1h': { aggInterval: '15m', points: 4 },
    '6h': { aggInterval: '15m', points: 24 },
    '24h': { aggInterval: '1h', points: 24 },
    '7d': { aggInterval: '1d', points: 7 },
  }
  for (const interval of ['1h', '6h', '24h', '7d']) {
    let seenAgg
    const result = await collectCloudflareRadarTimeseries(interval, null, {
      token: FIXTURE_TOKEN,
      now: () => new Date('2026-11-26T03:47:12.000Z'),
      request: async (url) => {
        const requested = new URL(url)
        seenAgg = requested.searchParams.get('aggInterval')
        return timeseriesFixtureForWindow(
          requested.searchParams.get('dateStart'),
          requested.searchParams.get('dateEnd'),
          seenAgg,
        )
      },
    })
    assert.equal(seenAgg, expected[interval].aggInterval)
    assert.equal(result.aggInterval, expected[interval].aggInterval)
    assert.equal(result.timeseriesStatus, 'live')
    assert.equal(result.serie.timestamps.length, expected[interval].points)
    assert.equal(result.provider.pointCount, expected[interval].points)
  }
})

test('records the returned window and its shift when Cloudflare lags the requested window', async () => {
  const now = () => new Date('2026-11-26T22:31:00.000Z')
  const shiftedPairs = await collectCloudflareRadarInterval('1h', null, {
    token: FIXTURE_TOKEN,
    now,
    request: async () => cloudflareFixtureForWindow('2026-11-26T21:00:00Z', '2026-11-26T22:00:00Z'),
  })
  assert.equal(shiftedPairs.intervalStatus, 'live')
  assert.equal(shiftedPairs.windowShiftMinutes, 30)
  assert.deepEqual(shiftedPairs.returnedWindow, { startTime: '2026-11-26T21:00:00Z', endTime: '2026-11-26T22:00:00Z' })
  assert.deepEqual(shiftedPairs.window, { dateStart: '2026-11-26T21:30:00.000Z', dateEnd: '2026-11-26T22:30:00.000Z' })

  const shiftedSeries = await collectCloudflareRadarTimeseries('1h', null, {
    token: FIXTURE_TOKEN,
    now,
    request: async () => timeseriesFixtureForWindow('2026-11-26T21:00:00Z', '2026-11-26T22:00:00Z', '15m'),
  })
  assert.equal(shiftedSeries.timeseriesStatus, 'live')
  assert.equal(shiftedSeries.windowShiftMinutes, 30)
  assert.deepEqual(shiftedSeries.returnedWindow, { startTime: '2026-11-26T21:00:00Z', endTime: '2026-11-26T22:00:00Z' })
})

test('marks a timeseries cell stale on aggInterval mismatch and keeps previous points', async () => {
  const now = () => new Date('2026-11-26T03:46:00.000Z')
  const live = await collectCloudflareRadarTimeseries('1h', null, {
    token: FIXTURE_TOKEN,
    now,
    request: async (url) => {
      const requested = new URL(url)
      return timeseriesFixtureForWindow(
        requested.searchParams.get('dateStart'),
        requested.searchParams.get('dateEnd'),
        requested.searchParams.get('aggInterval'),
      )
    },
  })
  assert.equal(live.timeseriesStatus, 'live')

  const stale = await collectCloudflareRadarTimeseries('1h', live, {
    token: FIXTURE_TOKEN,
    now,
    request: async (url) => {
      const requested = new URL(url)
      // API auto-selected 1h instead of the requested 15m.
      return timeseriesFixtureForWindow(
        requested.searchParams.get('dateStart'),
        requested.searchParams.get('dateEnd'),
        '1h',
      )
    },
  })
  assert.equal(stale.timeseriesStatus, 'stale')
  assert.equal(stale.provider.status, 'stale')
  assert.match(stale.timeseriesError, /returned aggInterval 1h instead of the requested 15m/)
  assert.deepEqual(stale.serie, live.serie)
  assert.deepEqual(stale.meta, live.meta)
  assert.equal(stale.aggInterval, '15m')

  const unavailable = await collectCloudflareRadarTimeseries('1h', null, {
    token: FIXTURE_TOKEN,
    now,
    request: async (url) => {
      const requested = new URL(url)
      return timeseriesFixtureForWindow(
        requested.searchParams.get('dateStart'),
        requested.searchParams.get('dateEnd'),
        '1h',
      )
    },
  })
  assert.equal(unavailable.timeseriesStatus, 'unavailable')
  assert.equal(unavailable.provider.status, 'offline')
  assert.match(unavailable.timeseriesError, /returned aggInterval 1h instead of the requested 15m/)
  assert.deepEqual(unavailable.serie, { timestamps: [], values: [] })
  assert.equal(unavailable.meta, null)
})

test('per-product pairs pass through only the 5 provider fields and carry the product', async () => {
  let requestUrl
  const result = await collectCloudflareRadarInterval('24h', null, {
    token: FIXTURE_TOKEN,
    product: 'DDOS',
    now: () => new Date('2026-11-26T03:46:00.000Z'),
    request: async (url) => {
      requestUrl = new URL(url)
      return cloudflareFixtureForWindow(
        requestUrl.searchParams.get('dateStart'),
        requestUrl.searchParams.get('dateEnd'),
        { latitude: 52.52, inventedField: 'must-not-appear' },
      )
    },
  })

  assert.equal(requestUrl.searchParams.get('mitigationProduct'), 'DDOS')
  assert.equal(requestUrl.searchParams.get('normalization'), 'PERCENTAGE')
  assert.equal(result.product, 'DDOS')
  assert.equal(result.intervalStatus, 'live')
  assert.deepEqual(Object.keys(result.pairs[0]).sort(), [
    'originCountryAlpha2',
    'originCountryName',
    'targetCountryAlpha2',
    'targetCountryName',
    'value',
  ])
})

test('matrix collects all 64 cells with batched concurrency and one product failing leaves others live', async () => {
  const { request, stats } = matrixMockRequest({
    failCell: { product: 'DDOS', kind: 'pairs' },
    delayMs: 5,
  })
  const matrix = await collectCloudflareRadarMatrix({}, {
    token: FIXTURE_TOKEN,
    now: () => new Date('2026-11-26T03:46:00.000Z'),
    request,
  })

  assert.equal(stats().calls, 64)
  assert.ok(stats().maxInFlight > 1, `expected batched concurrency, saw max ${stats().maxInFlight} in flight`)
  assert.ok(stats().maxInFlight <= 6, `expected at most 6 in flight, saw ${stats().maxInFlight}`)
  for (const interval of ['1h', '6h', '24h', '7d']) {
    assert.deepEqual(Object.keys(matrix.pairs[interval]).sort(), [...CLOUDFLARE_PRODUCTS].sort())
    assert.deepEqual(Object.keys(matrix.timeseries[interval]).sort(), [...CLOUDFLARE_PRODUCTS].sort())
    for (const product of CLOUDFLARE_PRODUCTS) {
      if (product === 'DDOS') {
        assert.equal(matrix.pairs[interval][product].intervalStatus, 'unavailable')
        assert.match(matrix.pairs[interval][product].intervalError, /DDOS pairs endpoint down/)
        assert.equal(matrix.timeseries[interval][product].timeseriesStatus, 'live')
      } else {
        assert.equal(matrix.pairs[interval][product].intervalStatus, 'live', `${interval}/${product} pairs`)
        assert.equal(matrix.timeseries[interval][product].timeseriesStatus, 'live', `${interval}/${product} timeseries`)
      }
      assert.equal(matrix.pairs[interval][product].product, product)
      assert.equal(matrix.timeseries[interval][product].product, product)
    }
  }
})

test('token absent leaves every Cloudflare file untouched and never requests', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threatmap-cf-notoken-'))
  try {
    const seed = {
      'public/data/cloudflare-attack-pairs-24h.json': JSON.stringify({ interval: '24h', product: 'all', pairs: [] }),
      'public/data/cloudflare-timeseries-24h.json': JSON.stringify({ interval: '24h', product: 'all', serie: { timestamps: [], values: [] } }),
      'public/data/history/cloudflare/24h/all/20261126T034600000Z.json': JSON.stringify({ interval: '24h' }),
      'public/data/history/cloudflare-manifest.json': JSON.stringify({ schemaVersion: 2, intervals: {} }),
    }
    for (const [file, contents] of Object.entries(seed)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), contents)
    }
    const snapshotTree = () => {
      const out = {}
      const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name)
          if (fs.statSync(full).isDirectory()) walk(full)
          else out[path.relative(root, full)] = fs.readFileSync(full, 'utf8')
        }
      }
      walk(path.join(root, 'public'))
      return out
    }
    const before = snapshotTree()

    const matrix = await collectCloudflareRadarMatrix({}, {
      token: '',
      now: () => new Date('2026-11-26T03:46:00.000Z'),
      request: async () => assert.fail('must not request Cloudflare without a token'),
    })
    for (const interval of ['1h', '6h', '24h', '7d']) {
      for (const product of CLOUDFLARE_PRODUCTS) {
        assert.equal(matrix.pairs[interval][product].provider.status, 'not_configured')
        assert.equal(matrix.pairs[interval][product].intervalStatus, 'unavailable')
        assert.equal(matrix.timeseries[interval][product].provider.status, 'not_configured')
        assert.equal(matrix.timeseries[interval][product].timeseriesStatus, 'unavailable')
      }
    }
    assert.deepEqual(snapshotTree(), before)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('run budget exceeded marks unstarted cells without requesting them', async () => {
  let calls = 0
  const matrix = await collectCloudflareRadarMatrix({}, {
    token: FIXTURE_TOKEN,
    runBudgetMs: 0,
    now: () => new Date('2026-11-26T03:46:00.000Z'),
    request: async () => { calls += 1; return cloudflareFixtureForWindow('2026-11-26T02:45:00.000Z', '2026-11-26T03:45:00.000Z') },
  })
  assert.equal(calls, 0)
  assert.match(matrix.pairs['1h']['all'].intervalError, /run budget/)
  assert.match(matrix.timeseries['7d']['WAF'].timeseriesError, /run budget/)
  assert.equal(matrix.pairs['1h']['all'].intervalStatus, 'unavailable')
})

test('writes the full matrix, prunes per-product caps, and builds the v2 manifest', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threatmap-cf-matrix-'))
  try {
    const times = ['2026-11-26T03:46:00.000Z', '2026-11-26T04:01:00.000Z', '2026-11-26T04:16:00.000Z']
    const caps = {
      retentionPerInterval: 2,
      retentionPairsProduct: 2,
      retentionTimeseriesAll: 2,
      retentionTimeseriesProduct: 2,
    }
    let lastOutcome
    for (const time of times) {
      const now = new Date(time)
      const { request } = matrixMockRequest()
      const matrix = await collectCloudflareRadarMatrix({}, {
        token: FIXTURE_TOKEN,
        now: () => now,
        request,
      })
      lastOutcome = writeCloudflareOutputs(matrix, { root, now: () => now, ...caps })
    }

    // 32 pairs + 32 timeseries files + the legacy 24h pairs copy.
    assert.equal(lastOutcome.written.length, 65)
    assert.ok(lastOutcome.written.includes('public/data/cloudflare-attack-pairs-7d-data_loss_prevention.json'))
    assert.ok(lastOutcome.written.includes('public/data/cloudflare-timeseries-24h-waf.json'))
    assert.ok(lastOutcome.written.includes('public/data/cloudflare-attack-pairs.json'))
    const timeseries24h = JSON.parse(fs.readFileSync(path.join(root, 'public/data/cloudflare-timeseries-24h.json'), 'utf8'))
    assert.equal(timeseries24h.product, 'all')
    assert.equal(timeseries24h.timeseriesStatus, 'live')
    assert.equal(timeseries24h.aggInterval, '1h')
    // Normalization is recorded as returned, verbatim.
    assert.equal(timeseries24h.meta.normalization, 'MIN0_MAX')
    const pairs24hWaf = JSON.parse(fs.readFileSync(path.join(root, 'public/data/cloudflare-attack-pairs-24h-waf.json'), 'utf8'))
    assert.equal(pairs24hWaf.product, 'WAF')
    assert.equal(pairs24hWaf.intervalStatus, 'live')

    // Per-(interval × product) history dirs pruned to the cap of 2.
    for (const [dir, expected] of [
      ['public/data/history/cloudflare/24h/all', ['20261126T040100000Z.json', '20261126T041600000Z.json']],
      ['public/data/history/cloudflare/24h/ddos', ['20261126T040100000Z.json', '20261126T041600000Z.json']],
      ['public/data/history/cloudflare-timeseries/24h/all', ['20261126T040100000Z.json', '20261126T041600000Z.json']],
      ['public/data/history/cloudflare-timeseries/7d/api_shield', ['20261126T040100000Z.json', '20261126T041600000Z.json']],
    ]) {
      assert.deepEqual(fs.readdirSync(path.join(root, dir)).sort(), expected, dir)
    }
    // One prune per history dir (64 dirs) on the third run.
    assert.equal(lastOutcome.pruned.length, 64)

    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/history/cloudflare-manifest.json'), 'utf8'))
    assert.equal(manifest.schemaVersion, 2)
    assert.equal(manifest.pairs['24h']['DDOS'].length, 2)
    assert.deepEqual(Object.keys(manifest.pairs['24h']['DDOS'][0]).sort(), [
      'generatedAt',
      'lastUpdated',
      'pairCount',
      'path',
    ])
    assert.equal(manifest.pairs['24h']['DDOS'][1].path, 'data/history/cloudflare/24h/ddos/20261126T041600000Z.json')
    assert.equal(manifest.timeseries['24h']['all'].length, 2)
    assert.deepEqual(Object.keys(manifest.timeseries['24h']['all'][0]).sort(), [
      'aggInterval',
      'generatedAt',
      'lastUpdated',
      'path',
      'pointCount',
    ])
    assert.equal(manifest.timeseries['24h']['all'][1].aggInterval, '1h')
    assert.equal(manifest.timeseries['24h']['all'][1].pointCount, 24)
    // v1 compat key is the pairs "all" section.
    assert.deepEqual(manifest.intervals['24h'], manifest.pairs['24h']['all'])
    assert.deepEqual(manifest.intervals['1h'], manifest.pairs['1h']['all'])

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

test('a stale matrix cell adds no history snapshot', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threatmap-cf-stale-'))
  try {
    const caps = {
      retentionPerInterval: 96,
      retentionPairsProduct: 24,
      retentionTimeseriesAll: 96,
      retentionTimeseriesProduct: 24,
    }
    const runAt = async (time, failCell, previous = {}) => {
      const now = new Date(time)
      const { request } = matrixMockRequest({ failCell })
      const matrix = await collectCloudflareRadarMatrix(previous, {
        token: FIXTURE_TOKEN,
        now: () => now,
        request,
      })
      writeCloudflareOutputs(matrix, { root, now: () => now, ...caps })
      return matrix
    }
    const first = await runAt('2026-11-26T03:46:00.000Z', null)
    const previousTimeseries = JSON.parse(fs.readFileSync(path.join(root, 'public/data/cloudflare-timeseries-24h-waf.json'), 'utf8'))
    await runAt('2026-11-26T04:01:00.000Z', { product: 'WAF', kind: 'timeseries' }, first)

    const currentTimeseries = JSON.parse(fs.readFileSync(path.join(root, 'public/data/cloudflare-timeseries-24h-waf.json'), 'utf8'))
    assert.equal(currentTimeseries.timeseriesStatus, 'stale')
    assert.deepEqual(currentTimeseries.serie, previousTimeseries.serie)
    // No second history snapshot for the stale cell; the live pair cell
    // next to it got one.
    assert.deepEqual(fs.readdirSync(path.join(root, 'public/data/history/cloudflare-timeseries/24h/waf')).sort(), [
      '20261126T034600000Z.json',
    ])
    assert.deepEqual(fs.readdirSync(path.join(root, 'public/data/history/cloudflare/24h/waf')).sort(), [
      '20261126T034600000Z.json',
      '20261126T040100000Z.json',
    ])
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/history/cloudflare-manifest.json'), 'utf8'))
    assert.equal(manifest.timeseries['24h']['WAF'].length, 1)
    assert.equal(manifest.pairs['24h']['WAF'].length, 2)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
