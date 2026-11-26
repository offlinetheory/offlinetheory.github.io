import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dshieldPortEvent,
  dshieldSourceEvent,
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
