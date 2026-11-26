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
