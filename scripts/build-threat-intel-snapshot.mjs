import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const OUT = 'public/data/threat-intel-snapshot.json'
const SOURCES_FILE = 'public/data/sources-snapshot.json'
const KEV_FILE = 'public/data/kev-snapshot.json'
const CLOUDFLARE_FILE = 'public/data/cloudflare-attack-pairs.json'
const THREATFOX_FILE = 'public/data/threatfox-snapshot.json'
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const CLOUDFLARE_RADAR_URL = 'https://api.cloudflare.com/client/v4/radar/attacks/layer7/top/attacks'
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

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function writeJson(file, value) {
  const fullPath = path.join(ROOT, file)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`)
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
  const validDateRange = Array.isArray(meta?.dateRange) &&
    meta.dateRange.length > 0 &&
    meta.dateRange.every((range) => {
      if (!range || typeof range !== 'object') return false
      const startTime = parseTimestamp(range.startTime)
      const endTime = parseTimestamp(range.endTime)
      return startTime !== null && endTime !== null && startTime <= endTime
    })
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

export async function collectCloudflareRadar(
  previous,
  {
    token = CLOUDFLARE_RADAR_API_TOKEN,
    request = fetchCloudflareRadar,
    now = () => new Date(),
  } = {},
) {
  const checkedAt = now().toISOString()
  const url = new URL(CLOUDFLARE_RADAR_URL)
  url.searchParams.set('dateRange', '1d')
  url.searchParams.set('limit', '50')
  url.searchParams.set('normalization', 'PERCENTAGE')
  url.searchParams.set('format', 'JSON')
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
      normalized = normalizeCloudflareRadarResponse(payload)
    } catch (error) {
      throw new Error(`${cloudflareResponseDescription(httpStatus, payload)}; ${error.message}`)
    }
    const fetchedAt = now().toISOString()
    return preserveCloudflareSnapshotIfUnchanged({
      schemaVersion: 1,
      generatedAt: fetchedAt,
      provider: {
        ...SOURCES.cloudflare_radar,
        status: 'live',
        fetchedAt,
        lastUpdated: normalized.meta.lastUpdated,
        pairCount: normalized.pairs.length,
        error: null,
        cacheIntervalMinutes: 15,
        rateLimit: 'Cloudflare Radar API access and limits depend on the token and account plan.',
      },
      meta: normalized.meta,
      pairs: normalized.pairs,
    }, previous)
  } catch (error) {
    const hasCachedData = Boolean(previous?.meta && Array.isArray(previous.pairs))
    return preserveCloudflareSnapshotIfUnchanged({
      schemaVersion: 1,
      generatedAt: checkedAt,
      provider: {
        ...SOURCES.cloudflare_radar,
        status: !token ? 'not_configured' : hasCachedData ? 'stale' : 'offline',
        fetchedAt: previous?.provider?.fetchedAt || null,
        lastUpdated: previous?.meta?.lastUpdated || null,
        pairCount: hasCachedData ? previous.pairs.length : 0,
        error: error.message,
        cacheIntervalMinutes: 15,
        rateLimit: 'Cloudflare Radar API access and limits depend on the token and account plan.',
      },
      meta: hasCachedData ? previous.meta : null,
      pairs: hasCachedData ? previous.pairs : [],
    }, previous)
  }
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
  const previousCloudflare = readJson(CLOUDFLARE_FILE)
  const [dshield, nvd, cloudflare] = await Promise.all([
    collectDshield(previous),
    collectNvd(previous),
    collectCloudflareRadar(previousCloudflare),
  ])
  writeJson(CLOUDFLARE_FILE, cloudflare)
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
