import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const OUT = 'public/data/threat-intel-snapshot.json'
const SOURCES_FILE = 'public/data/sources-snapshot.json'
const KEV_FILE = 'public/data/kev-snapshot.json'
const CLOUDFLARE_FILE = 'public/data/cloudflare-attack-pairs.json'
const CLOUDFLARE_HISTORY_DIR = 'public/data/history/cloudflare'
const CLOUDFLARE_TIMESERIES_HISTORY_DIR = 'public/data/history/cloudflare-timeseries'
const CLOUDFLARE_HISTORY_MANIFEST_FILE = 'public/data/history/cloudflare-manifest.json'
export const CLOUDFLARE_INTERVALS = ['1h', '6h', '24h', '7d']
const CLOUDFLARE_INTERVAL_DURATION_MS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}
export const CLOUDFLARE_HISTORY_RETENTION_PER_INTERVAL = 96
// Per-(interval × product) history caps: the unfiltered "all" aggregate is
// the primary timeline (96 snapshots/interval, ~24h at the 15-min cadence);
// per-product slices keep 24/interval (~6h).
export const CLOUDFLARE_HISTORY_RETENTION = {
  pairsAll: 96,
  pairsProduct: 24,
  timeseriesAll: 96,
  timeseriesProduct: 24,
}
// Cloudflare Radar mitigationProduct values. 'all' is the unfiltered
// aggregate (no mitigationProduct parameter is sent). The product token in
// file names and history paths is the lowercase enum suffix; the `product`
// field inside published files and the manifest keys use the uppercase
// enum value, matching the frontend's CLOUDFLARE_PRODUCTS.
export const CLOUDFLARE_PRODUCTS = [
  'all',
  'DDOS',
  'WAF',
  'BOT_MANAGEMENT',
  'ACCESS_RULES',
  'IP_REPUTATION',
  'API_SHIELD',
  'DATA_LOSS_PREVENTION',
]
const CLOUDFLARE_PRODUCT_SUFFIXES = {
  DDOS: 'ddos',
  WAF: 'waf',
  BOT_MANAGEMENT: 'bot_management',
  ACCESS_RULES: 'access_rules',
  IP_REPUTATION: 'ip_reputation',
  API_SHIELD: 'api_shield',
  DATA_LOSS_PREVENTION: 'data_loss_prevention',
}
export function normalizeCloudflareProduct(product) {
  return CLOUDFLARE_PRODUCTS.includes(product) ? product : 'all'
}
export function cloudflareProductSuffix(product) {
  const safeProduct = normalizeCloudflareProduct(product)
  return safeProduct === 'all' ? '' : `-${CLOUDFLARE_PRODUCT_SUFFIXES[safeProduct]}`
}
const CLOUDFLARE_INTERVAL_FILE = (interval, product = 'all') =>
  `public/data/cloudflare-attack-pairs-${interval}${cloudflareProductSuffix(product)}.json`
const CLOUDFLARE_TIMESERIES_FILE = (interval, product = 'all') =>
  `public/data/cloudflare-timeseries-${interval}${cloudflareProductSuffix(product)}.json`
// Aggregation resolution the timeseries endpoint is asked for, per
// interval: 1h→15m, 6h→15m, 24h→1h, 7d→1d.
export const CLOUDFLARE_TIMESERIES_AGG_INTERVAL = {
  '1h': '15m',
  '6h': '15m',
  '24h': '1h',
  '7d': '1d',
}
const CLOUDFLARE_TIMESERIES_AGG_INTERVAL_MS = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
}
// The matrix runs 64 cells per run (4 intervals × 8 products × 2 kinds)
// with at most 6 requests in flight and a 10-minute total budget, so a
// run stays well inside the 15-minute workflow cadence even if requests
// are slow (each individual request still has its own 20s timeout).
export const CLOUDFLARE_MAX_IN_FLIGHT = 6
export const CLOUDFLARE_RUN_BUDGET_MS = 10 * 60 * 1000
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const THREATFOX_FILE = 'public/data/threatfox-snapshot.json'
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const CLOUDFLARE_RADAR_URL = 'https://api.cloudflare.com/client/v4/radar/attacks/layer7/top/attacks'
const CLOUDFLARE_RADAR_TIMESERIES_URL = 'https://api.cloudflare.com/client/v4/radar/attacks/layer7/timeseries'
const ISC_API = 'https://isc.sans.edu/api'
const NVD_API_KEY = process.env.NVD_API_KEY || ''
const CLOUDFLARE_RADAR_API_TOKEN = process.env.CLOUDFLARE_RADAR_API_TOKEN || ''
const USER_AGENT = 'OfflineTheoryThreatIntel/1.0 (+https://offlinetheory.github.io/; contact offlinetheory@proton.me)'
const THREATFOX_ENABLED = process.env.ENABLE_THREATFOX === 'true'
const FETCH_TIMEOUT_MS = 20_000
const DAY_MS = 24 * 60 * 60 * 1000

const SOURCES = {
  dshield: {
    name: 'SANS Internet Storm Center / DShield',
    url: 'https://isc.sans.edu/api/',
    attribution: 'SANS Technology Institute / Internet Storm Center (DShield)',
    license: 'Commercial use is permitted with attribution; do not resell. See the provider’s published license terms.',
  },
  threatfox: {
    name: 'abuse.ch ThreatFox',
    url: 'https://threatfox.abuse.ch/api/',
    attribution: 'abuse.ch ThreatFox',
    license: 'Disabled by default; commercial users should confirm eligibility or obtain the appropriate subscription. Auth-Key required.',
  },
  nvd: {
    name: 'NIST National Vulnerability Database',
    url: 'https://nvd.nist.gov/developers',
    attribution: 'NIST National Vulnerability Database (NVD)',
    license: 'Public NVD data; NIST does not endorse products or services.',
  },
  cisa_kev: {
    name: 'CISA Known Exploited Vulnerabilities',
    url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    attribution: 'CISA Known Exploited Vulnerabilities catalog',
    license: 'U.S. government work; source attribution provided.',
  },
  cloudflare_radar: {
    name: 'Cloudflare Radar',
    url: CLOUDFLARE_RADAR_URL,
    attribution: 'Cloudflare Radar — Aggregated Layer 7 attack intelligence.',
    license: 'Cloudflare Radar aggregated attack data; attribution provided.',
  },
  recent_breaches: {
    name: 'Recent Breaches',
    url: 'https://recentbreaches.com/developers',
    attribution: 'Recent Breaches',
    license: 'Disabled pending permission for this site’s intended use.',
  },
}

function readJsonAt(root, file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function writeJsonAt(root, file, value) {
  const fullPath = path.join(root, file)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`)
}

function readJson(file) {
  return readJsonAt(ROOT, file)
}

function writeJson(file, value) {
  writeJsonAt(ROOT, file, value)
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const normalized = value
    .trim()
    .replace(/ UTC$/i, 'Z')
    .replace(/^(\d{4}-\d{2}-\d{2})$/, '$1T00:00:00Z')
    .replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/, '$1Z')
    .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})Z$/, '$1T$2Z')
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function suppliedNumber(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeEvent({
  provider,
  providerId,
  category,
  firstObservedAt = null,
  lastObservedAt = null,
  title,
  summary = '',
  indicator = null,
  country = null,
  countryCode = null,
  latitude = null,
  longitude = null,
  sourceUrl,
  details = {},
}) {
  if (!provider || !providerId || !category || !title || !sourceUrl) {
    throw new TypeError('Threat event requires provider, providerId, category, title, and sourceUrl')
  }
  return {
    id: `${provider}:${providerId}`,
    provider,
    category,
    firstObservedAt: parseTimestamp(firstObservedAt),
    lastObservedAt: parseTimestamp(lastObservedAt),
    title: String(title),
    summary: String(summary || ''),
    indicator: indicator == null ? null : String(indicator),
    location: {
      country: country || null,
      countryCode: countryCode || null,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
    },
    sourceUrl,
    details,
  }
}

function providerState(key, status, fetchedAt, extra = {}) {
  return {
    ...SOURCES[key],
    status,
    fetchedAt: fetchedAt || null,
    ...extra,
  }
}

async function readJsonResponse(response, label) {
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status}: ${body.slice(0, 500)}`)
  }
  try {
    return JSON.parse(body)
  } catch (error) {
    throw new Error(`${label}: invalid JSON response: ${error.message}; body: ${body.slice(0, 500)}`)
  }
}

async function fetchJson(url, { headers = {}, method = 'GET', body, timeout = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      method,
      body,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...headers,
      },
    })
    return await readJsonResponse(response, new URL(url).pathname)
  } finally {
    clearTimeout(timer)
  }
}

async function fetchCloudflareRadar(url, { headers = {}, timeout = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...headers,
      },
    })
    let body
    try {
      body = JSON.parse(await response.text())
    } catch {
      throw new Error(`Cloudflare Radar HTTP ${response.status}: invalid JSON response`)
    }
    return { httpStatus: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}

function validCloudflareDateRange(meta) {
  return Array.isArray(meta?.dateRange) &&
    meta.dateRange.length > 0 &&
    meta.dateRange.every((range) => {
      if (!range || typeof range !== 'object') return false
      const startTime = parseTimestamp(range.startTime)
      const endTime = parseTimestamp(range.endTime)
      return startTime !== null && endTime !== null && startTime <= endTime
    })
}

export function normalizeCloudflareRadarResponse(response) {
  if (response?.success !== true || !response.result || typeof response.result !== 'object') {
    const errors = Array.isArray(response?.errors)
      ? response.errors.map((error) => [error?.code, error?.message].filter(Boolean).join(': ')).filter(Boolean)
      : []
    throw new Error(
      `Cloudflare Radar returned success=${String(response?.success)}${errors.length ? `; errors: ${errors.join('; ')}` : '; unexpected response structure'}`,
    )
  }
  const meta = response.result.meta
  const validDateRange = validCloudflareDateRange(meta)
  const validUnits = Array.isArray(meta?.units) &&
    meta.units.every((unit) =>
      unit &&
      typeof unit === 'object' &&
      typeof unit.name === 'string' &&
      unit.name.trim() !== '' &&
      Object.hasOwn(unit, 'value'),
    )
  if (
    !meta ||
    typeof meta.lastUpdated !== 'string' ||
    !parseTimestamp(meta.lastUpdated) ||
    !validDateRange ||
    !validUnits ||
    typeof meta.normalization !== 'string' ||
    meta.normalization.toUpperCase() !== 'PERCENTAGE'
  ) {
    throw new Error('Cloudflare Radar response is missing valid upstream metadata')
  }
  const rows = response.result.top_0
  if (!Array.isArray(rows) || rows.length > 50) {
    throw new Error('Cloudflare Radar response is missing the expected top_0 pair list')
  }
  const pairs = rows.map((row, index) => {
    const value = suppliedNumber(row?.value)
    if (
      !row ||
      typeof row !== 'object' ||
      !/^[A-Z]{2}$/.test(row?.originCountryAlpha2 || '') ||
      typeof row.originCountryName !== 'string' ||
      row.originCountryName.trim() === '' ||
      !/^[A-Z]{2}$/.test(row?.targetCountryAlpha2 || '') ||
      typeof row.targetCountryName !== 'string' ||
      row.targetCountryName.trim() === '' ||
      value === null ||
      value < 0 ||
      value > 100
    ) {
      throw new Error(`Cloudflare Radar top_0 row ${index} has invalid country or percentage data`)
    }
    return {
      originCountryAlpha2: row.originCountryAlpha2,
      originCountryName: row.originCountryName,
      targetCountryAlpha2: row.targetCountryAlpha2,
      targetCountryName: row.targetCountryName,
      value,
    }
  })
  return {
    meta: {
      lastUpdated: meta.lastUpdated,
      dateRange: meta.dateRange,
      units: meta.units,
      normalization: meta.normalization,
    },
    pairs,
  }
}

// Structural validation for the timeseries endpoint
// (GET /radar/attacks/layer7/timeseries): result.meta carries the
// aggregation resolution, window and freshness, and result.serie_0
// carries the points. No normalization is requested, so meta.normalization
// is passed through as returned (or null when absent) rather than checked
// against a value. Semantic checks (window match, aggInterval match,
// timestamp/value shape, point count) live in the validate functions
// below; this function only establishes the structure they run on.
export function normalizeCloudflareRadarTimeseriesResponse(response) {
  if (response?.success !== true || !response.result || typeof response.result !== 'object') {
    const errors = Array.isArray(response?.errors)
      ? response.errors.map((error) => [error?.code, error?.message].filter(Boolean).join(': ')).filter(Boolean)
      : []
    throw new Error(
      `Cloudflare Radar returned success=${String(response?.success)}${errors.length ? `; errors: ${errors.join('; ')}` : '; unexpected response structure'}`,
    )
  }
  const meta = response.result.meta
  if (
    !meta ||
    typeof meta !== 'object' ||
    typeof meta.lastUpdated !== 'string' ||
    !parseTimestamp(meta.lastUpdated) ||
    !validCloudflareDateRange(meta) ||
    typeof meta.aggInterval !== 'string' ||
    meta.aggInterval.trim() === '' ||
    (meta.normalization !== undefined && typeof meta.normalization !== 'string') ||
    (meta.units !== undefined && !Array.isArray(meta.units))
  ) {
    throw new Error('Cloudflare Radar timeseries response is missing valid upstream metadata')
  }
  const serie = response.result.serie_0
  if (
    !serie ||
    typeof serie !== 'object' ||
    !Array.isArray(serie.timestamps) ||
    !Array.isArray(serie.values)
  ) {
    throw new Error('Cloudflare Radar timeseries response is missing the expected serie_0 timestamps/values')
  }
  return {
    meta: {
      aggInterval: meta.aggInterval,
      dateRange: meta.dateRange,
      lastUpdated: meta.lastUpdated,
      normalization: typeof meta.normalization === 'string' ? meta.normalization : null,
      units: Array.isArray(meta.units) ? meta.units : null,
    },
    serie: {
      timestamps: serie.timestamps,
      values: serie.values,
    },
  }
}

function cloudflareResponseDescription(httpStatus, response) {
  const errors = Array.isArray(response?.errors)
    ? response.errors
      .map((error) => [error?.code, error?.message].filter(Boolean).join(': '))
      .filter(Boolean)
      .map((error) => error.slice(0, 300))
    : []
  const responseKeys = response && typeof response === 'object' ? Object.keys(response) : []
  const resultKeys = response?.result && typeof response.result === 'object'
    ? Object.keys(response.result)
    : []
  return `Cloudflare Radar HTTP ${httpStatus}; success=${String(response?.success)}; errors=${errors.length ? errors.join('; ') : 'none'}; response keys=${responseKeys.join(',') || 'none'}; result keys=${resultKeys.join(',') || 'none'}`
}

function preserveCloudflareSnapshotIfUnchanged(current, previous) {
  if (!previous) return current
  const comparable = (snapshot) => JSON.stringify({
    provider: {
      status: snapshot.provider?.status,
      lastUpdated: snapshot.provider?.lastUpdated,
      error: snapshot.provider?.error,
    },
    meta: snapshot.meta,
    pairs: snapshot.pairs,
    serie: snapshot.serie,
    interval: snapshot.interval,
    product: snapshot.product,
    window: snapshot.window,
    aggInterval: snapshot.aggInterval,
    intervalStatus: snapshot.intervalStatus,
    intervalError: snapshot.intervalError,
    timeseriesStatus: snapshot.timeseriesStatus,
    timeseriesError: snapshot.timeseriesError,
    returnedWindow: snapshot.returnedWindow,
    windowShiftMinutes: snapshot.windowShiftMinutes,
  })
  if (comparable(current) !== comparable(previous)) return current
  return {
    ...current,
    generatedAt: previous.generatedAt,
    provider: {
      ...current.provider,
      fetchedAt: previous.provider?.fetchedAt || current.provider?.fetchedAt || null,
    },
  }
}

export function floorToNearest15Minutes(date) {
  const time = new Date(date).getTime()
  return new Date(Math.floor(time / FIFTEEN_MINUTES_MS) * FIFTEEN_MINUTES_MS)
}

// Cloudflare Radar window for one statistics interval.
// Verified against the official docs (developers.cloudflare.com, "Get top
// layer 7 attack pairs"): dateStart/dateEnd are an accepted alternative to
// dateRange, with no shorter maximum than dateRange (which allows up to
// 364d), so an explicit 7-day window is used here too, keeping all four
// intervals on the same exact-window mechanism instead of mixing dateRange
// ('7d', relative to request time) with explicit windows. The API floors
// each dateStart/dateEnd to the nearest 15 minutes before evaluation, so
// windows whose durations only match before alignment may be rejected:
// end is floored first and start is derived from that floored end, so both
// endpoints are already 15-minute aligned and the duration survives
// alignment exactly (every interval duration is a multiple of 15 minutes).
export function cloudflareIntervalWindow(interval, now = new Date()) {
  const durationMs = CLOUDFLARE_INTERVAL_DURATION_MS[interval]
  if (!durationMs) throw new Error(`Unknown Cloudflare interval: ${interval}`)
  const end = floorToNearest15Minutes(now)
  const start = new Date(end.getTime() - durationMs)
  return { dateStart: start.toISOString(), dateEnd: end.toISOString(), durationMs }
}

// Validates the window the API actually returned against the window that
// was requested. Returns null when the response matches, otherwise a
// human-readable reason. The API's returned dateRange end can lag the
// requested end (dataset freshness), so the end check allows a bounded lag
// — at least 1h, growing to 1/8 of the window for long windows — but the
// duration must match within one 15-minute alignment bucket, the end must
// never be in the future, and lastUpdated must parse and must not be after
// the requested end (lastUpdated is a dataset timestamp and may lag the
// window end, so it is only checked for parseability / not-in-future, not
// for falling inside the window). Any mismatch means the data is NOT for
// the requested interval and must never be substituted for it.
export function validateCloudflareIntervalMeta(meta, window) {
  if (!meta || typeof meta !== 'object') {
    return 'Cloudflare Radar response is missing meta'
  }
  const range = Array.isArray(meta.dateRange) ? meta.dateRange[0] : null
  const startTime = parseTimestamp(range?.startTime)
  const endTime = parseTimestamp(range?.endTime)
  if (!range || startTime === null || endTime === null) {
    return 'Cloudflare Radar response meta.dateRange is missing or unparseable'
  }
  const requestedStart = Date.parse(window.dateStart)
  const requestedEnd = Date.parse(window.dateEnd)
  const requestedDuration = requestedEnd - requestedStart
  const actualDuration = Date.parse(endTime) - Date.parse(startTime)
  if (Math.abs(actualDuration - requestedDuration) > FIFTEEN_MINUTES_MS) {
    return `Cloudflare Radar returned a ${actualDuration / 3600000}h window (${startTime}..${endTime}) instead of the requested ${requestedDuration / 3600000}h window (${window.dateStart}..${window.dateEnd})`
  }
  if (Date.parse(endTime) > requestedEnd + FIFTEEN_MINUTES_MS) {
    return `Cloudflare Radar returned dateRange endTime ${endTime} after the requested end ${window.dateEnd}`
  }
  const endLagTolerance = Math.max(60 * 60 * 1000, Math.floor(requestedDuration / 8))
  if (Date.parse(endTime) < requestedEnd - endLagTolerance) {
    return `Cloudflare Radar returned dateRange endTime ${endTime}, more than ${endLagTolerance / 3600000}h before the requested end ${window.dateEnd}`
  }
  const lastUpdated = parseTimestamp(meta.lastUpdated)
  if (lastUpdated === null) {
    return 'Cloudflare Radar response meta.lastUpdated is missing or unparseable'
  }
  if (Date.parse(lastUpdated) > requestedEnd + FIFTEEN_MINUTES_MS) {
    return `Cloudflare Radar returned lastUpdated ${lastUpdated} after the requested end ${window.dateEnd}`
  }
  return null
}

// Requested end minus the end the API actually returned, in minutes.
// Cloudflare returns the latest fully aggregated window, which can lag
// the requested window (round 1: 1h requested 21:30–22:30Z, returned
// 21:00–22:00Z = 30 min). The shift is recorded honestly on every file;
// it may be negative when the returned end is after the requested end.
export function cloudflareWindowShiftMinutes(window, meta) {
  const range = Array.isArray(meta?.dateRange) ? meta.dateRange[0] : null
  const endTime = parseTimestamp(range?.endTime)
  const requestedEnd = Date.parse(window?.dateEnd || '')
  if (endTime === null || !Number.isFinite(requestedEnd)) return null
  return Math.round((requestedEnd - Date.parse(endTime)) / 60000)
}

// Window fields carried forward when a cell goes stale/unavailable: the
// shift recorded at fetch time, not recomputed against a later request.
function previousCloudflareWindowFields(previous) {
  const returnedWindow = previous?.returnedWindow ?? previous?.meta?.dateRange?.[0] ?? null
  let windowShiftMinutes = Number.isFinite(previous?.windowShiftMinutes)
    ? previous.windowShiftMinutes
    : null
  if (windowShiftMinutes === null && previous?.meta && previous?.window) {
    windowShiftMinutes = cloudflareWindowShiftMinutes(previous.window, previous.meta)
  }
  return { returnedWindow, windowShiftMinutes }
}

// Validates a timeseries response's meta against the requested window and
// resolution. Returns null when it matches, otherwise a human-readable
// reason. Reuses the pairs window checks (duration within 15 min, bounded
// end lag, lastUpdated parseable and not in the future), then requires
// the API's aggInterval to match the requested one: when the API
// auto-selects a different resolution the actual value is named in the
// reason and the cell is marked stale/unavailable — a different
// resolution is never silently accepted as the requested one.
export function validateCloudflareTimeseriesMeta(meta, window, aggInterval) {
  const windowError = validateCloudflareIntervalMeta(meta, window)
  if (windowError) return windowError
  if (typeof meta?.aggInterval !== 'string' || meta.aggInterval.trim() === '') {
    return 'Cloudflare Radar timeseries response meta.aggInterval is missing or unparseable'
  }
  if (meta.aggInterval !== aggInterval) {
    return `Cloudflare Radar timeseries returned aggInterval ${meta.aggInterval} instead of the requested ${aggInterval}`
  }
  return null
}

// Validates a timeseries serie against the requested window and
// resolution. Returns null when it matches, otherwise a human-readable
// reason. Timestamps must be strictly increasing valid ISO strings,
// values must be numeric (the API returns them as strings) with exactly
// one value per timestamp, and the point count must be within ±1 of
// duration/aggInterval.
export function validateCloudflareTimeseriesSerie(serie, window, aggInterval) {
  if (!serie || typeof serie !== 'object') {
    return 'Cloudflare Radar timeseries response is missing serie_0'
  }
  const timestamps = serie.timestamps
  const values = serie.values
  if (!Array.isArray(timestamps) || !Array.isArray(values)) {
    return 'Cloudflare Radar timeseries serie timestamps/values are missing or not arrays'
  }
  if (timestamps.length !== values.length) {
    return `Cloudflare Radar timeseries has ${timestamps.length} timestamps but ${values.length} values`
  }
  let previousTime = null
  for (let index = 0; index < timestamps.length; index += 1) {
    const time = typeof timestamps[index] === 'string' ? Date.parse(timestamps[index]) : NaN
    if (!Number.isFinite(time)) {
      return `Cloudflare Radar timeseries timestamp ${index} is not a valid ISO string: ${String(timestamps[index]).slice(0, 100)}`
    }
    if (previousTime !== null && time <= previousTime) {
      return `Cloudflare Radar timeseries timestamps are not strictly increasing at index ${index}`
    }
    previousTime = time
    if (suppliedNumber(values[index]) === null) {
      return `Cloudflare Radar timeseries value ${index} is not numeric: ${String(values[index]).slice(0, 100)}`
    }
  }
  const aggMs = CLOUDFLARE_TIMESERIES_AGG_INTERVAL_MS[aggInterval]
  if (!aggMs) {
    return `Unknown Cloudflare timeseries aggInterval: ${aggInterval}`
  }
  const durationMs = Date.parse(window.dateEnd) - Date.parse(window.dateStart)
  const expected = durationMs / aggMs
  if (Math.abs(timestamps.length - expected) > 1) {
    return `Cloudflare Radar timeseries returned ${timestamps.length} points for a ${durationMs / 3600000}h window at ${aggInterval} (expected ${expected} ± 1)`
  }
  return null
}

function cloudflareRadarRequestUrl(kind, window, product, aggInterval) {
  const url = new URL(kind === 'timeseries' ? CLOUDFLARE_RADAR_TIMESERIES_URL : CLOUDFLARE_RADAR_URL)
  url.searchParams.set('dateStart', window.dateStart)
  url.searchParams.set('dateEnd', window.dateEnd)
  if (kind === 'pairs') {
    url.searchParams.set('limit', '50')
    url.searchParams.set('normalization', 'PERCENTAGE')
  } else {
    // No normalization is requested for timeseries: the values are used
    // exactly as returned, and meta.normalization is recorded faithfully
    // in the file (see normalizeCloudflareRadarTimeseriesResponse).
    url.searchParams.set('aggInterval', aggInterval)
  }
  url.searchParams.set('format', 'JSON')
  if (product !== 'all') url.searchParams.set('mitigationProduct', product)
  return url
}

// Stale/unavailable snapshot for one matrix cell. Preserves the previous
// file's data, meta and recorded window shift when there is cached data;
// otherwise reports empty data. Token-absent cells report
// not_configured but are never written to disk by main().
function cloudflareCellErrorSnapshot({ kind, interval, product, window, previous, error, token, checkedAt }) {
  const hasCachedData = kind === 'pairs'
    ? Boolean(previous?.meta && Array.isArray(previous.pairs))
    : Boolean(previous?.meta && previous?.serie && Array.isArray(previous.serie.timestamps))
  const providerStatus = !token ? 'not_configured' : hasCachedData ? 'stale' : 'offline'
  const { returnedWindow, windowShiftMinutes } = previousCloudflareWindowFields(previous)
  const base = {
    schemaVersion: 1,
    generatedAt: checkedAt,
    interval,
    product,
    window: { dateStart: window.dateStart, dateEnd: window.dateEnd },
    returnedWindow,
    windowShiftMinutes,
    provider: {
      ...SOURCES.cloudflare_radar,
      status: providerStatus,
      fetchedAt: previous?.provider?.fetchedAt || null,
      lastUpdated: previous?.meta?.lastUpdated || null,
      error: error.message,
      cacheIntervalMinutes: 15,
      rateLimit: 'Cloudflare Radar API access and limits depend on the token and account plan.',
    },
    meta: hasCachedData ? previous.meta : null,
  }
  if (kind === 'pairs') {
    return preserveCloudflareSnapshotIfUnchanged({
      ...base,
      intervalStatus: hasCachedData ? 'stale' : 'unavailable',
      intervalError: error.message,
      provider: { ...base.provider, pairCount: hasCachedData ? previous.pairs.length : 0 },
      pairs: hasCachedData ? previous.pairs : [],
    }, previous)
  }
  const pointCount = hasCachedData ? previous.serie.timestamps.length : 0
  return preserveCloudflareSnapshotIfUnchanged({
    ...base,
    aggInterval: CLOUDFLARE_TIMESERIES_AGG_INTERVAL[interval],
    timeseriesStatus: hasCachedData ? 'stale' : 'unavailable',
    timeseriesError: error.message,
    // The timeseries provider mirrors the pairs provider shape; the count
    // slot holds the number of points (also exposed as pointCount).
    provider: { ...base.provider, pairCount: pointCount, pointCount },
    serie: hasCachedData ? previous.serie : { timestamps: [], values: [] },
  }, previous)
}

// Fetches one matrix cell: one (interval × product × kind). `kind` is
// 'pairs' (top origin→target pairs, PERCENTAGE) or 'timeseries'
// (serie_0 points at the interval's aggInterval, no normalization
// requested). Any failure — fetch error, invalid response, window or
// resolution mismatch — returns a stale/unavailable snapshot for this
// cell only and never throws, so one bad cell cannot poison the run.
export async function collectCloudflareRadarCell(
  interval,
  product,
  kind,
  previous,
  {
    token = CLOUDFLARE_RADAR_API_TOKEN,
    request = fetchCloudflareRadar,
    now = () => new Date(),
  } = {},
) {
  const safeProduct = normalizeCloudflareProduct(product)
  const window = cloudflareIntervalWindow(interval, now())
  const checkedAt = now().toISOString()
  const aggInterval = kind === 'timeseries' ? CLOUDFLARE_TIMESERIES_AGG_INTERVAL[interval] : null
  const url = cloudflareRadarRequestUrl(kind, window, safeProduct, aggInterval)
  try {
    if (!token) throw new Error('CLOUDFLARE_RADAR_API_TOKEN is not configured')
    const response = await request(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const httpStatus = Number.isInteger(response?.httpStatus) ? response.httpStatus : 200
    const payload = Number.isInteger(response?.httpStatus) ? response.body : response
    if (httpStatus < 200 || httpStatus >= 300) {
      throw new Error(cloudflareResponseDescription(httpStatus, payload))
    }
    let normalized
    try {
      normalized = kind === 'timeseries'
        ? normalizeCloudflareRadarTimeseriesResponse(payload)
        : normalizeCloudflareRadarResponse(payload)
    } catch (error) {
      throw new Error(`${cloudflareResponseDescription(httpStatus, payload)}; ${error.message}`)
    }
    const metaError = kind === 'timeseries'
      ? validateCloudflareTimeseriesMeta(normalized.meta, window, aggInterval)
      : validateCloudflareIntervalMeta(normalized.meta, window)
    if (metaError) {
      throw new Error(
        `${metaError}; requested ${window.dateStart}..${window.dateEnd}; ` +
        `returned dateRange ${JSON.stringify(normalized.meta.dateRange)} lastUpdated ${normalized.meta.lastUpdated}`,
      )
    }
    if (kind === 'timeseries') {
      const serieError = validateCloudflareTimeseriesSerie(normalized.serie, window, aggInterval)
      if (serieError) throw new Error(serieError)
    }
    const fetchedAt = now().toISOString()
    const base = {
      schemaVersion: 1,
      generatedAt: fetchedAt,
      interval,
      product: safeProduct,
      window: { dateStart: window.dateStart, dateEnd: window.dateEnd },
      returnedWindow: normalized.meta.dateRange[0],
      windowShiftMinutes: cloudflareWindowShiftMinutes(window, normalized.meta),
      provider: {
        ...SOURCES.cloudflare_radar,
        status: 'live',
        fetchedAt,
        lastUpdated: normalized.meta.lastUpdated,
        error: null,
        cacheIntervalMinutes: 15,
        rateLimit: 'Cloudflare Radar API access and limits depend on the token and account plan.',
      },
      meta: normalized.meta,
    }
    if (kind === 'pairs') {
      return preserveCloudflareSnapshotIfUnchanged({
        ...base,
        intervalStatus: 'live',
        intervalError: null,
        provider: { ...base.provider, pairCount: normalized.pairs.length },
        pairs: normalized.pairs,
      }, previous)
    }
    const pointCount = normalized.serie.timestamps.length
    return preserveCloudflareSnapshotIfUnchanged({
      ...base,
      aggInterval,
      timeseriesStatus: 'live',
      timeseriesError: null,
      // The timeseries provider mirrors the pairs provider shape; the
      // count slot holds the number of points (also exposed as pointCount).
      provider: { ...base.provider, pairCount: pointCount, pointCount },
      serie: normalized.serie,
    }, previous)
  } catch (error) {
    return cloudflareCellErrorSnapshot({
      kind, interval, product: safeProduct, window, previous, error, token, checkedAt,
    })
  }
}

export async function collectCloudflareRadarInterval(
  interval,
  previous,
  {
    token = CLOUDFLARE_RADAR_API_TOKEN,
    request = fetchCloudflareRadar,
    now = () => new Date(),
    product = 'all',
  } = {},
) {
  return collectCloudflareRadarCell(interval, product, 'pairs', previous, { token, request, now })
}

export async function collectCloudflareRadarTimeseries(
  interval,
  previous,
  {
    token = CLOUDFLARE_RADAR_API_TOKEN,
    request = fetchCloudflareRadar,
    now = () => new Date(),
    product = 'all',
  } = {},
) {
  return collectCloudflareRadarCell(interval, product, 'timeseries', previous, { token, request, now })
}

// Fetches every statistics interval independently: one interval failing
// (fetch error, invalid response, or window mismatch) never poisons the
// others. Returns { '1h': snapshot, '6h': snapshot, '24h': snapshot,
// '7d': snapshot } of the unfiltered ("all") pairs.
export async function collectCloudflareRadarIntervals(previousByInterval = {}, options = {}) {
  const results = {}
  for (const interval of CLOUDFLARE_INTERVALS) {
    results[interval] = await collectCloudflareRadarInterval(
      interval,
      (previousByInterval || {})[interval] || null,
      options,
    )
  }
  return results
}

// Backward-compatible single-interval (24h) collector, used by the
// threat-intel snapshot's Cloudflare provider section.
export async function collectCloudflareRadar(previous, options = {}) {
  return collectCloudflareRadarInterval('24h', previous, options)
}

// Fetches the full matrix: 4 intervals × 8 products ('all' + 7
// mitigationProduct values) × 2 kinds (pairs + timeseries) = 64 cells
// per run. Cells run with at most CLOUDFLARE_MAX_IN_FLIGHT requests in
// flight; one cell failing marks only that cell stale/unavailable and
// keeps its previous file. Once the per-run budget
// (CLOUDFLARE_RUN_BUDGET_MS) is spent, cells not yet started are
// reported as budget-exceeded (preserving previous data) instead of
// starting new requests, so the run stays inside the 15-minute cadence.
// Returns { pairs: { interval: { product: snapshot } },
//           timeseries: { interval: { product: snapshot } } }.
// `previous` uses the same shape; `options` takes the usual
// { token, request, now } plus runBudgetMs to override the budget.
export async function collectCloudflareRadarMatrix(previous = {}, options = {}) {
  const pairs = {}
  const timeseries = {}
  for (const interval of CLOUDFLARE_INTERVALS) {
    pairs[interval] = {}
    timeseries[interval] = {}
  }
  const prevPairs = previous?.pairs || {}
  const prevTimeseries = previous?.timeseries || {}
  const tasks = []
  for (const interval of CLOUDFLARE_INTERVALS) {
    for (const product of CLOUDFLARE_PRODUCTS) {
      tasks.push({ kind: 'pairs', interval, product })
      tasks.push({ kind: 'timeseries', interval, product })
    }
  }
  const runBudgetMs = options.runBudgetMs ?? CLOUDFLARE_RUN_BUDGET_MS
  const deadline = Date.now() + runBudgetMs
  const nowFn = options.now || (() => new Date())
  let next = 0
  const budgetSnapshot = (task, previousCell) => {
    const window = cloudflareIntervalWindow(task.interval, nowFn())
    return cloudflareCellErrorSnapshot({
      kind: task.kind,
      interval: task.interval,
      product: task.product,
      window,
      previous: previousCell,
      error: new Error(`Cloudflare Radar run budget of ${Math.round(runBudgetMs / 60000)} minutes exceeded before this cell was requested`),
      token: options.token ?? CLOUDFLARE_RADAR_API_TOKEN,
      checkedAt: new Date().toISOString(),
    })
  }
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++]
      const store = task.kind === 'pairs' ? pairs : timeseries
      const previousCell = task.kind === 'pairs'
        ? prevPairs[task.interval]?.[task.product] ?? null
        : prevTimeseries[task.interval]?.[task.product] ?? null
      if (Date.now() >= deadline) {
        store[task.interval][task.product] = budgetSnapshot(task, previousCell)
        continue
      }
      try {
        store[task.interval][task.product] = await collectCloudflareRadarCell(
          task.interval, task.product, task.kind, previousCell, options,
        )
      } catch (error) {
        // Defensive: the cell collector already isolates per-cell
        // failures; this guards against an unexpected throw killing the
        // run or leaving a cell unfilled.
        store[task.interval][task.product] = cloudflareCellErrorSnapshot({
          kind: task.kind,
          interval: task.interval,
          product: task.product,
          window: cloudflareIntervalWindow(task.interval, nowFn()),
          previous: previousCell,
          error,
          token: options.token ?? CLOUDFLARE_RADAR_API_TOKEN,
          checkedAt: new Date().toISOString(),
        })
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CLOUDFLARE_MAX_IN_FLIGHT, tasks.length) }, () => worker()),
  )
  return { pairs, timeseries }
}

export function cloudflareHistoryFilename(generatedAt) {
  return `${String(generatedAt).replace(/[-:.]/g, '')}.json`
}

// History path segment for a product: the lowercase file suffix
// ('ddos', 'waf', ...), or 'all' for the unfiltered aggregate.
function cloudflareHistoryProductSegment(product) {
  const safeProduct = normalizeCloudflareProduct(product)
  return safeProduct === 'all' ? 'all' : CLOUDFLARE_PRODUCT_SUFFIXES[safeProduct]
}

export function cloudflareHistoryPath(interval, product, generatedAt) {
  return `${CLOUDFLARE_HISTORY_DIR}/${interval}/${cloudflareHistoryProductSegment(product)}/${cloudflareHistoryFilename(generatedAt)}`
}

export function cloudflareTimeseriesHistoryPath(interval, product, generatedAt) {
  return `${CLOUDFLARE_TIMESERIES_HISTORY_DIR}/${interval}/${cloudflareHistoryProductSegment(product)}/${cloudflareHistoryFilename(generatedAt)}`
}

// Pure manifest merge (v2): combines the previous manifest with new
// entries, dedupes by path, sorts oldest→newest per (kind, interval,
// product), and keeps only the newest entries per cap — pairs "all"
// `retentionPerInterval` (96), pairs per-product `retentionPairsProduct`
// (24), timeseries "all" `retentionTimeseriesAll` (96), timeseries
// per-product `retentionTimeseriesProduct` (24).
// Returns { schemaVersion: 2, generatedAt,
//   intervals: { interval: [pairs "all" entries] },   // v1 compat key
//   pairs: { interval: { product: [entries] } },
//   timeseries: { interval: { product: [entries] } } }.
// Pairs entries are { generatedAt, path, pairCount, lastUpdated };
// timeseries entries are { generatedAt, path, pointCount, lastUpdated,
// aggInterval }; `path` is site-relative (fetchable as
// `${BASE_URL}${path}`). Entries without a kind are treated as pairs and
// without a product as 'all', so v1 callers keep working. V1 manifests
// (intervals only) seed pairs "all". History written before products
// existed lives directly under history/cloudflare/<interval>/ (no product
// segment); those files are never deleted by the builder and their
// manifest entries survive as long as they exist on disk and fit the cap.
export function buildCloudflareHistoryManifest(
  previousManifest,
  entries,
  {
    retentionPerInterval = CLOUDFLARE_HISTORY_RETENTION.pairsAll,
    retentionPairsProduct = CLOUDFLARE_HISTORY_RETENTION.pairsProduct,
    retentionTimeseriesAll = CLOUDFLARE_HISTORY_RETENTION.timeseriesAll,
    retentionTimeseriesProduct = CLOUDFLARE_HISTORY_RETENTION.timeseriesProduct,
    generatedAt = new Date().toISOString(),
  } = {},
) {
  const capFor = (kind, product) => kind === 'pairs'
    ? (product === 'all' ? retentionPerInterval : retentionPairsProduct)
    : (product === 'all' ? retentionTimeseriesAll : retentionTimeseriesProduct)
  const kindOf = (entry) => entry.kind
    || (entry.pointCount !== undefined || entry.aggInterval !== undefined ? 'timeseries' : 'pairs')
  const productOf = (entry) => normalizeCloudflareProduct(entry.product || 'all')
  const previousEntriesFor = (kind, interval, product) => {
    const out = []
    if (kind === 'pairs') {
      const nested = previousManifest?.pairs?.[interval]?.[product]
      if (Array.isArray(nested)) out.push(...nested)
      if (product === 'all') {
        const v1 = previousManifest?.intervals?.[interval]
        if (Array.isArray(v1)) out.push(...v1)
      }
    } else {
      const nested = previousManifest?.timeseries?.[interval]?.[product]
      if (Array.isArray(nested)) out.push(...nested)
    }
    return out
  }
  const buildSection = (kind) => {
    const section = {}
    for (const interval of CLOUDFLARE_INTERVALS) {
      section[interval] = {}
      for (const product of CLOUDFLARE_PRODUCTS) {
        const byPath = new Map()
        const addEntry = (entry) => {
          if (kind === 'pairs') {
            byPath.set(entry.path, {
              generatedAt: entry.generatedAt,
              path: entry.path,
              pairCount: entry.pairCount,
              lastUpdated: entry.lastUpdated ?? null,
            })
          } else {
            byPath.set(entry.path, {
              generatedAt: entry.generatedAt,
              path: entry.path,
              pointCount: entry.pointCount,
              lastUpdated: entry.lastUpdated ?? null,
              aggInterval: entry.aggInterval,
            })
          }
        }
        for (const entry of previousEntriesFor(kind, interval, product)) addEntry(entry)
        for (const entry of entries.filter(
          (item) => kindOf(item) === kind && item.interval === interval && productOf(item) === product,
        )) addEntry(entry)
        section[interval][product] = [...byPath.values()]
          .sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt))
          .slice(-capFor(kind, product))
      }
    }
    return section
  }
  const pairs = buildSection('pairs')
  const timeseries = buildSection('timeseries')
  const intervals = {}
  for (const interval of CLOUDFLARE_INTERVALS) intervals[interval] = pairs[interval]['all']
  return { schemaVersion: 2, generatedAt, intervals, pairs, timeseries }
}

function pruneHistoryDir(root, dirRel, cap, pruned) {
  const dir = path.join(root, dirRel)
  let files = []
  try {
    files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  // Filenames are compact ISO timestamps, so they sort chronologically;
  // the oldest files beyond the cap are deleted.
  const excess = files.slice(0, Math.max(0, files.length - cap))
  for (const name of excess) {
    fs.unlinkSync(path.join(dir, name))
    pruned.push(`${dirRel}/${name}`)
  }
}

// Writes per-(interval × product) pairs and timeseries files, the legacy
// 24h pairs copy, history snapshots and the v2 manifest. Only the history
// snapshots of cells that are live in this run are added (a stale cell
// re-uses previous data, so re-stamping it as new history would
// misrepresent when that data was fetched). Pruning deletes only files
// under public/data/history/cloudflare*/<interval>/<product>/ — never the
// pre-product legacy history files and never anything outside history.
// Callers must NOT call this when the Cloudflare token is absent: a
// token-less run must leave all pairs, timeseries, history and manifest
// files untouched instead of overwriting them with not_configured data.
// `matrix` is { pairs: { interval: { product: snapshot } },
//               timeseries: { interval: { product: snapshot } } }.
export function writeCloudflareOutputs(
  matrix,
  {
    root = ROOT,
    now = () => new Date(),
    retentionPerInterval = CLOUDFLARE_HISTORY_RETENTION.pairsAll,
    retentionPairsProduct = CLOUDFLARE_HISTORY_RETENTION.pairsProduct,
    retentionTimeseriesAll = CLOUDFLARE_HISTORY_RETENTION.timeseriesAll,
    retentionTimeseriesProduct = CLOUDFLARE_HISTORY_RETENTION.timeseriesProduct,
  } = {},
) {
  const written = []
  const historyEntries = []
  const timeseriesHistoryEntries = []
  const pruned = []
  const pairs = matrix?.pairs || {}
  const timeseries = matrix?.timeseries || {}
  for (const interval of CLOUDFLARE_INTERVALS) {
    for (const product of CLOUDFLARE_PRODUCTS) {
      const snapshot = pairs[interval]?.[product]
      if (!snapshot) continue
      const file = CLOUDFLARE_INTERVAL_FILE(interval, product)
      writeJsonAt(root, file, snapshot)
      written.push(file)
      if (interval === '24h' && product === 'all') {
        writeJsonAt(root, CLOUDFLARE_FILE, snapshot)
        written.push(CLOUDFLARE_FILE)
      }
      if (snapshot.intervalStatus === 'live') {
        const historyFile = cloudflareHistoryPath(interval, product, snapshot.generatedAt)
        writeJsonAt(root, historyFile, snapshot)
        historyEntries.push({
          kind: 'pairs',
          interval,
          product,
          generatedAt: snapshot.generatedAt,
          path: historyFile.replace(/^public\//, ''),
          pairCount: snapshot.pairs.length,
          lastUpdated: snapshot.meta?.lastUpdated ?? null,
        })
      }
    }
  }
  for (const interval of CLOUDFLARE_INTERVALS) {
    for (const product of CLOUDFLARE_PRODUCTS) {
      const snapshot = timeseries[interval]?.[product]
      if (!snapshot) continue
      const file = CLOUDFLARE_TIMESERIES_FILE(interval, product)
      writeJsonAt(root, file, snapshot)
      written.push(file)
      if (snapshot.timeseriesStatus === 'live') {
        const historyFile = cloudflareTimeseriesHistoryPath(interval, product, snapshot.generatedAt)
        writeJsonAt(root, historyFile, snapshot)
        timeseriesHistoryEntries.push({
          kind: 'timeseries',
          interval,
          product,
          generatedAt: snapshot.generatedAt,
          path: historyFile.replace(/^public\//, ''),
          pointCount: snapshot.serie.timestamps.length,
          lastUpdated: snapshot.meta?.lastUpdated ?? null,
          aggInterval: snapshot.aggInterval,
        })
      }
    }
  }
  for (const interval of CLOUDFLARE_INTERVALS) {
    for (const product of CLOUDFLARE_PRODUCTS) {
      const cap = product === 'all' ? retentionPerInterval : retentionPairsProduct
      pruneHistoryDir(root, `${CLOUDFLARE_HISTORY_DIR}/${interval}/${cloudflareHistoryProductSegment(product)}`, cap, pruned)
    }
  }
  for (const interval of CLOUDFLARE_INTERVALS) {
    for (const product of CLOUDFLARE_PRODUCTS) {
      const cap = product === 'all' ? retentionTimeseriesAll : retentionTimeseriesProduct
      pruneHistoryDir(root, `${CLOUDFLARE_TIMESERIES_HISTORY_DIR}/${interval}/${cloudflareHistoryProductSegment(product)}`, cap, pruned)
    }
  }
  const previousManifest = readJsonAt(root, CLOUDFLARE_HISTORY_MANIFEST_FILE)
  const manifest = buildCloudflareHistoryManifest(
    previousManifest,
    [...historyEntries, ...timeseriesHistoryEntries],
    {
      retentionPerInterval,
      retentionPairsProduct,
      retentionTimeseriesAll,
      retentionTimeseriesProduct,
      generatedAt: now().toISOString(),
    },
  )
  // Drop manifest entries whose file no longer exists (e.g. just pruned).
  const fileExists = (entry) => fs.existsSync(path.join(root, 'public', entry.path))
  for (const interval of CLOUDFLARE_INTERVALS) {
    for (const product of CLOUDFLARE_PRODUCTS) {
      manifest.pairs[interval][product] = manifest.pairs[interval][product].filter(fileExists)
      manifest.timeseries[interval][product] = manifest.timeseries[interval][product].filter(fileExists)
    }
    manifest.intervals[interval] = manifest.pairs[interval]['all']
  }
  writeJsonAt(root, CLOUDFLARE_HISTORY_MANIFEST_FILE, manifest)
  return { written, historyEntries, timeseriesHistoryEntries, manifest, pruned }
}

// Legacy wrapper: accepts the old { interval: pairsSnapshot } shape
// (unfiltered "all" pairs only) and writes it through the matrix writer.
export function writeCloudflareIntervalOutputs(results, options = {}) {
  if (results && (results.pairs || results.timeseries)) {
    return writeCloudflareOutputs(results, options)
  }
  const pairs = {}
  for (const interval of CLOUDFLARE_INTERVALS) {
    if (results?.[interval]) pairs[interval] = { all: results[interval] }
  }
  return writeCloudflareOutputs({ pairs, timeseries: {} }, options)
}

async function fetchDshieldJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let response
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    })
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 429) {
    const body = await response.text()
    const retryAfter = response.headers.get('retry-after')
    const asSeconds = Number(retryAfter)
    const asDate = Date.parse(retryAfter || '')
    const serverWait = Number.isFinite(asSeconds) && asSeconds > 0
      ? asSeconds * 1000
      : Number.isFinite(asDate) ? Math.max(0, asDate - Date.now()) : 0
    const wait = Math.max(5 * 60 * 1000, serverWait)
    console.warn(`DShield rate limit received: HTTP 429: ${body.slice(0, 500)}; pausing requests for ${Math.ceil(wait / 1000)} seconds.`)
    await new Promise((resolve) => setTimeout(resolve, wait))
    return await fetchJson(url)
  }
  return await readJsonResponse(response, 'DShield API')
}

function asArray(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.topports)) return data.topports
  if (Array.isArray(data?.ports)) return data.ports
  if (Array.isArray(data?.data)) return data.data
  const indexedRows = Object.entries(data || {})
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, row]) => row)
  if (indexedRows.length > 0) return indexedRows
  return []
}

export function normalizeDshieldPorts(response) {
  const date = typeof response?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(response.date)
    ? response.date
    : null
  if (!date || !parseTimestamp(date)) throw new TypeError('DShield topports response is missing a valid data date')
  const rows = asArray(response)
  const topports = rows
    .map((row) => {
      const rank = Number(row?.rank)
      const port = Number(row?.targetport ?? row?.port ?? row?.portin ?? row?.number)
      const rawRecords = row?.records ?? row?.reports ?? row?.count
      const records = typeof rawRecords === 'number' || (typeof rawRecords === 'string' && rawRecords.trim() !== '')
        ? Number(rawRecords)
        : NaN
      if (!Number.isInteger(rank) || rank < 1 || !Number.isInteger(port) || port < 1 || port > 65535) return null
      if (!Number.isFinite(records) || records <= 0) return null
      const rawTargets = row?.targets
      const targets = typeof rawTargets === 'number' || (typeof rawTargets === 'string' && rawTargets.trim() !== '')
        ? Number(rawTargets)
        : NaN
      const rawSources = row?.sources
      const sources = typeof rawSources === 'number' || (typeof rawSources === 'string' && rawSources.trim() !== '')
        ? Number(rawSources)
        : NaN
      return {
        rank,
        targetport: port,
        records,
        targets: Number.isFinite(targets) && targets >= 0 ? targets : null,
        sources: Number.isFinite(sources) && sources >= 0 ? sources : null,
        date,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
  if (topports.length === 0) {
    throw new TypeError(`DShield topports response for ${date} contains no valid ranked ports with report counts`)
  }
  return { date, topports }
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

function dateDaysAgo(days) {
  return isoDaysAgo(days).slice(0, 10)
}

function cveUrl(cveId) {
  return `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cveId)}`
}

function nvdEvent(item) {
  const cve = item?.cve
  if (!cve?.id) return null
  const descriptions = (cve.descriptions || []).find((d) => d.lang === 'en')?.value || ''
  const weaknesses = (cve.weaknesses || [])
    .flatMap((weakness) => weakness.description || [])
    .filter((description) => description.lang === 'en')
    .map((description) => description.value)
  return normalizeEvent({
    provider: 'nvd',
    providerId: cve.id,
    category: 'vulnerability',
    firstObservedAt: cve.published,
    lastObservedAt: cve.lastModified,
    title: cve.id,
    summary: descriptions,
    sourceUrl: cveUrl(cve.id),
    details: { weaknesses, vulnStatus: cve.vulnStatus || null },
  })
}

function kevEvent(vulnerability) {
  if (!vulnerability?.cveID) return null
  return normalizeEvent({
    provider: 'cisa_kev',
    providerId: vulnerability.cveID,
    category: 'known_exploited_vulnerability',
    firstObservedAt: vulnerability.dateAdded,
    title: vulnerability.vulnerabilityName || vulnerability.cveID,
    summary: vulnerability.shortDescription || '',
    sourceUrl: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=${encodeURIComponent(vulnerability.cveID)}`,
    details: {
      vendor: vulnerability.vendorProject || null,
      product: vulnerability.product || null,
      dueDate: vulnerability.dueDate || null,
      knownRansomwareCampaignUse: vulnerability.knownRansomwareCampaignUse || null,
    },
  })
}

function threatFoxEvent(indicator) {
  const ioc = indicator?.ioc || indicator?.ip
  if (!ioc) return null
  const stablePart = indicator.id || `${ioc}:${indicator.firstSeen || ''}:${indicator.iocType || ''}`
  return normalizeEvent({
    provider: 'threatfox',
    providerId: stablePart,
    category: 'malicious_indicator',
    firstObservedAt: indicator.firstSeen,
    lastObservedAt: indicator.lastSeen,
    title: indicator.malware || indicator.threatType || ioc,
    summary: `${indicator.iocType || 'indicator'}${indicator.confidence == null ? '' : ` · confidence ${indicator.confidence}%`}`,
    indicator: ioc,
    country: indicator.country,
    countryCode: indicator.countryCode,
    latitude: indicator.lat,
    longitude: indicator.lon,
    sourceUrl: 'https://threatfox.abuse.ch/',
    details: {
      iocType: indicator.iocType || null,
      threatType: indicator.threatType || null,
      malware: indicator.malware || null,
      confidence: indicator.confidence ?? null,
      reference: indicator.reference || null,
    },
  })
}

export function dshieldSourceEvent(source) {
  if (!source?.ip) return null
  const reports = suppliedNumber(source.reports)
  if (!Number.isFinite(reports) || reports <= 0) return null
  return normalizeEvent({
    provider: 'dshield',
    providerId: source.ip,
    category: 'scanning',
    firstObservedAt: source.dataDate,
    lastObservedAt: source.dataDate,
    title: `Reported source ${source.ip}`,
    summary: `${reports.toLocaleString('en-US')} sensor reports`,
    indicator: source.ip,
    country: source.country,
    countryCode: source.countryCode,
    latitude: source.lat,
    longitude: source.lon,
    sourceUrl: source.dataDate
      ? `https://isc.sans.edu/api/topips/records/25/${source.dataDate}?json`
      : 'https://isc.sans.edu/api/topips/records/25?json',
    details: {
      reports,
      targets: suppliedNumber(source.targets),
      rank: Number.isInteger(suppliedNumber(source.rank)) && Number(source.rank) > 0
        ? Number(source.rank)
        : null,
    },
  })
}

function dshieldDailyEvent(day) {
  const reports = suppliedNumber(day?.records)
  if (!day?.date || reports == null || reports < 0) return null
  return normalizeEvent({
    provider: 'dshield',
    providerId: `daily:${day.date}`,
    category: 'daily_sensor_summary',
    firstObservedAt: day.date,
    lastObservedAt: day.date,
    title: `DShield daily reports · ${day.date}`,
    summary: `${reports.toLocaleString('en-US')} reports`,
    sourceUrl: `https://isc.sans.edu/api/dailysummary/${day.date}?json`,
    details: { reports },
  })
}

export function dshieldPortEvent(record) {
  const port = Number(record?.targetport ?? record?.port ?? record?.portin ?? record?.number)
  const reports = suppliedNumber(record?.records ?? record?.reports ?? record?.count)
  if (
    !Number.isInteger(port) || port < 1 || port > 65535 ||
    reports == null || reports <= 0 || !parseTimestamp(record?.date)
  ) return null
  return normalizeEvent({
    provider: 'dshield',
    providerId: `port:${port}`,
    category: 'scanned_service',
    firstObservedAt: record.date,
    lastObservedAt: record.date,
    title: `Port ${port} scanned`,
    summary: `${reports.toLocaleString('en-US')} reports`,
    sourceUrl: `https://isc.sans.edu/api/topports/records/10/${record.date || ''}?json`,
    details: {
      port,
      reports,
      rank: Number.isInteger(suppliedNumber(record.rank)) && Number(record.rank) > 0
        ? Number(record.rank)
        : null,
      targets: suppliedNumber(record.targets),
      sources: suppliedNumber(record.sources),
    },
  })
}

function previousValue(previous, key, fallback) {
  return previous?.dashboard?.[key] ?? fallback
}

async function collectNvd(previous) {
  const start = isoDaysAgo(7)
  const end = new Date().toISOString()
  const url = new URL(NVD_URL)
  url.searchParams.set('pubStartDate', start)
  url.searchParams.set('pubEndDate', end)
  url.searchParams.set('resultsPerPage', '2000')
  url.searchParams.set('startIndex', '0')
  try {
    const headers = NVD_API_KEY ? { apiKey: NVD_API_KEY } : {}
    const result = await fetchJson(url, { headers })
    if (!Array.isArray(result.vulnerabilities)) throw new Error('NVD returned an unexpected response shape')
    const rawVulnerabilities = [...result.vulnerabilities]
    for (let startIndex = rawVulnerabilities.length; startIndex < Number(result.totalResults || 0); startIndex += 2000) {
      const pageUrl = new URL(url)
      pageUrl.searchParams.set('startIndex', String(startIndex))
      const page = await fetchJson(pageUrl, { headers })
      if (!Array.isArray(page.vulnerabilities)) throw new Error(`NVD returned an unexpected response shape at startIndex ${startIndex}`)
      rawVulnerabilities.push(...page.vulnerabilities)
    }
    const vulnerabilities = rawVulnerabilities
      .filter((item) => item?.cve?.vulnStatus !== 'Rejected')
      .map((item) => {
        const cve = item.cve
        return {
          cve: {
            id: cve.id,
            published: parseTimestamp(cve.published),
            lastModified: parseTimestamp(cve.lastModified),
            vulnStatus: cve.vulnStatus || null,
            descriptions: (cve.descriptions || [])
              .filter((description) => description.lang === 'en')
              .slice(0, 1),
            weaknesses: (cve.weaknesses || []).map((weakness) => ({
              type: weakness.type || null,
              description: (weakness.description || []).filter(
                (description) => description.lang === 'en',
              ),
            })),
          },
        }
      })
    return {
      data: { totalResults: result.totalResults ?? vulnerabilities.length, vulnerabilities },
      status: 'live',
      fetchedAt: new Date().toISOString(),
      error: null,
    }
  } catch (error) {
    console.error(`NVD request failed: ${error.message}`)
    const cached = previousValue(previous, 'nvd', null)
    return {
      data: cached,
      status: cached ? 'stale' : 'unavailable',
      fetchedAt: previous?.providers?.nvd?.fetchedAt || null,
      error: error.message,
    }
  }
}

async function collectDshield(previous) {
  const old = previous?.dashboard || {}
  const startedAt = new Date().toISOString()
  const previousSubfeeds = previous?.providers?.dshield?.subfeeds || {}
  const fields = {
    sources: old.sources ?? [],
    ports: old.ports ?? [],
    infocon: old.infocon ?? null,
    dailySummary: old.dailySummary ?? [],
  }
  const subfeeds = { ...previousSubfeeds }
  const errors = []
  let successfulRefreshes = 0

  const rememberFailure = (key, error) => {
    const last = previousSubfeeds[key] || {}
    subfeeds[key] = {
      ...last,
      status: last.fetchedAt ? 'stale' : 'unavailable',
      error: error.message,
    }
    errors.push(`${key}: ${error.message}`)
  }

  const tasks = [
    async () => {
      const snap = readJson(SOURCES_FILE)
      if (!Array.isArray(snap?.sources)) throw new Error('DShield source snapshot has an unexpected shape')
      const sourceFetchedAt = snap.providers?.dshield?.fetchedAt || snap.generatedAt
      const snapshotFetchedAt = Date.parse(sourceFetchedAt || '')
      if (!Number.isFinite(snapshotFetchedAt)) throw new Error('DShield source snapshot has no valid generatedAt timestamp')
      const previousFetchedAt = Date.parse(previousSubfeeds.source_locations?.fetchedAt || '')
      const refreshed = Number.isFinite(previousFetchedAt)
        ? snapshotFetchedAt > previousFetchedAt
        : snapshotFetchedAt >= Date.parse(startedAt) - 10 * 60 * 1000
      if (refreshed || fields.sources.length === 0) {
        fields.sources = snap.sources
        subfeeds.source_locations = {
          status: refreshed ? 'live' : 'cached',
          fetchedAt: new Date(snapshotFetchedAt).toISOString(),
          dataDate: snap.providers?.dshield?.dataDate || snap.dataDate || null,
          error: null,
        }
        if (refreshed) successfulRefreshes += 1
        else errors.push('source locations were not refreshed in this run')
      } else {
        subfeeds.source_locations = {
          ...previousSubfeeds.source_locations,
          status: 'cached',
          error: 'source locations were not refreshed in this run',
        }
        errors.push('source locations were not refreshed in this run')
      }
    },
    async () => {
      const date = dateDaysAgo(1)
      const response = await fetchDshieldJson(`${ISC_API}/topports/records/10/${date}?json`)
      let ports
      try {
        ports = normalizeDshieldPorts(response)
      } catch (error) {
        throw new Error(`HTTP 200; ${error.message}; body: ${JSON.stringify(response).slice(0, 500)}`)
      }
      if (ports.date !== date) {
        throw new Error(`DShield topports returned data date ${ports.date} instead of requested ${date}`)
      }
      fields.ports = ports
      subfeeds.top_ports = {
        status: 'live',
        fetchedAt: new Date().toISOString(),
        dataDate: ports.date,
        error: null,
      }
      successfulRefreshes += 1
    },
    async () => {
      const infocon = await fetchDshieldJson(`${ISC_API}/infocon?json`)
      if (typeof infocon?.status !== 'string') throw new Error('DShield InfoCon returned an unexpected response shape')
      fields.infocon = infocon
      subfeeds.infocon = {
        status: 'live',
        fetchedAt: new Date().toISOString(),
        dataDate: null,
        error: null,
      }
      successfulRefreshes += 1
    },
    async () => {
      const dailySummary = []
      for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
        if (daysAgo !== 6) await new Promise((resolve) => setTimeout(resolve, 500))
        const date = dateDaysAgo(daysAgo)
        const result = await fetchDshieldJson(`${ISC_API}/dailysummary/${date}?json`)
        const row = Array.isArray(result) ? result[0] : result
        if (row && Number.isFinite(Number(row.records))) {
          dailySummary.push({ date, records: Number(row.records) })
        }
      }
      if (dailySummary.length === 0) throw new Error('DShield returned no valid daily summaries')
      fields.dailySummary = dailySummary
      subfeeds.daily_summary = {
        status: 'live',
        fetchedAt: new Date().toISOString(),
        dataDate: dailySummary.at(-1).date,
        error: null,
      }
      successfulRefreshes += 1
    },
  ]

  const taskKeys = ['source_locations', 'top_ports', 'infocon', 'daily_summary']
  for (const [index, task] of tasks.entries()) {
    try {
      await task()
    } catch (error) {
      rememberFailure(taskKeys[index], error)
      console.error(`DShield ${taskKeys[index]} refresh failed: ${error.message}`)
    }
  }

  const hasData = fields.sources.length > 0 ||
    asArray(fields.ports).length > 0 ||
    Boolean(fields.infocon?.status) ||
    fields.dailySummary.length > 0
  const status = successfulRefreshes === tasks.length
    ? 'live'
    : hasData
      ? successfulRefreshes > 0 ? 'partial' : 'stale'
      : 'unavailable'
  const successfulTimes = Object.values(subfeeds)
    .map((feed) => Date.parse(feed?.fetchedAt || ''))
    .filter(Number.isFinite)
  return {
    ...fields,
    status,
    fetchedAt: successfulTimes.length
      ? new Date(Math.max(...successfulTimes)).toISOString()
      : null,
    subfeeds,
    error: errors.length ? errors.join('; ') : null,
  }
}

function buildEvents(dashboard) {
  const events = []
  const add = (event) => {
    if (event) events.push(event)
  }
  for (const source of dashboard.sources || []) add(dshieldSourceEvent(source))
  for (const record of asArray(dashboard.ports)) add(dshieldPortEvent(record))
  for (const day of dashboard.dailySummary || []) add(dshieldDailyEvent(day))
  for (const item of dashboard.nvd?.vulnerabilities || []) add(nvdEvent(item))
  for (const vulnerability of dashboard.kev?.recent || []) add(kevEvent(vulnerability))
  for (const indicator of dashboard.threatfox || []) add(threatFoxEvent(indicator))
  return events
}

async function main() {
  const previous = readJson(OUT)
  const sourcesSnapshot = readJson(SOURCES_FILE)
  const previousCloudflare = { pairs: {}, timeseries: {} }
  for (const interval of CLOUDFLARE_INTERVALS) {
    previousCloudflare.pairs[interval] = {}
    previousCloudflare.timeseries[interval] = {}
    for (const product of CLOUDFLARE_PRODUCTS) {
      // Fall back to the legacy file for 24h "all" pairs on the first run
      // after this change, when per-interval files do not exist yet.
      previousCloudflare.pairs[interval][product] = readJson(CLOUDFLARE_INTERVAL_FILE(interval, product))
        || (interval === '24h' && product === 'all' ? readJson(CLOUDFLARE_FILE) : null)
      previousCloudflare.timeseries[interval][product] = readJson(CLOUDFLARE_TIMESERIES_FILE(interval, product))
    }
  }
  const [dshield, nvd, cloudflareMatrix] = await Promise.all([
    collectDshield(previous),
    collectNvd(previous),
    collectCloudflareRadarMatrix(previousCloudflare),
  ])
  const cloudflare = cloudflareMatrix.pairs['24h']['all']
  if (CLOUDFLARE_RADAR_API_TOKEN) {
    const history = writeCloudflareOutputs(cloudflareMatrix)
    const liveCount = (section, statusField) => CLOUDFLARE_INTERVALS
      .flatMap((interval) => CLOUDFLARE_PRODUCTS.map((product) => section[interval][product]))
      .filter((snapshot) => snapshot && snapshot[statusField] === 'live').length
    console.log(
      `Cloudflare Radar pairs live ${liveCount(cloudflareMatrix.pairs, 'intervalStatus')}/32; ` +
      `timeseries live ${liveCount(cloudflareMatrix.timeseries, 'timeseriesStatus')}/32; ` +
      `history snapshots added: ${history.historyEntries.length + history.timeseriesHistoryEntries.length}; pruned: ${history.pruned.length}.`,
    )
  } else {
    // Token absent (e.g. a local run): leave every per-interval,
    // per-product, timeseries, history and manifest Cloudflare file
    // untouched instead of overwriting them with not_configured data.
    // The in-memory 24h "all" result still reports not_configured in the
    // threat-intel snapshot below.
    console.log('Cloudflare Radar token not configured; leaving per-interval files unchanged.')
  }
  const cachedKev = readJson(KEV_FILE)
  const previousKevFetchedAt = previous?.providers?.cisa_kev?.fetchedAt || null
  const useCachedKev = cachedKev && (
    !previousKevFetchedAt || Date.parse(cachedKev.generatedAt) > Date.parse(previousKevFetchedAt)
  )
  const kevSnapshot = useCachedKev
    ? cachedKev
    : previousValue(previous, 'kev', null)
      ? { ...previous.dashboard.kev, generatedAt: previousKevFetchedAt }
      : cachedKev
  const kev = kevSnapshot
    ? Object.fromEntries(Object.entries(kevSnapshot).filter(([key]) => key !== 'generatedAt'))
    : null
  const cachedThreatFox = THREATFOX_ENABLED ? readJson(THREATFOX_FILE) : null
  const previousThreatFoxFetchedAt = previous?.providers?.threatfox?.fetchedAt || null
  const useCachedThreatFox = cachedThreatFox && (
    !previousThreatFoxFetchedAt ||
    Date.parse(cachedThreatFox.generatedAt) > Date.parse(previousThreatFoxFetchedAt)
  )
  const threatFox = !THREATFOX_ENABLED
    ? null
    : useCachedThreatFox
    ? cachedThreatFox
    : previous
      ? { generatedAt: previousThreatFoxFetchedAt, records: previousValue(previous, 'threatfox', []) }
      : cachedThreatFox
  const threatFoxConfigured = THREATFOX_ENABLED && Boolean(process.env.THREATFOX_AUTH_KEY)
  const threatFoxRecent = THREATFOX_ENABLED
    ? threatFox?.records || threatFox?.indicators || []
    : []
  const threatFoxLocations = new Map(
    (threatFox?.indicators || []).map((indicator) => [indicator.ip, indicator]),
  )
  const threatFoxRecords = threatFoxRecent.map((record) => {
    const ip = record.iocType === 'ip:port' || record.iocType === 'ip'
      ? String(record.ioc || '').split(':')[0]
      : null
    const location = ip ? threatFoxLocations.get(ip) : null
    return {
      ...record,
      firstSeen: parseTimestamp(record.firstSeen),
      lastSeen: parseTimestamp(record.lastSeen),
      ip,
      ...(location ? {
        country: location.country,
        countryCode: location.countryCode,
        lat: location.lat,
        lon: location.lon,
      } : {}),
    }
  })
  const kevStatus = kev
    ? (Date.parse(kevSnapshot.generatedAt) >= Date.now() - 25 * 60 * 1000 ? 'live' : 'stale')
    : 'unavailable'
  const threatFoxStatus = !THREATFOX_ENABLED
    ? 'disabled_license'
    : threatFoxConfigured
    ? threatFox?.status === 'ok' && Date.parse(threatFox.generatedAt) >= Date.now() - 25 * 60 * 1000
      ? 'live'
      : threatFoxRecent.length ? 'stale' : 'unavailable'
    : 'not_configured'

  const dashboard = {
    sources: dshield.sources,
    ports: dshield.ports,
    infocon: dshield.infocon,
    dailySummary: dshield.dailySummary,
    nvd: nvd.data,
    kev,
    threatfox: threatFoxRecords,
    recentBreaches: { index: null, geo: null, leaks: [] },
  }
  const events = buildEvents(dashboard)
  const liveProviderCount = [dshield.status, nvd.status, kevStatus, threatFoxStatus, cloudflare.provider.status]
    .filter((status) => status === 'live' || status === 'partial').length
  if (liveProviderCount === 0) {
    throw new Error('No provider returned fresh data; leaving the previous threat-intel snapshot unchanged.')
  }

  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    refreshIntervalMinutes: 15,
    providers: {
      dshield: providerState('dshield', dshield.status, dshield.fetchedAt, {
        error: dshield.error,
        cacheIntervalMinutes: 15,
        rateLimit: 'Best effort; on HTTP 429 the job pauses for 5 minutes before retrying.',
        subfeeds: dshield.subfeeds,
        sourceDataLastSuccessfulAt: dshield.subfeeds.source_locations?.fetchedAt || null,
        sourceDataDate: dshield.subfeeds.source_locations?.dataDate || null,
      }),
      threatfox: providerState('threatfox', threatFoxStatus, threatFox?.generatedAt || null, {
        error: threatFoxStatus === 'disabled_license'
          ? 'Not fetched or republished pending commercial-use eligibility or an appropriate subscription.'
          : threatFoxConfigured && threatFoxStatus !== 'live'
            ? 'No fresh ThreatFox response is available.'
            : null,
        cacheIntervalMinutes: 15,
        rateLimit: 'One get_iocs request for the previous 7 days per refresh; Auth-Key required.',
      }),
      nvd: providerState('nvd', nvd.status, nvd.fetchedAt, {
        error: nvd.error,
        cacheIntervalMinutes: 15,
        rateLimit: NVD_API_KEY
          ? 'One request per refresh using the server-side NVD API key.'
          : 'One unauthenticated request per refresh; NVD unauthenticated limit is 5 requests per 30 seconds.',
      }),
      cisa_kev: providerState('cisa_kev', kevStatus, kevSnapshot?.generatedAt || null, {
        error: kev ? null : 'No CISA KEV snapshot is available.',
        cacheIntervalMinutes: 15,
      }),
      cloudflare_radar: providerState(
        'cloudflare_radar',
        cloudflare.provider.status,
        cloudflare.provider.fetchedAt,
        {
          error: cloudflare.provider.error,
          lastUpdated: cloudflare.meta?.lastUpdated || null,
          dateRange: cloudflare.meta?.dateRange || null,
          units: cloudflare.meta?.units || null,
          normalization: cloudflare.meta?.normalization || null,
          pairCount: cloudflare.provider.pairCount ?? cloudflare.pairs.length,
          cacheIntervalMinutes: 15,
          rateLimit: cloudflare.provider.rateLimit,
        },
      ),
      recent_breaches: providerState('recent_breaches', 'disabled_license', null, {
        error: 'Not fetched or republished pending permission for the site’s intended use.',
        cacheIntervalMinutes: null,
      }),
      ip_geolocation: {
        name: 'ipwho.is',
        url: 'https://ipwho.is/',
        attribution: 'ipwho.is',
        status: sourcesSnapshot?.providers?.ip_geolocation?.status === 'ok'
          ? 'live'
          : sourcesSnapshot?.providers?.ip_geolocation?.status === 'partial'
            ? 'partial'
            : 'unavailable',
        fetchedAt: sourcesSnapshot?.providers?.ip_geolocation?.fetchedAt || null,
        cacheIntervalMinutes: 60,
        license: 'Public IP geolocation lookups; only routable public IPs are sent.',
        successfulLookups: sourcesSnapshot?.providers?.ip_geolocation?.successfulLookups ?? 0,
        requestedLookups: sourcesSnapshot?.providers?.ip_geolocation?.requestedLookups ?? 0,
        error: sourcesSnapshot?.providers?.ip_geolocation?.error || null,
      },
    },
    eventCount: events.length,
    events,
    dashboard,
  }
  if (previous) {
    const comparable = (value) => {
      const copy = JSON.parse(JSON.stringify(value))
      delete copy.generatedAt
      for (const provider of Object.values(copy.providers || {})) delete provider.fetchedAt
      return JSON.stringify(copy)
    }
    if (comparable(snapshot) === comparable(previous)) {
      snapshot.generatedAt = previous.generatedAt
      for (const [key, provider] of Object.entries(snapshot.providers)) {
        provider.fetchedAt = previous.providers?.[key]?.fetchedAt || provider.fetchedAt
      }
    }
  }
  writeJson(OUT, snapshot)
  console.log(`Wrote ${OUT}: ${events.length} normalized events; DShield ${dshield.status}, NVD ${nvd.status}, KEV ${kevStatus}, ThreatFox ${threatFoxStatus}, Cloudflare Radar ${cloudflare.provider.status}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
