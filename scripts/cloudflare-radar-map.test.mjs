import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-50m.json' with { type: 'json' }
import { normalizeCloudflareRadarResponse } from './build-threat-intel-snapshot.mjs'
import {
  arcPulsePlan,
  buildCloudflareRadarMap,
  CLOUDFLARE_PRODUCTS,
  cloudflareAggInterval,
  cloudflareIntervalUrl,
  cloudflarePairChanges,
  cloudflareProductUrl,
  cloudflareTimeseriesUrl,
  combineCloudflareLayerPairs,
  computeAttackVectorsFromTimeseries,
  computeWindowShiftMinutes,
  manifestEntries,
  mapTimeseriesPoints,
  pairsForCountry,
  rankCloudflareCountries,
  responseMatchesRequest,
  selectHistoricalSnapshot,
  selectHistoricalSnapshotForProduct,
  timeseriesStatusLabel,
} from '../src/pages/cloudflareRadarMap.js'

const countries = feature(worldTopo, worldTopo.objects.countries).features
const land = feature(worldTopo, worldTopo.objects.land)
const projection = geoNaturalEarth1().fitSize([1200, 620], land)
const path = geoPath(projection)

test('normalized Cloudflare top_0 records map directly to real country arcs', () => {
  const normalized = normalizeCloudflareRadarResponse({
    success: true,
    result: {
      meta: {
        lastUpdated: '2026-11-26T03:45:00Z',
        dateRange: [{
          startTime: '2026-11-25T03:45:00Z',
          endTime: '2026-11-26T03:45:00Z',
        }],
        normalization: 'PERCENTAGE',
        units: [{ name: 'percentage', value: '%' }],
      },
      top_0: [{
        originCountryAlpha2: 'US',
        originCountryName: 'United States',
        targetCountryAlpha2: 'IT',
        targetCountryName: 'Italy',
        value: '2.850893',
      }],
    },
  })

  const result = buildCloudflareRadarMap(
    normalized.pairs,
    countries,
    projection,
    path,
    { US: '840', IT: '380' },
  )

  assert.deepEqual(normalized.meta.dateRange, [{
    startTime: '2026-11-25T03:45:00Z',
    endTime: '2026-11-26T03:45:00Z',
  }])
  assert.deepEqual(normalized.meta.units, [{ name: 'percentage', value: '%' }])
  assert.equal(result.arcs.length, 1)
  assert.deepEqual(
    [result.arcs[0].originCountryAlpha2, result.arcs[0].targetCountryAlpha2, result.arcs[0].value],
    ['US', 'IT', 2.850893],
  )
  assert.match(result.arcs[0].d, /^M/)
})

test('Cloudflare attack arcs use the actual origin and target country geographic centroids', () => {
  const pairs = [{
    originCountryAlpha2: 'US',
    originCountryName: 'United States',
    targetCountryAlpha2: 'DE',
    targetCountryName: 'Germany',
    value: 12.5,
  }]
  const result = buildCloudflareRadarMap(
    pairs,
    countries,
    projection,
    path,
    { US: '840', DE: '276' },
  )
  const arc = result.arcs[0]
  const us = countries.find((country) => String(country.id) === '840')
  const germany = countries.find((country) => String(country.id) === '276')

  assert.equal(result.arcs.length, 1)
  assert.deepEqual(arc.originPoint, projection(geoCentroid(us)))
  assert.deepEqual(arc.targetPoint, projection(geoCentroid(germany)))
  assert.match(arc.d, /^M/)
  assert.equal(arc.value, 12.5)
})

test('maps the reported United States-to-Italy and Singapore-to-United States country pairs', () => {
  const result = buildCloudflareRadarMap([
    {
      originCountryAlpha2: 'US',
      originCountryName: 'United States',
      targetCountryAlpha2: 'IT',
      targetCountryName: 'Italy',
      value: 2.850893,
    },
    {
      originCountryAlpha2: 'SG',
      originCountryName: 'Singapore',
      targetCountryAlpha2: 'US',
      targetCountryName: 'United States',
      value: 2.564103,
    },
  ], countries, projection, path, { US: '840', IT: '380', SG: '702' })

  assert.deepEqual(result.arcs.map((arc) => [
    arc.originCountryAlpha2,
    arc.targetCountryAlpha2,
    arc.value,
  ]), [
    ['US', 'IT', 2.850893],
    ['SG', 'US', 2.564103],
  ])
  assert.ok(result.arcs.every((arc) => arc.d.startsWith('M')))
})

test('Cloudflare arc weight and country roles independently reflect reported pair percentages', () => {
  const result = buildCloudflareRadarMap([
    {
      originCountryAlpha2: 'US',
      originCountryName: 'United States',
      targetCountryAlpha2: 'DE',
      targetCountryName: 'Germany',
      value: 25,
    },
    {
      originCountryAlpha2: 'US',
      originCountryName: 'United States',
      targetCountryAlpha2: 'FR',
      targetCountryName: 'France',
      value: 4,
    },
  ], countries, projection, path, { US: '840', DE: '276', FR: '250' })

  assert.equal(result.arcs.length, 2)
  assert.ok(result.arcs[0].strokeWidth > result.arcs[1].strokeWidth)
  assert.ok(result.arcs[0].opacity > result.arcs[1].opacity)
  assert.equal(result.roles.get('840').originValue, 29)
  assert.equal(result.roles.get('276').targetValue, 25)
  assert.equal(result.roles.get('250').targetValue, 4)
  assert.ok(result.roles.get('276').targetOpacity > result.roles.get('250').targetOpacity)
})

test('a refreshed Cloudflare pair list moves target activity to the newly reported country', () => {
  const pair = {
    originCountryAlpha2: 'US',
    originCountryName: 'United States',
    targetCountryAlpha2: 'DE',
    targetCountryName: 'Germany',
    value: 12.5,
  }
  const first = buildCloudflareRadarMap([pair], countries, projection, path, { US: '840', DE: '276', FR: '250' })
  const refreshed = buildCloudflareRadarMap([
    { ...pair, targetCountryAlpha2: 'FR', targetCountryName: 'France', value: 20 },
  ], countries, projection, path, { US: '840', DE: '276', FR: '250' })

  assert.equal(first.roles.get('276').targetValue, 12.5)
  assert.equal(first.roles.has('250'), false)
  assert.equal(refreshed.roles.has('276'), false)
  assert.equal(refreshed.roles.get('250').targetValue, 20)
  assert.equal(refreshed.arcs[0].targetCountryAlpha2, 'FR')
})

const SAMPLE_PAIRS = [
  { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 25 },
  { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'FR', targetCountryName: 'France', value: 4 },
  { originCountryAlpha2: 'SG', originCountryName: 'Singapore', targetCountryAlpha2: 'US', targetCountryName: 'United States', value: 10 },
  { originCountryAlpha2: 'NL', originCountryName: 'Netherlands', targetCountryAlpha2: 'US', targetCountryName: 'United States', value: 2.5 },
]

test('origin and target rankings sum provider pair values and sort descending', () => {
  assert.deepEqual(
    rankCloudflareCountries(SAMPLE_PAIRS, 'origin').map((c) => [c.code, c.total]),
    [['US', 29], ['SG', 10], ['NL', 2.5]],
  )
  assert.deepEqual(
    rankCloudflareCountries(SAMPLE_PAIRS, 'target').map((c) => [c.code, c.total]),
    [['DE', 25], ['US', 12.5], ['FR', 4]],
  )
  assert.deepEqual(rankCloudflareCountries([], 'origin'), [])
  // Invalid values and codes are ignored, never invented into the ranking.
  assert.deepEqual(rankCloudflareCountries([
    { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 'not-a-number' },
    { originCountryAlpha2: 'ZZ', originCountryName: 'Nowhere', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 5 },
  ], 'origin'), [{ code: 'ZZ', name: 'Nowhere', total: 5 }])
})

test('country selection returns only that country\'s in/out pairs, value-sorted', () => {
  const { outbound, inbound } = pairsForCountry(SAMPLE_PAIRS, 'US')
  assert.deepEqual(outbound.map((p) => p.targetCountryAlpha2), ['DE', 'FR'])
  assert.deepEqual(inbound.map((p) => p.originCountryAlpha2), ['SG', 'NL'])
  assert.deepEqual(pairsForCountry(SAMPLE_PAIRS, 'JP'), { outbound: [], inbound: [] })
})

test('historical snapshot selection takes the nearest retained snapshot at or before the time', () => {
  const entries = [
    { generatedAt: '2026-11-26T00:00:00Z', path: 'data/history/cloudflare/24h/a.json', pairCount: 50 },
    { generatedAt: '2026-11-26T06:00:00Z', path: 'data/history/cloudflare/24h/b.json', pairCount: 48 },
    { generatedAt: '2026-11-26T12:00:00Z', path: 'data/history/cloudflare/24h/c.json', pairCount: 51 },
  ]
  assert.equal(selectHistoricalSnapshot(entries, Date.parse('2026-11-26T06:00:00Z')).path, 'data/history/cloudflare/24h/b.json')
  assert.equal(selectHistoricalSnapshot(entries, Date.parse('2026-11-26T09:00:00Z')).path, 'data/history/cloudflare/24h/b.json')
  assert.equal(selectHistoricalSnapshot(entries, Date.parse('2026-11-25T23:00:00Z')), null)
  assert.equal(selectHistoricalSnapshot([], Date.parse('2026-11-26T09:00:00Z')), null)
  assert.equal(selectHistoricalSnapshot(null, Date.parse('2026-11-26T09:00:00Z')), null)
})

test('pair changes report only real added, removed and changed pairs', () => {
  const previous = [
    { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 10 },
    { originCountryAlpha2: 'SG', originCountryName: 'Singapore', targetCountryAlpha2: 'US', targetCountryName: 'United States', value: 5 },
  ]
  const current = [
    { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 12 },
    { originCountryAlpha2: 'NL', originCountryName: 'Netherlands', targetCountryAlpha2: 'US', targetCountryName: 'United States', value: 3 },
  ]
  const diff = cloudflarePairChanges(current, previous)
  assert.equal(diff.changed.length, 1)
  assert.equal(diff.changed[0].previousValue, 10)
  assert.equal(diff.changed[0].value, 12)
  assert.deepEqual(diff.added.map((p) => p.originCountryAlpha2), ['NL'])
  assert.deepEqual(diff.removed.map((p) => p.originCountryAlpha2), ['SG'])
  // No prior snapshot retained -> no comparison, not an empty diff.
  assert.equal(cloudflarePairChanges(current, null), null)
  assert.deepEqual(cloudflarePairChanges(current, current), { added: [], removed: [], changed: [] })
})

test('pulse plan caps at the top 12 arcs, fastest for the largest pair, 3-9s only', () => {
  const arcs = Array.from({ length: 20 }, (_, i) => ({
    key: `US:DE:${i}`, pathId: `gtw-cf-arc-${i}`, value: 20 - i,
  }))
  const plan = arcPulsePlan(arcs, 12)
  assert.equal(plan.length, 12)
  assert.equal(plan[0].value, 20)
  assert.equal(plan[0].durationSec, 3)
  assert.ok(plan.every((p) => p.durationSec >= 3 && p.durationSec <= 9))
  assert.ok(plan.every((p, i, arr) => i === 0 || p.durationSec >= arr[i - 1].durationSec))
  assert.deepEqual(arcPulsePlan([], 12), [])
})

test('interval URLs use only the four contracted intervals, defaulting to 24h', () => {
  assert.equal(cloudflareIntervalUrl('/base/', '1h'), '/base/data/cloudflare-attack-pairs-1h.json')
  assert.equal(cloudflareIntervalUrl('/base/', '7d'), '/base/data/cloudflare-attack-pairs-7d.json')
  assert.equal(cloudflareIntervalUrl('/base/', 'bogus'), '/base/data/cloudflare-attack-pairs-24h.json')
})

test('map output contains only provider-supplied countries and values', () => {
  const result = buildCloudflareRadarMap(SAMPLE_PAIRS, countries, projection, path, { US: '840', DE: '276', FR: '250', SG: '702', NL: '528' })
  const suppliedCodes = new Set(SAMPLE_PAIRS.flatMap((p) => [p.originCountryAlpha2, p.targetCountryAlpha2]))
  assert.ok(result.arcs.every((arc) => suppliedCodes.has(arc.originCountryAlpha2) && suppliedCodes.has(arc.targetCountryAlpha2)))
  assert.ok(result.arcs.every((arc) => SAMPLE_PAIRS.some((p) => p.value === arc.value)))
  assert.deepEqual([...result.roles.keys()].sort(), ['250', '276', '528', '702', '840'])
})

// --- Round 2: rankings must come from the real published interval files ---

function readRealPairs(interval) {
  return JSON.parse(readFileSync(
    new URL(`../public/data/cloudflare-attack-pairs-${interval}.json`, import.meta.url),
    'utf8',
  ))
}

// Independent hand computation: plain summation in file order, not the
// ranking helper under test.
function expectedRanking(pairs, side) {
  const key = side === 'target' ? 'targetCountryAlpha2' : 'originCountryAlpha2'
  const nameKey = side === 'target' ? 'targetCountryName' : 'originCountryName'
  const totals = new Map()
  for (const pair of pairs) {
    const entry = totals.get(pair[key]) || { code: pair[key], name: pair[nameKey], total: 0 }
    entry.total += pair.value
    totals.set(pair[key], entry)
  }
  return [...totals.values()].sort((a, b) => b.total - a.total)
}

test('rankings match hand-computed totals from the real 1h and 24h files, and differ by interval', () => {
  const file1h = readRealPairs('1h')
  const file24h = readRealPairs('24h')
  assert.equal(file1h.pairs.length, 50)
  assert.equal(file24h.pairs.length, 50)

  assert.deepEqual(rankCloudflareCountries(file1h.pairs, 'origin'), expectedRanking(file1h.pairs, 'origin'))
  assert.deepEqual(rankCloudflareCountries(file1h.pairs, 'target'), expectedRanking(file1h.pairs, 'target'))
  assert.deepEqual(rankCloudflareCountries(file24h.pairs, 'origin'), expectedRanking(file24h.pairs, 'origin'))
  assert.deepEqual(rankCloudflareCountries(file24h.pairs, 'target'), expectedRanking(file24h.pairs, 'target'))

  const topOrigin1h = rankCloudflareCountries(file1h.pairs, 'origin')[0]
  const topOrigin24h = rankCloudflareCountries(file24h.pairs, 'origin')[0]
  const topTarget1h = rankCloudflareCountries(file1h.pairs, 'target')[0]
  const topTarget24h = rankCloudflareCountries(file24h.pairs, 'target')[0]
  // The top origin code is US in both files; what differs is the ranking
  // itself — the totals and the rest of the order are interval-specific.
  assert.equal(topOrigin1h.code, 'US')
  assert.equal(topOrigin24h.code, 'US')
  assert.ok(Math.abs(topOrigin1h.total - 24.861583) < 1e-6, `1h top origin total is ${topOrigin1h.total}`)
  assert.ok(Math.abs(topOrigin24h.total - 17.439526) < 1e-6, `24h top origin total is ${topOrigin24h.total}`)
  assert.notEqual(topOrigin1h.total, topOrigin24h.total)
  assert.notEqual(topTarget1h.total, topTarget24h.total)
  assert.notDeepEqual(
    rankCloudflareCountries(file1h.pairs, 'origin'),
    rankCloudflareCountries(file24h.pairs, 'origin'),
  )
  assert.notDeepEqual(
    rankCloudflareCountries(file1h.pairs, 'target'),
    rankCloudflareCountries(file24h.pairs, 'target'),
  )
})

test('stale-response guard: a response for the wrong interval or product is ignored', () => {
  const doc24hAll = { interval: '24h', pairs: [] }
  const doc1hAll = { interval: '1h', pairs: [] }
  const doc24hWaf = { interval: '24h', product: 'WAF', pairs: [] }
  const doc24hDdos = { interval: '24h', product: 'DDOS', pairs: [] }

  assert.equal(responseMatchesRequest(doc24hAll, '24h', 'all'), true)
  assert.equal(responseMatchesRequest(doc1hAll, '24h', 'all'), false)
  assert.equal(responseMatchesRequest(doc24hAll, '1h', 'all'), false)
  assert.equal(responseMatchesRequest(doc24hWaf, '24h', 'WAF'), true)
  assert.equal(responseMatchesRequest(doc24hWaf, '24h', 'DDOS'), false)
  assert.equal(responseMatchesRequest(doc24hDdos, '24h', 'WAF'), false)
  // Files published before products carry no product field: they are the
  // 'all' product, selected by their product-specific URL.
  assert.equal(responseMatchesRequest(doc24hAll, '24h', 'WAF'), true)
  assert.equal(responseMatchesRequest(null, '24h', 'all'), false)
  assert.equal(responseMatchesRequest({ pairs: [] }, '24h', 'all'), false)
})

test('missing 24h file is never substituted with the legacy base file', () => {
  // The per-interval URL is the only URL the page fetches; there is no
  // legacy fallback path in the product URL builder.
  assert.equal(cloudflareProductUrl('/base/', '24h', 'all'), '/base/data/cloudflare-attack-pairs-24h.json')
  for (const interval of ['1h', '6h', '24h', '7d']) {
    assert.notEqual(cloudflareProductUrl('/base/', interval, 'all'), '/base/data/cloudflare-attack-pairs.json')
  }
})

test('product URL mapping covers all seven products plus all, for pairs and timeseries', () => {
  assert.deepEqual(CLOUDFLARE_PRODUCTS, [
    'all', 'DDOS', 'WAF', 'BOT_MANAGEMENT', 'ACCESS_RULES', 'IP_REPUTATION', 'API_SHIELD', 'DATA_LOSS_PREVENTION',
  ])
  const expectedSuffixes = {
    all: '', DDOS: 'ddos', WAF: 'waf', BOT_MANAGEMENT: 'bot_management',
    ACCESS_RULES: 'access_rules', IP_REPUTATION: 'ip_reputation',
    API_SHIELD: 'api_shield', DATA_LOSS_PREVENTION: 'data_loss_prevention',
  }
  for (const [product, suffix] of Object.entries(expectedSuffixes)) {
    const suffixPart = suffix ? `-${suffix}` : ''
    assert.equal(
      cloudflareProductUrl('/base/', '24h', product),
      `/base/data/cloudflare-attack-pairs-24h${suffixPart}.json`,
    )
    assert.equal(
      cloudflareTimeseriesUrl('/base/', '6h', product),
      `/base/data/cloudflare-timeseries-6h${suffixPart}.json`,
    )
  }
  // Unknown products and intervals fall back to the safe defaults.
  assert.equal(cloudflareProductUrl('/base/', 'bogus', 'BOGUS'), '/base/data/cloudflare-attack-pairs-24h.json')
  assert.equal(cloudflareTimeseriesUrl('/base/', 'bogus', 'BOGUS'), '/base/data/cloudflare-timeseries-24h.json')
})

test('timeseries point mapping preserves real timestamps and values, with no interpolation', () => {
  const doc = {
    serie: {
      // Uneven gaps stay uneven: 15m, then 45m, then 15m — never filled in.
      timestamps: [
        '2026-11-26T21:00:00Z', '2026-11-26T21:15:00Z', '2026-11-26T22:00:00Z',
        '2026-11-26T22:15:00Z', 'not-a-date', '2026-11-26T22:30:00Z',
      ],
      values: [10, 12, 9, 11, 99, 'not-a-number'],
    },
  }
  assert.deepEqual(mapTimeseriesPoints(doc), [
    { timestamp: Date.parse('2026-11-26T21:00:00Z'), value: 10 },
    { timestamp: Date.parse('2026-11-26T21:15:00Z'), value: 12 },
    { timestamp: Date.parse('2026-11-26T22:00:00Z'), value: 9 },
    { timestamp: Date.parse('2026-11-26T22:15:00Z'), value: 11 },
  ])
  // Numeric epoch timestamps pass through unchanged; a values array
  // longer than timestamps is truncated, never padded.
  assert.deepEqual(
    mapTimeseriesPoints({ serie: { timestamps: [1000, 2000], values: [1, 2, 3] } }),
    [{ timestamp: 1000, value: 1 }, { timestamp: 2000, value: 2 }],
  )
  assert.deepEqual(mapTimeseriesPoints({}), [])
  assert.deepEqual(mapTimeseriesPoints(null), [])
  assert.deepEqual(mapTimeseriesPoints({ serie: { timestamps: [], values: [] } }), [])
})

test('window shift is the requested-vs-returned gap, from the file or the ranges', () => {
  // Explicit field wins.
  assert.equal(computeWindowShiftMinutes({ windowShiftMinutes: -15 }), -15)
  assert.equal(computeWindowShiftMinutes({ windowShiftMinutes: 0 }), 0)
  // Derived: the real 1h file requested 21:30–22:30Z but Cloudflare
  // returned the latest fully aggregated window, 21:00–22:00Z.
  const file1h = readRealPairs('1h')
  assert.equal(computeWindowShiftMinutes(file1h), 30)
  // Aligned windows report zero shift.
  assert.equal(computeWindowShiftMinutes({
    window: { dateStart: '2026-11-26T21:00:00Z', dateEnd: '2026-11-26T22:00:00Z' },
    meta: { dateRange: [{ startTime: '2026-11-26T21:00:00Z', endTime: '2026-11-26T22:00:00Z' }] },
  }), 0)
  assert.equal(computeWindowShiftMinutes({}), null)
  assert.equal(computeWindowShiftMinutes({ window: { dateStart: '2026-11-26T21:00:00Z' } }), null)
})

test('aggregation interval is 15m for 1h/6h, hourly for 24h, daily for 7d', () => {
  assert.equal(cloudflareAggInterval('1h'), '15m')
  assert.equal(cloudflareAggInterval('6h'), '15m')
  assert.equal(cloudflareAggInterval('24h'), '1h')
  assert.equal(cloudflareAggInterval('7d'), '1d')
  assert.equal(cloudflareAggInterval('bogus'), '1h')
})

test('manifest entries read v2 per product with v1 fallback for all', () => {
  const v2 = {
    schemaVersion: 2,
    pairs: {
      '24h': {
        all: [{ generatedAt: '2026-11-26T00:00:00Z', path: 'data/history/cloudflare/24h/all/a.json', pairCount: 50 }],
        WAF: [{ generatedAt: '2026-11-26T01:00:00Z', path: 'data/history/cloudflare/24h/waf/a.json', pairCount: 12 }],
      },
    },
    timeseries: {
      '24h': {
        all: [{ generatedAt: '2026-11-26T00:00:00Z', path: 'data/history/cloudflare-timeseries/24h/all/a.json', pointCount: 24 }],
      },
    },
    intervals: {
      '24h': [{ generatedAt: '2026-11-26T00:00:00Z', path: 'data/history/cloudflare/24h/legacy.json', pairCount: 50 }],
    },
  }
  assert.equal(manifestEntries(v2, '24h', 'WAF', 'pairs')[0].path, 'data/history/cloudflare/24h/waf/a.json')
  assert.equal(manifestEntries(v2, '24h', 'all', 'pairs')[0].path, 'data/history/cloudflare/24h/all/a.json')
  assert.equal(manifestEntries(v2, '24h', 'DDOS', 'pairs').length, 0)
  assert.equal(manifestEntries(v2, '24h', 'all', 'timeseries')[0].pointCount, 24)
  assert.equal(manifestEntries(v2, '24h', 'WAF', 'timeseries').length, 0)
  // v1 manifest (no pairs/timeseries sections): entries are pairs/"all".
  const v1 = { intervals: { '24h': [{ generatedAt: '2026-11-26T00:00:00Z', path: 'data/history/cloudflare/24h/legacy.json', pairCount: 50 }] } }
  assert.equal(manifestEntries(v1, '24h', 'all', 'pairs')[0].path, 'data/history/cloudflare/24h/legacy.json')
  assert.equal(manifestEntries(v1, '24h', 'WAF', 'pairs').length, 0)
  assert.equal(manifestEntries(null, '24h', 'all', 'pairs').length, 0)
})

test('historical snapshot selection is per interval and product', () => {
  const manifest = {
    schemaVersion: 2,
    pairs: {
      '24h': {
        all: [
          { generatedAt: '2026-11-26T00:00:00Z', path: 'data/history/cloudflare/24h/all/a.json' },
          { generatedAt: '2026-11-26T06:00:00Z', path: 'data/history/cloudflare/24h/all/b.json' },
        ],
        WAF: [
          { generatedAt: '2026-11-26T03:00:00Z', path: 'data/history/cloudflare/24h/waf/a.json' },
        ],
      },
      '1h': {
        all: [{ generatedAt: '2026-11-26T05:00:00Z', path: 'data/history/cloudflare/1h/all/a.json' }],
      },
    },
  }
  assert.equal(
    selectHistoricalSnapshotForProduct(manifest, '24h', 'all', Date.parse('2026-11-26T09:00:00Z')).path,
    'data/history/cloudflare/24h/all/b.json',
  )
  assert.equal(
    selectHistoricalSnapshotForProduct(manifest, '24h', 'WAF', Date.parse('2026-11-26T09:00:00Z')).path,
    'data/history/cloudflare/24h/waf/a.json',
  )
  // A WAF playhead before the only WAF snapshot has no history — even
  // though an 'all' snapshot exists at that time.
  assert.equal(selectHistoricalSnapshotForProduct(manifest, '24h', 'WAF', Date.parse('2026-11-26T02:00:00Z')), null)
  assert.equal(selectHistoricalSnapshotForProduct(manifest, '1h', 'all', Date.parse('2026-11-26T09:00:00Z')).path, 'data/history/cloudflare/1h/all/a.json')
  assert.equal(selectHistoricalSnapshotForProduct(manifest, '7d', 'all', Date.parse('2026-11-26T09:00:00Z')), null)
})

test('timeseries track status derives from the timeseries document only', () => {
  assert.equal(timeseriesStatusLabel({ timeseriesStatus: 'live' }), 'LIVE')
  assert.equal(timeseriesStatusLabel({ timeseriesStatus: 'stale' }), 'STALE')
  assert.equal(timeseriesStatusLabel({ timeseriesStatus: 'unavailable' }), 'UNAVAILABLE')
  assert.equal(timeseriesStatusLabel({ timeseriesStatus: 'error' }), 'UNAVAILABLE')
  assert.equal(timeseriesStatusLabel({ points: [{ timestamp: 1, value: 2 }] }), 'LIVE')
  assert.equal(timeseriesStatusLabel({ timeseriesStatus: 'live', points: [] }), 'LIVE')
  assert.equal(timeseriesStatusLabel({}), 'NO DATA')
  assert.equal(timeseriesStatusLabel(null), 'UNAVAILABLE')
})

// --- New governing spec: five layers, rankings summed across enabled layers ---

const WEB_PAIRS = [
  { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 25 },
  { originCountryAlpha2: 'SG', originCountryName: 'Singapore', targetCountryAlpha2: 'US', targetCountryName: 'United States', value: 10 },
]
const DDOS_PAIRS = [
  { originCountryAlpha2: 'NL', originCountryName: 'Netherlands', targetCountryAlpha2: 'US', targetCountryName: 'United States', value: 20 },
  { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'FR', targetCountryName: 'France', value: 5 },
]

test('layer-sum rankings change when a layer is disabled, and are empty when neither is enabled', () => {
  const both = combineCloudflareLayerPairs({
    web: { pairs: WEB_PAIRS, enabled: true },
    ddos: { pairs: DDOS_PAIRS, enabled: true },
  })
  assert.equal(both.length, 4)
  assert.deepEqual(both.map((p) => p.cfLayer), ['web', 'web', 'ddos', 'ddos'])
  assert.deepEqual(
    rankCloudflareCountries(both, 'origin').map((c) => [c.code, c.total]),
    [['US', 30], ['NL', 20], ['SG', 10]],
  )
  assert.deepEqual(
    rankCloudflareCountries(both, 'target').map((c) => [c.code, c.total]),
    [['US', 30], ['DE', 25], ['FR', 5]],
  )

  // Disabling the DDoS layer removes its contribution from both rankings.
  const webOnly = combineCloudflareLayerPairs({
    web: { pairs: WEB_PAIRS, enabled: true },
    ddos: { pairs: DDOS_PAIRS, enabled: false },
  })
  assert.deepEqual(
    rankCloudflareCountries(webOnly, 'origin').map((c) => [c.code, c.total]),
    [['US', 25], ['SG', 10]],
  )
  assert.deepEqual(
    rankCloudflareCountries(webOnly, 'target').map((c) => [c.code, c.total]),
    [['DE', 25], ['US', 10]],
  )
  assert.notDeepEqual(
    rankCloudflareCountries(both, 'origin'),
    rankCloudflareCountries(webOnly, 'origin'),
  )

  // Neither layer enabled -> no ranking at all, never the 'all' aggregate.
  assert.deepEqual(combineCloudflareLayerPairs({
    web: { pairs: WEB_PAIRS, enabled: false },
    ddos: { pairs: DDOS_PAIRS, enabled: false },
  }), [])
  assert.deepEqual(rankCloudflareCountries([], 'origin'), [])
})

test('the two Cloudflare layers build distinct arcs with distinct path ids', () => {
  const samePair = {
    originCountryAlpha2: 'US', originCountryName: 'United States',
    targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 12.5,
  }
  const web = buildCloudflareRadarMap(
    [{ ...samePair, cfLayer: 'web' }], countries, projection, path, { US: '840', DE: '276' }, 'web',
  )
  const ddos = buildCloudflareRadarMap(
    [{ ...samePair, cfLayer: 'ddos' }], countries, projection, path, { US: '840', DE: '276' }, 'ddos',
  )
  assert.equal(web.arcs.length, 1)
  assert.equal(ddos.arcs.length, 1)
  assert.equal(web.arcs[0].layer, 'web')
  assert.equal(ddos.arcs[0].layer, 'ddos')
  assert.notEqual(web.arcs[0].key, ddos.arcs[0].key)
  assert.notEqual(web.arcs[0].pathId, ddos.arcs[0].pathId)
  assert.equal(web.arcs[0].pathId, 'gtw-cf-arc-web-0')
  assert.equal(ddos.arcs[0].pathId, 'gtw-cf-arc-ddos-0')
  // No layer tag preserves the original single-layer ids.
  const untagged = buildCloudflareRadarMap([samePair], countries, projection, path, { US: '840', DE: '276' })
  assert.equal(untagged.arcs[0].pathId, 'gtw-cf-arc-0')
  assert.equal(untagged.arcs[0].layer, null)
})

function rawTimeseriesEntry(product, total, points = 2) {
  const perPoint = total / points
  return {
    product,
    label: product,
    normalization: 'NONE',
    points: Array.from({ length: points }, (_, i) => ({ timestamp: 1000 + i, value: perPoint })),
  }
}

test('attack vectors compute only from raw-count per-product timeseries totals', () => {
  const all = ['DDOS', 'WAF', 'BOT_MANAGEMENT', 'ACCESS_RULES', 'IP_REPUTATION', 'API_SHIELD', 'DATA_LOSS_PREVENTION']
  const entries = all.map((product, i) => rawTimeseriesEntry(product, (i + 1) * 100))
  const result = computeAttackVectorsFromTimeseries(entries)
  assert.equal(result.available, true)
  assert.equal(result.reason, null)
  // Totals 100..700 sum to 2800; the largest product takes 700/2800 = 25%.
  assert.equal(result.vectors[0].product, 'DATA_LOSS_PREVENTION')
  assert.equal(result.vectors[0].total, 700)
  assert.ok(Math.abs(result.vectors[0].share - 0.25) < 1e-9)
  assert.equal(result.vectors.length, 7)
  assert.ok(Math.abs(result.vectors.reduce((sum, v) => sum + v.share, 0) - 1) < 1e-9)
})

test('attack vectors stay disabled when totals cannot be validated', () => {
  // No timeseries published at all.
  const none = computeAttackVectorsFromTimeseries([])
  assert.equal(none.available, false)
  assert.match(none.reason, /not been published/)
  assert.deepEqual(none.vectors, [])

  // One product missing -> the total cannot be validated.
  const all = ['DDOS', 'WAF', 'BOT_MANAGEMENT', 'ACCESS_RULES', 'IP_REPUTATION', 'API_SHIELD', 'DATA_LOSS_PREVENTION']
  const partial = all.slice(0, 6).map((product) => rawTimeseriesEntry(product, 100))
  const missing = computeAttackVectorsFromTimeseries(partial)
  assert.equal(missing.available, false)
  assert.match(missing.reason, /DATA_LOSS_PREVENTION/)
  assert.deepEqual(missing.vectors, [])

  // Normalized values (like the pairs files' PERCENTAGE) cannot be
  // summed into shares of anything real.
  const normalized = all.map((product) => ({ ...rawTimeseriesEntry(product, 100), normalization: 'PERCENTAGE' }))
  const normResult = computeAttackVectorsFromTimeseries(normalized)
  assert.equal(normResult.available, false)
  assert.match(normResult.reason, /PERCENTAGE/)
  assert.deepEqual(normResult.vectors, [])

  // A single normalized product disables the whole panel.
  const oneBad = all.map((product) => rawTimeseriesEntry(product, 100))
  oneBad[0] = { ...oneBad[0], normalization: 'MIN0_MAX' }
  assert.equal(computeAttackVectorsFromTimeseries(oneBad).available, false)

  // Zero totals -> no shares.
  const zeros = all.map((product) => rawTimeseriesEntry(product, 0))
  assert.equal(computeAttackVectorsFromTimeseries(zeros).available, false)
})
