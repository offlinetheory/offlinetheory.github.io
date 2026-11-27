import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildCountryActivity,
  buildThreatAlerts,
  cloudflareLayerVisibility,
  countryFillStyle,
  layerVisibility,
  panMapTransform,
  providerFreshness,
  sourceObservedAt,
  sourcesInTimeWindow,
  timelineTrackVisible,
  timeseriesTrackVisible,
  verifiedPortProtocol,
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
  const allOn = layerVisibility({ scanning: true, web: true, ddos: true, intruders: true, anonymizers: true })
  assert.deepEqual(allOn, {
    dshieldSources: true, dshieldShading: true, dshieldMarkers: true, dshieldPorts: true,
    webArcs: true, webHighlights: true, webPairs: true, webTimeline: true,
    ddosArcs: true, ddosHighlights: true, ddosPairs: true, ddosTimeline: true,
    intrudersNotice: true, anonymizersNotice: true,
  })
  const scanningOff = layerVisibility({ scanning: false, web: true, ddos: true, intruders: false, anonymizers: false })
  assert.equal(scanningOff.dshieldSources, false)
  assert.equal(scanningOff.dshieldMarkers, false)
  assert.equal(scanningOff.dshieldPorts, false)
  assert.equal(scanningOff.webArcs, true)
  assert.equal(scanningOff.ddosArcs, true)
  assert.equal(scanningOff.intrudersNotice, false)
  // The two Cloudflare layers gate independently: one dataset is never
  // duplicated as two layers.
  const webOff = layerVisibility({ scanning: true, web: false, ddos: true, intruders: true, anonymizers: true })
  assert.equal(webOff.webArcs, false)
  assert.equal(webOff.webHighlights, false)
  assert.equal(webOff.webTimeline, false)
  assert.equal(webOff.ddosArcs, true)
  assert.equal(webOff.ddosPairs, true)
  assert.equal(webOff.dshieldSources, true)
  // Intruders/anonymizers never gate a map layer: they only control
  // their disabled notice.
  const noSource = layerVisibility({ scanning: true, web: true, ddos: true, intruders: false, anonymizers: false })
  assert.equal(noSource.dshieldSources, true)
  assert.equal(noSource.webArcs, true)
})

test('timeline tracks hide only under their own layer', () => {
  assert.equal(timelineTrackVisible('web', { web: false, ddos: true }), false)
  assert.equal(timelineTrackVisible('web', { web: true, ddos: false }), true)
  assert.equal(timelineTrackVisible('ddos', { web: true, ddos: false }), false)
  assert.equal(timelineTrackVisible('ddos', { web: false, ddos: true }), true)
  assert.equal(timelineTrackVisible('scanners', { scanning: false, web: true }), false)
  assert.equal(timelineTrackVisible('scanners', { scanning: true, web: false }), true)
  assert.equal(timelineTrackVisible('intruders', { intruders: false }), false)
  assert.equal(timelineTrackVisible('intruders', { intruders: true }), true)
  assert.equal(timelineTrackVisible('anonymizers', { anonymizers: false }), false)
  assert.equal(timelineTrackVisible('anonymizers', { anonymizers: true }), true)
})

test('one Cloudflare layer maps to exactly the map layers it controls', () => {
  const on = { scanning: true, web: true, ddos: true, intruders: true, anonymizers: true }
  assert.deepEqual(cloudflareLayerVisibility(on, 'web', true), {
    layer: 'web', available: true,
    arcs: true, highlights: true, pairs: true, timeline: true, timeseriesTrack: true,
  })
  assert.deepEqual(cloudflareLayerVisibility(on, 'ddos', true), {
    layer: 'ddos', available: true,
    arcs: true, highlights: true, pairs: true, timeline: true, timeseriesTrack: true,
  })
  // A layer whose file is missing/erroring gates every one of its
  // layers off — never another layer's data — while the timeseries
  // track stays visible so it can report UNAVAILABLE honestly.
  const unavailable = cloudflareLayerVisibility(on, 'ddos', false)
  assert.equal(unavailable.layer, 'ddos')
  assert.equal(unavailable.available, false)
  assert.equal(unavailable.arcs, false)
  assert.equal(unavailable.highlights, false)
  assert.equal(unavailable.pairs, false)
  assert.equal(unavailable.timeline, false)
  assert.equal(unavailable.timeseriesTrack, true)
  // The layer toggle gates that layer only, never the other dataset.
  const webOff = cloudflareLayerVisibility({ ...on, web: false }, 'web', true)
  assert.equal(webOff.arcs, false)
  assert.equal(webOff.timeseriesTrack, false)
  assert.equal(cloudflareLayerVisibility({ ...on, web: false }, 'ddos', true).arcs, true)
  // Other filters never affect a Cloudflare layer.
  const scanningOff = cloudflareLayerVisibility({ ...on, scanning: false }, 'web', true)
  assert.equal(scanningOff.arcs, true)
  assert.equal(scanningOff.layer, 'web')
})

test('timeseries tracks hide only with their own layer toggle', () => {
  assert.equal(timeseriesTrackVisible('web', { web: true, ddos: false }), true)
  assert.equal(timeseriesTrackVisible('web', { web: false, ddos: true }), false)
  assert.equal(timeseriesTrackVisible('ddos', { web: true, ddos: false }), false)
  assert.equal(timeseriesTrackVisible('ddos', { web: false, ddos: true }), true)
  assert.equal(timeseriesTrackVisible('scanners', { scanning: true }), false)
  assert.equal(timelineTrackVisible('web', { web: false, ddos: true }), false)
  assert.equal(timelineTrackVisible('ddos', { web: true, ddos: false }), false)
})

test('DShield top-port records carry no protocol field, so none is inferred', () => {
  const snapshot = JSON.parse(readFileSync(
    new URL('../public/data/threat-intel-snapshot.json', import.meta.url),
    'utf8',
  ))
  const records = snapshot.dashboard.ports.topports
  assert.ok(Array.isArray(records) && records.length > 0)
  // Verified against the real published snapshot: the records carry
  // rank, targetport, records, targets, sources and date — no protocol.
  assert.ok(records.every((record) => !('protocol' in record)))
  assert.deepEqual(
    Object.keys(records[0]).sort(),
    ['date', 'rank', 'records', 'sources', 'targetport', 'targets'],
  )
  assert.equal(verifiedPortProtocol(records[0]), null)
  assert.equal(verifiedPortProtocol({ port: 22, protocol: 'TCP' }), 'TCP')
  assert.equal(verifiedPortProtocol({ port: 53, protocol: 'UDP' }), 'UDP')
  assert.equal(verifiedPortProtocol({ port: 443, protocol: '' }), null)
  assert.equal(verifiedPortProtocol(null), null)
})

test('Cloudflare pair-change alerts are labelled per layer and never collide', () => {
  const previous = [
    { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 10 },
  ]
  const current = [
    { originCountryAlpha2: 'US', originCountryName: 'United States', targetCountryAlpha2: 'DE', targetCountryName: 'Germany', value: 12 },
  ]
  const webAlerts = buildThreatAlerts({
    cloudflareCurrentPairs: current,
    cloudflarePreviousPairs: previous,
    cloudflareAsOf: '2026-11-26T15:30:00Z',
    cloudflareLayer: 'web',
    cloudflareLayerLabel: 'Web Attackers (WAF)',
  })
  const ddosAlerts = buildThreatAlerts({
    cloudflareCurrentPairs: current,
    cloudflarePreviousPairs: previous,
    cloudflareAsOf: '2026-11-26T15:30:00Z',
    cloudflareLayer: 'ddos',
    cloudflareLayerLabel: 'DDoS Attackers (DDOS)',
  })
  assert.equal(webAlerts.length, 1)
  assert.equal(ddosAlerts.length, 1)
  assert.notEqual(webAlerts[0].id, ddosAlerts[0].id)
  assert.match(webAlerts[0].id, /cloudflare-change:web:/)
  assert.match(ddosAlerts[0].id, /cloudflare-change:ddos:/)
  assert.match(webAlerts[0].title, /Web Attackers \(WAF\)/)
  assert.match(ddosAlerts[0].title, /DDoS Attackers \(DDOS\)/)
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
