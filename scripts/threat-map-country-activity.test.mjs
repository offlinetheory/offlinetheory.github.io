import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCountryActivity,
  buildThreatAlerts,
  countryFillStyle,
  layerVisibility,
  panMapTransform,
  providerFreshness,
  sourceObservedAt,
  sourcesInTimeWindow,
  timelineTrackVisible,
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

test('filter state maps to exactly the layers each filter controls', () => {
  const allOn = layerVisibility({ scanning: true, cloudflare: true, exploited: true, ransomware: true, breaches: true })
  assert.deepEqual(allOn, {
    dshieldSources: true, dshieldShading: true, dshieldMarkers: true, dshieldPorts: true,
    cloudflareArcs: true, cloudflareHighlights: true, cloudflarePairs: true, cloudflareTimeline: true,
    exploitedPanels: true, exploitedTimeline: true, ransomwareNotice: true, breachesNotice: true,
  })
  const scanningOff = layerVisibility({ scanning: false, cloudflare: true, exploited: true, ransomware: false, breaches: false })
  assert.equal(scanningOff.dshieldSources, false)
  assert.equal(scanningOff.dshieldMarkers, false)
  assert.equal(scanningOff.dshieldPorts, false)
  assert.equal(scanningOff.cloudflareArcs, true)
  assert.equal(scanningOff.ransomwareNotice, false)
  const cloudflareOff = layerVisibility({ scanning: true, cloudflare: false, exploited: false, ransomware: true, breaches: true })
  assert.equal(cloudflareOff.cloudflareArcs, false)
  assert.equal(cloudflareOff.cloudflareHighlights, false)
  assert.equal(cloudflareOff.cloudflareTimeline, false)
  assert.equal(cloudflareOff.exploitedPanels, false)
  assert.equal(cloudflareOff.exploitedTimeline, false)
  assert.equal(cloudflareOff.dshieldSources, true)
  // Ransomware/breaches never gate a map layer: they only control their notice.
  const noSource = layerVisibility({ scanning: true, cloudflare: true, exploited: true, ransomware: false, breaches: false })
  assert.equal(noSource.dshieldSources, true)
  assert.equal(noSource.cloudflareArcs, true)
})

test('timeline tracks hide only under their own filter', () => {
  assert.equal(timelineTrackVisible('cloudflare', { cloudflare: false, exploited: true }), false)
  assert.equal(timelineTrackVisible('cloudflare', { cloudflare: true, exploited: false }), true)
  assert.equal(timelineTrackVisible('nvd', { cloudflare: true, exploited: false }), false)
  assert.equal(timelineTrackVisible('kev', { cloudflare: false, exploited: false }), false)
  assert.equal(timelineTrackVisible('dshield', { cloudflare: false, exploited: false }), true)
  assert.equal(timelineTrackVisible('threatfox', { cloudflare: false, exploited: false }), true)
})

test('threat alerts use only provider data, real timestamps and reference links', () => {
  const alerts = buildThreatAlerts({
    nvd: [
      { cve: { id: 'CVE-2026-000001', published: '2026-11-26T10:00:00Z' } },
      { cve: { id: 'CVE-2026-000002', published: '2026-11-25T09:00:00Z' } },
    ],
    kev: [{ cveID: 'CVE-2026-000003', vendorProject: 'Acme', product: 'Widget', dateAdded: '2026-11-25' }],
    dailySummary: [
      { date: '2026-11-25', records: 100 },
      { date: '2026-11-26', records: 110 },
    ],
    cloudflareCurrentPairs: null,
    cloudflarePreviousPairs: null,
  })
  const nvdAlert = alerts.find((a) => a.id === 'nvd:CVE-2026-000001')
  assert.equal(nvdAlert.timestamp, Date.parse('2026-11-26T10:00:00Z'))
  assert.equal(nvdAlert.href, 'https://nvd.nist.gov/vuln/detail/CVE-2026-000001')
  const kevAlert = alerts.find((a) => a.id === 'kev:CVE-2026-000003')
  assert.equal(kevAlert.timestamp, Date.parse('2026-11-25T00:00:00Z'))
  assert.match(kevAlert.href, /cisa\.gov/)
  const dshieldAlert = alerts.find((a) => a.kind === 'dshield-daily-change')
  assert.match(dshieldAlert.title, /rose 10%/)
  assert.equal(dshieldAlert.timestamp, Date.parse('2026-11-26T00:00:00Z'))
  // No prior Cloudflare snapshot -> no Cloudflare-change alert is invented.
  assert.equal(alerts.some((a) => a.provider === 'Cloudflare Radar'), false)
  // Alerts are sorted newest first and carry only provider-supplied ids.
  assert.ok(alerts.every((a) => Number.isFinite(a.timestamp)))
  assert.deepEqual(alerts.map((a) => a.timestamp), [...alerts.map((a) => a.timestamp)].sort((a, b) => b - a))
})

test('Cloudflare pair-change alerts appear only against a real prior snapshot with a real as-of time', () => {
  const previous = [
    { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 10 },
  ]
  const current = [
    { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 12 },
  ]
  const withAsOf = buildThreatAlerts({
    cloudflareCurrentPairs: current,
    cloudflarePreviousPairs: previous,
    cloudflareAsOf: '2026-11-26T15:30:00Z',
  })
  assert.equal(withAsOf.length, 1)
  assert.equal(withAsOf[0].provider, 'Cloudflare Radar')
  assert.equal(withAsOf[0].timestamp, Date.parse('2026-11-26T15:30:00Z'))
  assert.match(withAsOf[0].detail, /10% → 12%/)
  // Same diff but no snapshot timestamp -> no alert rather than a stamped guess.
  const withoutAsOf = buildThreatAlerts({
    cloudflareCurrentPairs: current,
    cloudflarePreviousPairs: previous,
  })
  assert.equal(withoutAsOf.length, 0)
  // Identical pairs -> no change alert.
  assert.equal(buildThreatAlerts({
    cloudflareCurrentPairs: current,
    cloudflarePreviousPairs: current,
    cloudflareAsOf: '2026-11-26T15:30:00Z',
  }).length, 0)
})
