import { geoCentroid, geoInterpolate } from 'd3-geo'

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const COUNTRY_NAME_ALIASES = {
  democraticrepublicofthecongo: 'demrepcongo',
  democraticrepublicofcongo: 'demrepcongo',
  congodemocraticrepublic: 'demrepcongo',
  demrepcongo: 'demrepcongo',
  unitedstates: 'unitedstatesofamerica',
  unitedstatesofamerica: 'unitedstatesofamerica',
  korearepublicof: 'southkorea',
  republicofkorea: 'southkorea',
  southkorea: 'southkorea',
  koreademocraticpeoplesrepublicof: 'demrepkorea',
  democraticpeoplesrepublicofkorea: 'demrepkorea',
  northkorea: 'demrepkorea',
  russianfederation: 'russia',
  czechrepublic: 'czechia',
  iranislamicrepublicof: 'iran',
  syrianarabrepublic: 'syria',
  tanzaniaunitedrepublicof: 'tanzania',
  venezuelabolivarianrepublicof: 'venezuela',
  boliviaplurinationalstateof: 'bolivia',
  moldovarepublicof: 'moldova',
  laopeoplesdemocraticrepublic: 'laos',
  vietnam: 'vietnam',
  bruneidarussalam: 'brunei',
  taiwanprovinceofchina: 'taiwan',
  hongkongsarchina: 'hongkong',
  macausarchina: 'macao',
  eswatinikingdomof: 'eswatini',
  northmacedonia: 'macedonia',
}

function resolvedName(value) {
  const normalized = normalizeName(value)
  return normalizeName(COUNTRY_NAME_ALIASES[normalized] || normalized)
}

function findCountryFeature(name, featuresByName) {
  return featuresByName.get(resolvedName(name)) || null
}

function pairArcPath(origin, target, path) {
  const interpolate = geoInterpolate(origin, target)
  const coordinates = Array.from({ length: 49 }, (_, index) => interpolate(index / 48))
  return path({ type: 'LineString', coordinates }) || ''
}

export function buildCloudflareRadarMap(pairs, countryFeatures, projection, path, countryNumeric = {}, layerTag = null) {
  const featuresByName = new Map()
  const featuresById = new Map()
  for (const country of countryFeatures) {
    const name = resolvedName(country.properties?.name)
    if (name) featuresByName.set(name, country)
    featuresById.set(String(country.id), country)
  }

  const originTotals = new Map()
  const targetTotals = new Map()
  const countryCodeById = new Map()
  const arcs = []

  for (const [index, pair] of pairs.entries()) {
    const originFeature = featuresById.get(countryNumeric[pair.originCountryAlpha2]) ||
      findCountryFeature(pair.originCountryName, featuresByName)
    const targetFeature = featuresById.get(countryNumeric[pair.targetCountryAlpha2]) ||
      findCountryFeature(pair.targetCountryName, featuresByName)
    if (!originFeature || !targetFeature) continue

    const origin = geoCentroid(originFeature)
    const target = geoCentroid(targetFeature)
    const originPoint = projection(origin)
    const targetPoint = projection(target)
    if (!originPoint || !targetPoint || ![...originPoint, ...targetPoint].every(Number.isFinite)) continue

    const value = Number(pair.value)
    if (!Number.isFinite(value) || value < 0 || value > 100) continue
    const originId = String(originFeature.id)
    const targetId = String(targetFeature.id)
    const ratio = value
    originTotals.set(originId, (originTotals.get(originId) || 0) + ratio)
    targetTotals.set(targetId, (targetTotals.get(targetId) || 0) + ratio)
    countryCodeById.set(originId, pair.originCountryAlpha2)
    countryCodeById.set(targetId, pair.targetCountryAlpha2)
    // The layer tag keeps the two Cloudflare datasets distinct: the same
    // origin→target pair can exist in both WAF and DDoS data, and each
    // copy needs its own arc, path id, and layer label.
    const layer = pair.cfLayer || layerTag || null
    arcs.push({
      key: layer ? `${layer}:${pair.originCountryAlpha2}:${pair.targetCountryAlpha2}:${index}` : `${pair.originCountryAlpha2}:${pair.targetCountryAlpha2}:${index}`,
      pathId: layer ? `gtw-cf-arc-${layer}-${index}` : `gtw-cf-arc-${index}`,
      d: pairArcPath(origin, target, path),
      value,
      layer,
      originId,
      targetId,
      originCountryAlpha2: pair.originCountryAlpha2,
      originCountryName: pair.originCountryName,
      targetCountryAlpha2: pair.targetCountryAlpha2,
      targetCountryName: pair.targetCountryName,
      originPoint,
      targetPoint,
    })
  }

  const maxOrigin = Math.max(0, ...originTotals.values())
  const maxTarget = Math.max(0, ...targetTotals.values())
  const roles = new Map()
  for (const [id, value] of originTotals) {
    roles.set(id, {
      ...(roles.get(id) || {}),
      originValue: value,
      originOpacity: maxOrigin ? 0.1 + Math.sqrt(value / maxOrigin) * 0.36 : 0.1,
    })
  }
  for (const [id, value] of targetTotals) {
    roles.set(id, {
      ...(roles.get(id) || {}),
      targetValue: value,
      targetOpacity: maxTarget ? 0.08 + Math.sqrt(value / maxTarget) * 0.3 : 0.08,
    })
  }

  const maxPairValue = Math.max(0, ...arcs.map((arc) => arc.value))
  for (const arc of arcs) {
    const ratio = maxPairValue ? Math.sqrt(arc.value / maxPairValue) : 0
    arc.strokeWidth = 0.45 + ratio * 2.1
    arc.opacity = 0.12 + ratio * 0.72
  }

  return { arcs, roles, countryCodeById, countryFeatureById: featuresById }
}

export const CLOUDFLARE_INTERVALS = ['1h', '6h', '24h', '7d']
export const CLOUDFLARE_INTERVAL_LABELS = { '1h': '1h', '6h': '6h', '24h': '24h', '7d': '7d' }

/**
 * Cloudflare Radar mitigationProduct filter. 'all' is the unfiltered
 * aggregate (the per-interval pairs file); the seven enum values are the
 * mitigationProduct values the Radar API accepts. Product files are
 * per (interval, product); a missing/erroring product file is never
 * substituted with another product's data.
 */
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
export const CLOUDFLARE_PRODUCT_LABELS = {
  all: 'All',
  DDOS: 'DDoS',
  WAF: 'WAF',
  BOT_MANAGEMENT: 'Bot Management',
  ACCESS_RULES: 'Access Rules',
  IP_REPUTATION: 'IP Reputation',
  API_SHIELD: 'API Shield',
  DATA_LOSS_PREVENTION: 'Data Loss Prevention',
}
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

export function cloudflareProductLabel(product) {
  return CLOUDFLARE_PRODUCT_LABELS[normalizeCloudflareProduct(product)] || 'All'
}

function cloudflareFileSuffix(product) {
  const safeProduct = normalizeCloudflareProduct(product)
  return safeProduct === 'all' ? '' : `-${CLOUDFLARE_PRODUCT_SUFFIXES[safeProduct]}`
}

export function cloudflareIntervalUrl(baseUrl, interval) {
  return cloudflareProductUrl(baseUrl, interval, 'all')
}

export function cloudflareProductUrl(baseUrl, interval, product = 'all') {
  const safeInterval = CLOUDFLARE_INTERVALS.includes(interval) ? interval : '24h'
  return `${baseUrl}data/cloudflare-attack-pairs-${safeInterval}${cloudflareFileSuffix(product)}.json`
}

export function cloudflareTimeseriesUrl(baseUrl, interval, product = 'all') {
  const safeInterval = CLOUDFLARE_INTERVALS.includes(interval) ? interval : '24h'
  return `${baseUrl}data/cloudflare-timeseries-${safeInterval}${cloudflareFileSuffix(product)}.json`
}

/** Real aggregation resolution of the published timeseries per interval. */
export const CLOUDFLARE_AGG_INTERVALS = { '1h': '15m', '6h': '15m', '24h': '1h', '7d': '1d' }

export function cloudflareAggInterval(interval) {
  return CLOUDFLARE_AGG_INTERVALS[interval] || '1h'
}

/**
 * The two Cloudflare map layers and the mitigationProduct dataset each
 * one honestly represents. Web Attackers is the WAF dataset ONLY;
 * DDoS Attackers is the DDOS dataset ONLY. The other five products
 * (BOT_MANAGEMENT, ACCESS_RULES, IP_REPUTATION, API_SHIELD,
 * DATA_LOSS_PREVENTION) are published server-side but are NOT separate
 * map layers — one dataset is never duplicated as two layers.
 */
export const CLOUDFLARE_LAYER_PRODUCTS = { web: 'WAF', ddos: 'DDOS' }
export const CLOUDFLARE_LAYER_LABELS = { web: 'Web Attackers', ddos: 'DDoS Attackers' }

/**
 * Combine the enabled Cloudflare layers' pairs into one list, tagging
 * each pair with its layer. A disabled layer contributes nothing — never
 * the 'all' aggregate, never another layer's data. Rankings, map arcs,
 * highlights and country details all read this one combined list.
 */
export function combineCloudflareLayerPairs(layers) {
  const combined = []
  for (const layer of ['web', 'ddos']) {
    const entry = layers?.[layer]
    if (!entry?.enabled || !Array.isArray(entry.pairs)) continue
    for (const pair of entry.pairs) {
      if (pair && typeof pair === 'object') combined.push({ ...pair, cfLayer: layer })
    }
  }
  return combined
}

const RAW_COUNT_NORMALIZATIONS = new Set(['', 'none', 'raw', 'count', 'counts'])

function vectorProductTotal(entry) {
  return entry.points.reduce((sum, point) => sum + point.value, 0)
}

/**
 * Top Network Attack Vectors, computed ONLY from per-mitigationProduct
 * timeseries totals: each product's serie values summed over the window,
 * as a share of the summed total. Available ONLY when every one of the
 * seven products has published timeseries points for the interval AND
 * every file's meta.normalization indicates raw counts. Normalized
 * values (PERCENTAGE, MIN0_MAX, ...) cannot be summed into shares of
 * anything real, and a missing product means the total cannot be
 * validated — both cases return available:false with the named reason,
 * and the panel must show disabled, never DShield ports as flood values.
 */
export function computeAttackVectorsFromTimeseries(productTimeseries) {
  const byProduct = new Map()
  for (const entry of Array.isArray(productTimeseries) ? productTimeseries : []) {
    if (entry && typeof entry.product === 'string') byProduct.set(entry.product, entry)
  }
  const required = CLOUDFLARE_PRODUCTS.filter((product) => product !== 'all')
  const missing = required.filter((product) => {
    const entry = byProduct.get(product)
    return !entry || !Array.isArray(entry.points) || entry.points.length === 0
  })
  if (missing.length > 0) {
    return {
      available: false,
      reason: `Per-product timeseries ${missing.length === required.length ? 'have not been published yet' : `are missing for ${missing.join(', ')}`} for this interval, so per-product totals cannot be validated.`,
      vectors: [],
    }
  }
  const normalized = required.filter((product) => {
    const normalization = String(byProduct.get(product).normalization || '').toLowerCase()
    return !RAW_COUNT_NORMALIZATIONS.has(normalization)
  })
  if (normalized.length > 0) {
    const values = [...new Set(normalized.map((product) => String(byProduct.get(product).normalization || 'not supplied')))]
    return {
      available: false,
      reason: `Timeseries values are normalized (${values.join(', ')}), not raw counts — per-product totals cannot be summed into shares.`,
      vectors: [],
    }
  }
  const vectors = required
    .map((product) => ({
      product,
      label: CLOUDFLARE_PRODUCT_LABELS[product],
      total: vectorProductTotal(byProduct.get(product)),
    }))
    .sort((a, b) => b.total - a.total)
  const grandTotal = vectors.reduce((sum, vector) => sum + vector.total, 0)
  if (!(grandTotal > 0)) {
    return {
      available: false,
      reason: 'Per-product timeseries totals are zero for this interval, so no shares can be computed.',
      vectors: [],
    }
  }
  return {
    available: true,
    reason: null,
    vectors: vectors.map((vector) => ({ ...vector, share: vector.total / grandTotal })),
  }
}
export function responseMatchesRequest(response, interval, product = 'all') {
  if (!response || typeof response !== 'object') return false
  if (response.interval !== interval) return false
  if (typeof response.product === 'string' && response.product) {
    return response.product === normalizeCloudflareProduct(product)
  }
  return true
}

/**
 * Requested-vs-returned window shift, in minutes. The API returns the
 * latest fully aggregated window, which can lag the requested window
 * (e.g. 1h requested 21:30–22:30Z, returned 21:00–22:00Z = 30 min).
 * Prefers an explicit `windowShiftMinutes` on the file; otherwise derives
 * it from the requested `window` vs the API's actual `meta.dateRange`.
 * Returns null when neither source can supply both ends, 0 when aligned.
 */
export function computeWindowShiftMinutes(file) {
  if (Number.isFinite(file?.windowShiftMinutes)) return file.windowShiftMinutes
  const requestedStart = Date.parse(file?.window?.dateStart || '')
  const actualStart = Date.parse(file?.meta?.dateRange?.[0]?.startTime || '')
  if (!Number.isFinite(requestedStart) || !Number.isFinite(actualStart)) return null
  return Math.round((requestedStart - actualStart) / 60000)
}

/**
 * Map a published timeseries document to renderable points, preserving
 * the provider's real timestamps and values exactly — no interpolation,
 * no invented points. `serie` is { timestamps: [], values: [] }; entries
 * past the shorter array, non-finite timestamps, or non-finite values are
 * dropped, never guessed.
 */
export function mapTimeseriesPoints(timeseries) {
  const serie = timeseries?.serie
  if (!serie || typeof serie !== 'object') return []
  const timestamps = Array.isArray(serie.timestamps) ? serie.timestamps : []
  const values = Array.isArray(serie.values) ? serie.values : []
  const points = []
  for (let i = 0; i < Math.min(timestamps.length, values.length); i += 1) {
    const timestamp = typeof timestamps[i] === 'number'
      ? timestamps[i]
      : Date.parse(timestamps[i] || '')
    const value = Number(values[i])
    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue
    points.push({ timestamp, value })
  }
  return points
}

/** Timeline-track status label derived only from the timeseries document. */
export function timeseriesStatusLabel(timeseries) {
  const status = String(timeseries?.timeseriesStatus || timeseries?.status || '').toLowerCase()
  if (status === 'live') return 'LIVE'
  if (status === 'stale') return 'STALE'
  if (status === 'unavailable' || status === 'error' || status === 'offline') return 'UNAVAILABLE'
  if (Array.isArray(timeseries?.points) && timeseries.points.length > 0) return 'LIVE'
  if (timeseries && typeof timeseries === 'object') return 'NO DATA'
  return 'UNAVAILABLE'
}

/**
 * Manifest entries for one (interval, product). Reads the v2 manifest
 * shape (`pairs[interval][product]` / `timeseries[interval][product]`)
 * and falls back to the v1 shape (`intervals[interval]`, pairs/"all"
 * only). `kind` is 'pairs' or 'timeseries'.
 */
export function manifestEntries(manifest, interval, product = 'all', kind = 'pairs') {
  const safeProduct = normalizeCloudflareProduct(product)
  const section = manifest?.[kind]
  if (section && typeof section === 'object') {
    const byInterval = section[interval]
    if (byInterval && typeof byInterval === 'object') {
      const entries = byInterval[safeProduct]
      if (Array.isArray(entries)) return entries
    }
  }
  if (kind === 'pairs' && safeProduct === 'all') {
    const v1 = manifest?.intervals?.[interval]
    if (Array.isArray(v1)) return v1
  }
  return []
}

/** Nearest retained snapshot at/before `timestamp` for one interval+product. */
export function selectHistoricalSnapshotForProduct(manifest, interval, product, timestamp) {
  return selectHistoricalSnapshot(manifestEntries(manifest, interval, product, 'pairs'), timestamp)
}

/** Nearest retained timeseries history entry at/before `timestamp`. */
export function selectHistoricalTimeseriesForProduct(manifest, interval, product, timestamp) {
  return selectHistoricalSnapshot(manifestEntries(manifest, interval, product, 'timeseries'), timestamp)
}

/**
 * Rank Cloudflare origin or target countries by the sum of their pair
 * values. Pure: uses only provider-supplied pair values, invents nothing.
 * Returns [{ code, name, total }] sorted by total descending.
 */
export function rankCloudflareCountries(pairs, side) {
  const key = side === 'target' ? 'targetCountryAlpha2' : 'originCountryAlpha2'
  const nameKey = side === 'target' ? 'targetCountryName' : 'originCountryName'
  const totals = new Map()
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    const value = Number(pair?.value)
    if (!Number.isFinite(value) || value < 0 || value > 100) continue
    const code = pair?.[key]
    if (typeof code !== 'string' || code.length !== 2) continue
    const entry = totals.get(code) || { code, name: pair?.[nameKey] || code, total: 0 }
    entry.total += value
    if (pair?.[nameKey]) entry.name = pair[nameKey]
    totals.set(code, entry)
  }
  return [...totals.values()].sort((a, b) => b.total - a.total)
}

/** In/out pairs for one country (alpha-2), each sorted by value desc, top 5. */
export function pairsForCountry(pairs, alpha2) {
  const list = Array.isArray(pairs) ? pairs : []
  const byValueDesc = (a, b) => Number(b.value) - Number(a.value)
  return {
    outbound: list.filter((p) => p?.originCountryAlpha2 === alpha2).sort(byValueDesc).slice(0, 5),
    inbound: list.filter((p) => p?.targetCountryAlpha2 === alpha2).sort(byValueDesc).slice(0, 5),
  }
}

/**
 * Nearest retained historical snapshot at or before `timestamp` (ms).
 * `entries` are manifest entries oldest→newest with a generatedAt ISO
 * string. Returns the entry or null when none exists at/before the time.
 */
export function selectHistoricalSnapshot(entries, timestamp) {
  if (!Array.isArray(entries) || !Number.isFinite(timestamp)) return null
  let selected = null
  for (const entry of entries) {
    const generatedAt = Date.parse(entry?.generatedAt || '')
    if (!Number.isFinite(generatedAt) || generatedAt > timestamp) continue
    if (!selected || generatedAt >= Date.parse(selected.generatedAt)) selected = entry
  }
  return selected
}

/**
 * Diff two pair lists by origin:target key. Returns only real,
 * provider-supplied changes: pairs present in one list only, or with a
 * changed value. `previousPairs === null` means "no prior snapshot" and
 * yields null (no comparison is possible, not an empty diff).
 */
export function cloudflarePairChanges(currentPairs, previousPairs) {
  if (!Array.isArray(previousPairs)) return null
  const keyOf = (p) => `${p?.originCountryAlpha2}:${p?.targetCountryAlpha2}`
  const prev = new Map()
  for (const pair of previousPairs) {
    if (pair?.originCountryAlpha2 && pair?.targetCountryAlpha2) prev.set(keyOf(pair), pair)
  }
  const current = new Map()
  for (const pair of Array.isArray(currentPairs) ? currentPairs : []) {
    if (pair?.originCountryAlpha2 && pair?.targetCountryAlpha2) current.set(keyOf(pair), pair)
  }
  const added = []
  const removed = []
  const changed = []
  for (const [key, pair] of current) {
    if (!prev.has(key)) added.push(pair)
    else if (Math.abs(Number(pair.value) - Number(prev.get(key).value)) > 0.000001) {
      changed.push({ ...pair, previousValue: Number(prev.get(key).value) })
    }
  }
  for (const [key, pair] of prev) {
    if (!current.has(key)) removed.push(pair)
  }
  return { added, removed, changed }
}

/**
 * Travelling-pulse plan for the visible arcs: the top `maxPulses` arcs by
 * reported value. Larger pairs move faster (shorter duration); durations
 * are clamped to 3–9s. Pulses animate along real aggregate arcs only.
 */
export function arcPulsePlan(arcs, maxPulses = 12) {
  const list = (Array.isArray(arcs) ? [...arcs] : [])
    .filter((arc) => arc?.pathId && Number.isFinite(arc.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(0, maxPulses))
  const maxValue = Math.max(0, ...list.map((arc) => arc.value))
  return list.map((arc) => ({
    key: arc.key,
    pathId: arc.pathId,
    value: arc.value,
    durationSec: maxValue > 0
      ? Math.round((3 + (1 - arc.value / maxValue) * 6) * 10) / 10
      : 9,
  }))
}
