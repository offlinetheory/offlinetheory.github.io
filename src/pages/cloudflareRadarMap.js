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

export function buildCloudflareRadarMap(pairs, countryFeatures, projection, path, countryNumeric = {}) {
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
    arcs.push({
      key: `${pair.originCountryAlpha2}:${pair.targetCountryAlpha2}:${index}`,
      pathId: `gtw-cf-arc-${index}`,
      d: pairArcPath(origin, target, path),
      value,
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

export function cloudflareIntervalUrl(baseUrl, interval) {
  const safeInterval = CLOUDFLARE_INTERVALS.includes(interval) ? interval : '24h'
  return `${baseUrl}data/cloudflare-attack-pairs-${safeInterval}.json`
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
