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
