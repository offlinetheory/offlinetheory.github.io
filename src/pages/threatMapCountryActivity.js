import { cloudflarePairChanges } from './cloudflareRadarMap.js'

const NO_ACTIVITY_FILL = '#050505'
const LOW_ACTIVITY_GRAY = 48
const HIGHEST_ACTIVITY_GRAY = 220
export const LIVE_WINDOW_MS = 20 * 60 * 1000
export const RECENT_WINDOW_MS = 60 * 60 * 1000
export const STALE_WINDOW_MS = 24 * 60 * 60 * 1000

function grayHex(value) {
  const channel = Math.round(value).toString(16).padStart(2, '0')
  return `#${channel}${channel}${channel}`
}

export function sourceObservedAt(source) {
  for (const value of [source.lastSeen, source.firstSeen, source.dataDate]) {
    if (typeof value !== 'string') continue
    const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value)
    if (Number.isFinite(timestamp)) return timestamp
  }
  return null
}

export function providerFreshness(provider, now = Date.now()) {
  if (provider?.status === 'stale') return 'STALE'
  if (provider?.status === 'offline' || provider?.status === 'unavailable') return 'OFFLINE'
  const timestamp = Date.parse(provider?.fetchedAt || provider?.lastSuccessfulAt || '')
  if (!Number.isFinite(timestamp)) return 'OFFLINE'
  const age = Math.max(0, now - timestamp)
  if (provider.status === 'live' && age <= LIVE_WINDOW_MS) return 'LIVE'
  if (age <= RECENT_WINDOW_MS) return 'RECENT'
  if (age <= STALE_WINDOW_MS) return 'STALE'
  return 'OFFLINE'
}

export function sourcesInTimeWindow(sources, start, end, through = end) {
  if (![start, end, through].every(Number.isFinite) || start >= end) return []
  const upperBound = Math.min(end, through)
  return sources.filter((source) => {
    const observedAt = sourceObservedAt(source)
    return observedAt !== null && observedAt >= start && observedAt <= upperBound
  })
}

export function zoomMapTransform(current, factor, focal, minScale = 1, maxScale = 8) {
  const scale = Math.max(minScale, Math.min(maxScale, current.scale * factor))
  const ratio = scale / current.scale
  return {
    scale,
    x: focal.x - (focal.x - current.x) * ratio,
    y: focal.y - (focal.y - current.y) * ratio,
  }
}

export function panMapTransform(current, deltaX, deltaY) {
  return { ...current, x: current.x + deltaX, y: current.y + deltaY }
}

export function buildCountryActivity(sources, countryNumeric) {
  const totals = new Map()
  for (const source of sources) {
    const countryCode = source.countryCode
    const countryId = countryNumeric[countryCode]
    if (!countryId || !Number.isFinite(source.reports) || source.reports <= 0) continue
    const total = totals.get(countryCode) || {
      country: source.country,
      countryCode,
      reports: 0,
      sources: 0,
      lastObservedAt: null,
    }
    total.reports += source.reports
    total.sources += 1
    const observedAt = sourceObservedAt(source)
    if (observedAt !== null && (total.lastObservedAt === null || observedAt > total.lastObservedAt)) {
      total.lastObservedAt = observedAt
    }
    totals.set(countryCode, total)
  }

  const maxReports = Math.max(0, ...[...totals.values()].map(({ reports }) => reports))
  const activity = new Map()
  for (const [countryCode, total] of totals) {
    const ratio = maxReports > 0 ? Math.sqrt(total.reports / maxReports) : 0
    const intensity = ratio === 1
      ? 'highest'
      : ratio >= 0.65
        ? 'high'
        : ratio >= 0.45
          ? 'moderate'
          : 'low'
    const gray = LOW_ACTIVITY_GRAY + ratio * (HIGHEST_ACTIVITY_GRAY - LOW_ACTIVITY_GRAY)
    activity.set(countryNumeric[countryCode], {
      ...total,
      activityType: 'source',
      lastObservedAt: total.lastObservedAt === null ? null : new Date(total.lastObservedAt).toISOString(),
      intensity,
      fill: grayHex(gray),
      ratio,
    })
  }

  return { activity, noActivityFill: NO_ACTIVITY_FILL }
}

export function countryFillStyle(activity, countryNumericId) {
  const country = activity.get(countryNumericId)
  return {
    fill: country?.fill || NO_ACTIVITY_FILL,
    fillOpacity: 1,
  }
}

/**
 * Filter audit: which map/dashboard layers each attack-type filter
 * controls. Every filter maps to at least one visible layer; ransomware
 * and breaches have no enabled geographic source, so they control only
 * the visibility of their honest disabled notice (never invented data).
 */
export function layerVisibility(filters = {}) {
  return {
    dshieldSources: Boolean(filters.scanning),
    dshieldShading: Boolean(filters.scanning),
    dshieldMarkers: Boolean(filters.scanning),
    dshieldPorts: Boolean(filters.scanning),
    cloudflareArcs: filters.cloudflare !== false,
    cloudflareHighlights: filters.cloudflare !== false,
    cloudflarePairs: filters.cloudflare !== false,
    cloudflareTimeline: filters.cloudflare !== false,
    exploitedPanels: Boolean(filters.exploited),
    exploitedTimeline: Boolean(filters.exploited),
    ransomwareNotice: Boolean(filters.ransomware),
    breachesNotice: Boolean(filters.breaches),
  }
}

/** Whether a timeline track is shown for the current filter state. */
export function timelineTrackVisible(trackKey, filters = {}) {
  if (trackKey === 'cloudflare') return filters.cloudflare !== false
  if (trackKey === 'nvd' || trackKey === 'kev') return Boolean(filters.exploited)
  return true
}

function alertTimestamp(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value || '')
  return Number.isFinite(timestamp) ? timestamp : null
}

/**
 * Provider-backed threat alerts, derived ONLY from data already in the
 * snapshots. No fabricated text or invented timestamps: every alert
 * carries its real provider timestamp and a reference link.
 * - NVD: most recently published CVEs (latest 3 with a parseable date).
 * - CISA KEV: most recently added catalog entries (latest 3).
 * - DShield: day-over-day change between the last two dailySummary days.
 * - Cloudflare: pair changes vs the previous retained snapshot only when
 *   `cloudflarePreviousPairs` is an array; null means no prior snapshot
 *   exists, so no Cloudflare-change alert is produced.
 */
export function buildThreatAlerts({
  nvd = [],
  kev = [],
  dailySummary = [],
  cloudflareCurrentPairs = null,
  cloudflarePreviousPairs = null,
  cloudflareAsOf = null,
} = {}) {
  const alerts = []

  const recentCves = (Array.isArray(nvd) ? nvd : [])
    .map((item) => ({ id: item?.cve?.id || item?.id, published: item?.cve?.published || item?.published }))
    .filter((item) => typeof item.id === 'string' && alertTimestamp(item.published) !== null)
    .sort((a, b) => alertTimestamp(b.published) - alertTimestamp(a.published))
    .slice(0, 3)
  for (const cve of recentCves) {
    alerts.push({
      id: `nvd:${cve.id}`,
      provider: 'NIST NVD',
      kind: 'new-cve',
      title: `New CVE published: ${cve.id}`,
      detail: 'Published in the NVD feed in this snapshot.',
      timestamp: alertTimestamp(cve.published),
      href: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
    })
  }

  const recentKev = (Array.isArray(kev) ? kev : [])
    .map((item) => ({
      cveID: item?.cveID,
      dateAdded: item?.dateAdded,
      vendorProject: item?.vendorProject || '',
      product: item?.product || '',
    }))
    .filter((item) => typeof item.cveID === 'string' && alertTimestamp(item.dateAdded) !== null)
    .sort((a, b) => alertTimestamp(b.dateAdded) - alertTimestamp(a.dateAdded))
    .slice(0, 3)
  for (const entry of recentKev) {
    alerts.push({
      id: `kev:${entry.cveID}`,
      provider: 'CISA KEV',
      kind: 'kev-addition',
      title: `Added to CISA KEV: ${entry.cveID}`,
      detail: [entry.vendorProject, entry.product].filter(Boolean).join(' — ') || 'Known exploited vulnerability.',
      timestamp: alertTimestamp(entry.dateAdded),
      href: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    })
  }

  const days = (Array.isArray(dailySummary) ? dailySummary : [])
    .map((day) => ({ date: day?.date, records: Number(day?.records) }))
    .filter((day) => alertTimestamp(day.date) !== null && Number.isFinite(day.records))
    .sort((a, b) => alertTimestamp(a.date) - alertTimestamp(b.date))
  if (days.length >= 2) {
    const previous = days[days.length - 2]
    const latest = days[days.length - 1]
    if (previous.records > 0) {
      const changePct = Math.round(((latest.records - previous.records) / previous.records) * 1000) / 10
      const direction = changePct > 0 ? 'rose' : changePct < 0 ? 'fell' : 'was unchanged'
      alerts.push({
        id: `dshield:${latest.date}`,
        provider: 'DShield',
        kind: 'dshield-daily-change',
        title: `DShield daily reports ${direction} ${Math.abs(changePct)}% day over day`,
        detail: `${previous.records.toLocaleString('en-US')} reports on ${previous.date} → ${latest.records.toLocaleString('en-US')} on ${latest.date}.`,
        timestamp: alertTimestamp(latest.date),
        href: 'https://isc.sans.edu/',
      })
    }
  }

  const pairDiff = cloudflarePairChanges(cloudflareCurrentPairs, cloudflarePreviousPairs)
  // A pair change is only alertable when the current snapshot carries a
  // real provider timestamp to date it with; otherwise it is dropped
  // rather than stamped with the viewer's clock.
  const cloudflareAsOfTimestamp = alertTimestamp(cloudflareAsOf)
  if (pairDiff && cloudflareAsOfTimestamp !== null) {
    const changes = [
      ...pairDiff.changed.map((pair) => ({ pair, text: `${pair.originCountryName} → ${pair.targetCountryName}: ${pair.previousValue}% → ${pair.value}%` })),
      ...pairDiff.added.map((pair) => ({ pair, text: `New pair ${pair.originCountryName} → ${pair.targetCountryName}: ${pair.value}%` })),
      ...pairDiff.removed.map((pair) => ({ pair, text: `Pair no longer reported: ${pair.originCountryName} → ${pair.targetCountryName}` })),
    ]
      .sort((a, b) => Math.abs(Number(b.pair.value) - Number(b.pair.previousValue ?? b.pair.value)) - Math.abs(Number(a.pair.value) - Number(a.pair.previousValue ?? a.pair.value)))
      .slice(0, 3)
    for (const [index, change] of changes.entries()) {
      alerts.push({
        id: `cloudflare-change:${index}:${change.pair.originCountryAlpha2}-${change.pair.targetCountryAlpha2}`,
        provider: 'Cloudflare Radar',
        kind: 'cloudflare-pair-change',
        title: 'Cloudflare Radar pair change vs previous retained snapshot',
        detail: change.text,
        timestamp: cloudflareAsOfTimestamp,
        href: 'https://radar.cloudflare.com/',
      })
    }
  }

  return alerts.sort((a, b) => b.timestamp - a.timestamp)
}
