import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCountryActivity,
  countryFillStyle,
  panMapTransform,
  providerFreshness,
  sourceObservedAt,
  sourcesInTimeWindow,
  zoomMapTransform,
} from '../src/pages/threatMapCountryActivity.js'

const countryNumeric = { NL: '528', ES: '724', DE: '276' }

test('explicit stale and offline provider states override recent refresh timestamps', () => {
  const now = Date.parse('2026-11-26T04:00:00Z')
  const recentFetchedAt = new Date(now - 30_000).toISOString()

  assert.equal(providerFreshness({ status: 'stale', fetchedAt: recentFetchedAt }, now), 'STALE')
  assert.equal(providerFreshness({ status: 'offline', fetchedAt: recentFetchedAt }, now), 'OFFLINE')
})

test('country fill uses current source-country totals and changes when reports change', () => {
  const firstSnapshot = buildCountryActivity([
    { country: 'Netherlands', countryCode: 'NL', reports: 100 },
    { country: 'Spain', countryCode: 'ES', reports: 25 },
  ], countryNumeric)
  const nextSnapshot = buildCountryActivity([
    { country: 'Netherlands', countryCode: 'NL', reports: 100 },
    { country: 'Spain', countryCode: 'ES', reports: 64 },
  ], countryNumeric)

  assert.equal(firstSnapshot.activity.get('528').intensity, 'highest')
  assert.equal(firstSnapshot.activity.get('724').intensity, 'moderate')
  assert.equal(nextSnapshot.activity.get('724').intensity, 'high')
  assert.notEqual(
    firstSnapshot.activity.get('724').fill,
    nextSnapshot.activity.get('724').fill,
  )
  assert.notDeepEqual(
    countryFillStyle(firstSnapshot.activity, '724'),
    countryFillStyle(nextSnapshot.activity, '724'),
  )
})

test('country totals combine verified source reports and ignore unsupported records', () => {
  const result = buildCountryActivity([
    { country: 'Netherlands', countryCode: 'NL', reports: 60 },
    { country: 'Netherlands', countryCode: 'NL', reports: 40 },
    { country: 'Unknown', countryCode: 'ZZ', reports: 10_000 },
    { country: 'Spain', countryCode: 'ES', reports: 0 },
  ], countryNumeric)

  assert.equal(result.activity.get('528').reports, 100)
  assert.equal(result.activity.get('528').sources, 2)
  assert.equal(result.activity.has(undefined), false)
  assert.equal(result.noActivityFill, '#050505')
})

test('a replaced snapshot drops old countries and applies solid fills to actual SVG styles', () => {
  const firstSnapshot = buildCountryActivity([
    { country: 'Netherlands', countryCode: 'NL', reports: 100 },
    { country: 'Spain', countryCode: 'ES', reports: 50 },
  ], countryNumeric)
  const nextSnapshot = buildCountryActivity([
    { country: 'Germany', countryCode: 'DE', reports: 80 },
  ], countryNumeric)

  assert.equal(firstSnapshot.activity.has('724'), true)
  assert.equal(nextSnapshot.activity.has('724'), false)
  assert.deepEqual(countryFillStyle(nextSnapshot.activity, '276'), {
    fill: nextSnapshot.activity.get('276').fill,
    fillOpacity: 1,
  })
  assert.deepEqual(countryFillStyle(nextSnapshot.activity, '724'), {
    fill: '#050505',
    fillOpacity: 1,
  })
})

test('historical source filtering requires provider-supplied timestamps and respects playback position', () => {
  const timestamped = { ip: '192.0.2.1', country: 'Netherlands', countryCode: 'NL', reports: 5, lastSeen: '2026-11-25T12:00:00Z' }
  const untimestamped = { ip: '192.0.2.2', country: 'Netherlands', countryCode: 'NL', reports: 7 }
  const nextDay = { ip: '192.0.2.3', country: 'Spain', countryCode: 'ES', reports: 9, firstSeen: '2026-11-26T12:00:00Z' }
  const start = Date.parse('2026-11-25T00:00:00Z')
  const end = Date.parse('2026-11-27T00:00:00Z')

  assert.equal(sourceObservedAt(timestamped), Date.parse('2026-11-25T12:00:00Z'))
  assert.deepEqual(sourcesInTimeWindow([timestamped, untimestamped, nextDay], start, end), [timestamped, nextDay])
  assert.deepEqual(sourcesInTimeWindow([timestamped, untimestamped, nextDay], start, end, start + 24 * 60 * 60 * 1000), [timestamped])
})

test('zoom preserves the focal point and pan translates the synchronized map transform', () => {
  const initial = { x: 0, y: 0, scale: 1 }
  const focal = { x: 400, y: 200 }
  const zoomed = zoomMapTransform(initial, 2, focal)

  assert.deepEqual(zoomed, { x: -400, y: -200, scale: 2 })
  assert.deepEqual(panMapTransform(zoomed, 25, -10), { x: -375, y: -210, scale: 2 })
  assert.deepEqual(zoomMapTransform(zoomed, 0.1, focal), { ...initial })
})
