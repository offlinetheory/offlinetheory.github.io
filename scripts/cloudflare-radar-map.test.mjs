import assert from 'node:assert/strict'
import test from 'node:test'
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-50m.json' with { type: 'json' }
import { normalizeCloudflareRadarResponse } from './build-threat-intel-snapshot.mjs'
import {
  arcPulsePlan,
  buildCloudflareRadarMap,
  cloudflareIntervalUrl,
  cloudflarePairChanges,
  pairsForCountry,
  rankCloudflareCountries,
  selectHistoricalSnapshot,
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
