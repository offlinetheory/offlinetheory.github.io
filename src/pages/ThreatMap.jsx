import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-110m.json'
import { useMeta } from '../hooks/useMeta.js'
import InfoBar from '../components/InfoBar.jsx'
import Newsletter from '../components/Newsletter.jsx'
import {
  buildCountryActivity,
  buildThreatAlerts,
  cloudflareLayerVisibility,
  countryFillStyle,
  LIVE_WINDOW_MS,
  panMapTransform,
  providerFreshness,
  RECENT_WINDOW_MS,
  sourceObservedAt,
  sourcesInTimeWindow,
  timelineTrackVisible,
  timeseriesTrackVisible,
  verifiedPortProtocol,
  zoomMapTransform,
} from './threatMapCountryActivity.js'
import {
  arcPulsePlan,
  buildCloudflareRadarMap,
  CLOUDFLARE_INTERVALS,
  CLOUDFLARE_LAYER_LABELS,
  CLOUDFLARE_PRODUCTS,
  CLOUDFLARE_PRODUCT_LABELS,
  cloudflareAggInterval,
  cloudflareProductUrl,
  cloudflareTimeseriesUrl,
  combineCloudflareLayerPairs,
  computeAttackVectorsFromTimeseries,
  computeWindowShiftMinutes,
  manifestEntries,
  mapTimeseriesPoints,
  pairsForCountry,
  rankCloudflareCountries,
  responseMatchesRequest,
  selectHistoricalSnapshotForProduct,
  timeseriesStatusLabel,
} from './cloudflareRadarMap.js'
import './ThreatMap.css'

/**
 * LIVE CYBER THREAT MAP — Offline Theory's live threat map, in the exact
 * layout of the Live Threat Map reference:
 * brand block top-left, callout button top-centre, LIVE / REFRESH
 * buttons top-right, ATTACK TYPES legend and THREAT ALERTS panels down
 * the left over the map, a full-bleed monochrome map with charcoal land
 * and white outlines, a right rail (statistics interval, top attackers,
 * top attacked, attack vectors, application violations, scanned ports),
 * and a white multi-row timeline strip
 * along the bottom with a COLLAPSE control. The homepage footer band
 * (InfoBar + Newsletter, on paper) ends the page; the global Footer nav
 * row renders below it from App.jsx.
 *
 * Nothing of Radware's is copied: no Radware name, logo, report text,
 * "Contact Sales", or copyright line, and none of Radware's numbers or
 * category names. The five layers are ours — Web Attackers (Cloudflare
 * WAF dataset only), DDoS Attackers (Cloudflare DDOS dataset only),
 * Scanners (DShield), Intruders and Anonymizers (both disabled until a
 * legitimate source is configured) — and every figure comes from our
 * own published provider snapshots.
 *
 * Real data only — nothing simulated or invented. A single same-origin
 * snapshot is refreshed server-side every 15 minutes; credentials stay in
 * GitHub Actions secrets and never enter browser code.
 *  - SANS Internet Storm Center (DShield) — sensor reports, source
 *    locations, top ports and InfoCon from the server-side snapshot.
 *  - NIST NVD API — seven days of published CVEs for the timeline; the
 *    weakness panel remains filtered to the last 48 hours.
 *  - abuse.ch ThreatFox — not fetched pending commercial-use eligibility
 *    confirmation or an appropriate paid subscription.
 *  - Recent Breaches is disabled pending permission for the site's intended use.
 *    (not fetched or republished).
 *    Data from this provider is not displayed while licensing is pending.
 *  - Cloudflare Radar — aggregated Layer 7 origin-to-target country pairs,
 *    kept separate from DShield's geolocated source-IP records.
 *  - CISA Known Exploited Vulnerabilities catalog — 15-minute snapshot,
 *    because CISA sends no CORS headers; it powers the "flaws
 *    confirmed exploited" counter only.
 *
 * Honest substitutions, labelled on the page: the "top network attack
 * vectors" panel is computed only from per-mitigation-product
 * timeseries totals and only when those values are raw counts; while
 * the timeseries files are unpublished or normalized, the panel shows
 * disabled with the named limitation — DShield ports are most-probed
 * services, never flood-type vector volumes. Country fills and markers
 * use reported DShield source locations. Cloudflare Radar separately
 * supplies aggregated Layer 7 origin-to-target country pairs; these are
 * not individual DShield source-to-destination routes.
 * The timeline shows one track per attack layer: Web and DDoS render
 * their layer's real Cloudflare timeseries points, Scanners renders
 * DShield daily totals, and Intruders/Anonymizers show disabled tracks.
 * NVD and KEV live in alerts and sidebar panels, not as timeline
 * tracks. Cloudflare upstream update time is displayed independently
 * from the local snapshot refresh time. There is no under-attack
 * indicator: pair values are percentage shares, not absolute volumes,
 * and no baseline exists to define a defensible threshold.
 *
 * Feeds that are NOT on this page, and why: abuse.ch Feodo Tracker
 * has effectively stopped updating (last blocklist update March 2026),
 * URLhaus download endpoints answer 410 Gone, and
 * Brandefense's ThreatMap sends X-Frame-Options: SAMEORIGIN, so it
 * cannot be embedded, and publishes no public feed or API. DStrak's
 * map is a search-library feature with no public embed or API either —
 * its underlying data is DShield, which this page already reads
 * directly. When enabled, ThreatFox indicators are not aggregated into
 * malware or phishing event volumes; the map presents source records instead.
 */

const THREAT_INTEL_SNAPSHOT = `${import.meta.env.BASE_URL}data/threat-intel-snapshot.json`
const CLOUDFLARE_HISTORY_MANIFEST = `${import.meta.env.BASE_URL}data/history/cloudflare-manifest.json`
const REFRESH_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 15000
const INITIAL_TIMELINE_TIME = Date.now()

// The five attack layers. Web Attackers is the Cloudflare WAF
// mitigation-product dataset ONLY; DDoS Attackers is the DDOS dataset
// ONLY — one dataset is never duplicated as two layers, and the other
// five mitigation products are published server-side but are not
// separate map layers. Scanners are DShield's geolocated sources.
// Intruders and Anonymizers have no enabled source: Intruders needs an
// event-level intrusion/IDS feed, Anonymizers a Tor/anonymizer-exit-node
// feed. Until one is configured, those layers show only their disabled
// notice — nothing is plotted or invented for them.
const CATEGORIES = [
  { key: 'web', label: 'Web Attackers', color: '#FFFFFF', note: 'Layer 7 attacks mitigated by WAF — Cloudflare Radar mitigationProduct=WAF.' },
  { key: 'ddos', label: 'DDoS Attackers', color: '#FFFFFF', note: 'DDoS attacks — Cloudflare Radar mitigationProduct=DDOS.' },
  { key: 'scanning', label: 'Scanners', color: '#FFFFFF', note: 'Probing of exposed ports, reported by volunteer sensors (DShield).' },
  { key: 'intruders', label: 'Intruders', color: '#FFFFFF', note: 'Intrusion/IDS events — no enabled source. Needs an event-level intrusion/IDS feed.', noSource: true },
  { key: 'anonymizers', label: 'Anonymizers', color: '#FFFFFF', note: 'Traffic via anonymizers — no enabled source. Needs a Tor/anonymizer-exit-node feed.', noSource: true },
]
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]))

const PORT_NAMES = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP',
  110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 1433: 'MSSQL',
  2222: 'SSH (alt)', 2323: 'Telnet (alt)', 3306: 'MySQL', 3389: 'RDP',
  5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 8000: 'HTTP (alt)', 8080: 'HTTP (alt)',
  8443: 'HTTPS (alt)', 8888: 'HTTP (alt)', 9000: 'HTTP (alt)',
}

// DShield's top-port records carry no protocol field (verified against
// the published snapshot), so no protocol is ever inferred from a port
// number here — a port's protocol is shown only where a record supplies
// it (see verifiedPortProtocol), otherwise "not verified".

// Friendly names for the weakness types that commonly top the NVD
// list; anything unmapped is shown by its CWE id.
const CWE_NAMES = {
  'CWE-20': 'Improper input validation',
  'CWE-22': 'Path traversal',
  'CWE-59': 'Improper link resolution',
  'CWE-79': 'Cross-site scripting',
  'CWE-89': 'SQL injection',
  'CWE-94': 'Code injection',
  'CWE-119': 'Memory buffer overflow',
  'CWE-125': 'Out-of-bounds read',
  'CWE-200': 'Exposure of sensitive information',
  'CWE-269': 'Improper privilege management',
  'CWE-284': 'Improper access control',
  'CWE-287': 'Improper authentication',
  'CWE-307': 'Excessive authentication attempts',
  'CWE-352': 'Cross-site request forgery',
  'CWE-362': 'Race condition',
  'CWE-400': 'Uncontrolled resource consumption',
  'CWE-416': 'Use after free',
  'CWE-434': 'Unrestricted file upload',
  'CWE-476': 'Null pointer dereference',
  'CWE-502': 'Deserialization of untrusted data',
  'CWE-601': 'URL redirection to untrusted site',
  'CWE-611': 'XML external entity reference',
  'CWE-639': 'Authorization bypass through user-controlled key',
  'CWE-732': 'Incorrect permission assignment',
  'CWE-770': 'Allocation of resources without limits',
  'CWE-787': 'Out-of-bounds write',
  'CWE-798': 'Hard-coded credentials',
  'CWE-862': 'Missing authorization',
  'CWE-863': 'Incorrect authorization',
  'CWE-918': 'Server-side request forgery',
}

const LAND = feature(worldTopo, worldTopo.objects.land)
const COUNTRIES = feature(worldTopo, worldTopo.objects.countries)
const COUNTRY_FEATURE_IDS = new Set(COUNTRIES.features.map((country) => String(country.id)))

// ISO 3166-1 numeric codes, keyed by the alpha-2 code ipwho.is returns.
// Used to match provider-reported countries to map features.
const COUNTRY_NUMERIC = {
  US: '840', NL: '528', ES: '724', DE: '276', GB: '826', FR: '250', CN: '156',
  RU: '643', BR: '076', IN: '356', JP: '392', KR: '410', CA: '124', AU: '036',
  TR: '792', IT: '380', PL: '616', UA: '804', IR: '364', VN: '704', ID: '360',
  TH: '764', MY: '458', SG: '702', TW: '158', HK: '344', ZA: '710', NG: '566',
  EG: '818', IL: '376', AE: '784', SA: '682', MX: '484', AR: '032', CL: '152',
  CO: '170', PE: '604', VE: '862', RO: '642', CZ: '203', HU: '348', GR: '300',
  PT: '620', SE: '752', NO: '578', DK: '208', FI: '246', CH: '756', AT: '040',
  BE: '056', IE: '372', NZ: '554', PH: '608', PK: '586', BD: '050', KZ: '398',
  BY: '112', GE: '268', AM: '051', AZ: '031', IQ: '368', AF: '004', NP: '524',
  LK: '144', MM: '104', KH: '116', LA: '418', MN: '496', KG: '417', TJ: '762',
  TM: '795', UZ: '860', MD: '498', AL: '008', BA: '070', HR: '191', RS: '688',
  SI: '705', SK: '703', BG: '100', LT: '440', LV: '428', EE: '233', IS: '352',
  LU: '442', MT: '470', CY: '196', DZ: '012', MA: '504', TN: '788', LY: '434',
  KE: '404', GH: '288', CI: '384', SN: '686', CM: '120', AO: '024', ET: '231',
  TZ: '834', UG: '800', ZM: '894', ZW: '716', DO: '214', CU: '192', JM: '388',
  HT: '332', GT: '320', HN: '340', SV: '222', NI: '558', CR: '188', PA: '591',
  EC: '218', BO: '068', PY: '600', UY: '858', GY: '328', SR: '740', TT: '780',
}

function flagEmoji(code) {
  if (!code || code.length !== 2) return ''
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const MAP_W = 1200
const MAP_H = 620
// Stable empty pairs reference for history-gap layers, so memoised
// derivations don't see a fresh array on every render.
const EMPTY_PAIRS = []

function fetchJson(url, { timeout = FETCH_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  return fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .finally(() => clearTimeout(timer))
}

function extractPortRecords(response) {
  if (Array.isArray(response)) {
    return response.filter((record) => record && typeof record === 'object' && !Array.isArray(record))
  }
  if (!response || typeof response !== 'object') return []

  for (const key of ['topports', 'ports', 'data']) {
    if (Object.hasOwn(response, key)) {
      const records = extractPortRecords(response[key])
      if (records.length > 0) return records
    }
  }

  const hasPort = ['targetport', 'port', 'portin', 'number'].some((key) => Object.hasOwn(response, key))
  const hasReports = ['records', 'reports', 'count'].some((key) => Object.hasOwn(response, key))
  if (hasPort && hasReports) return [response]

  return Object.entries(response)
    .filter(([key]) => /^\d+$/.test(key))
    .map(([, record]) => record)
    .filter((record) => record && typeof record === 'object' && !Array.isArray(record))
}

function numericValue(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function fmtTime(date) {
  return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })
}

function formatTimelineTick(timestamp, span) {
  const date = new Date(timestamp)
  return span <= 48 * 60 * 60 * 1000
    ? date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function toLocalDateTimeInput(timestamp) {
  const date = new Date(timestamp)
  return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function fmtUtcTimestamp(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value || '')
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : 'not supplied by source'
}

function formatCloudflareDateRange(dateRange) {
  if (!Array.isArray(dateRange) || dateRange.length === 0) return 'not supplied'
  return dateRange
    .map((range) => `${fmtUtcTimestamp(range?.startTime)} – ${fmtUtcTimestamp(range?.endTime)}`)
    .join(', ')
}

function formatCloudflareUnits(units) {
  if (!Array.isArray(units) || units.length === 0) return 'not supplied'
  return units
    .map((unit) => `${unit?.name || 'unit'}: ${JSON.stringify(unit?.value) ?? 'not supplied'}`)
    .join(', ')
}

const TIMELINE_TRACKS = [
  { key: 'web', label: 'Web Attackers · WAF timeseries', resolution: '1h' },
  { key: 'ddos', label: 'DDoS Attackers · DDoS timeseries', resolution: '1h' },
  { key: 'intruders', label: 'Intruders · no source configured', resolution: 'day' },
  { key: 'scanners', label: 'Scanners · DShield daily reports', resolution: 'day' },
  { key: 'anonymizers', label: 'Anonymizers · no source configured', resolution: 'day' },
]

function cloudflareFreshness(provider, now = Date.now()) {
  if (provider?.status === 'not_configured') return 'NOT CONFIGURED'
  if (provider?.status === 'offline' || provider?.status === 'unavailable') return 'OFFLINE'
  if (provider?.status === 'stale') return 'STALE'
  const timestamp = Date.parse(provider?.lastUpdated || '')
  if (!Number.isFinite(timestamp)) return 'OFFLINE'
  const age = Math.max(0, now - timestamp)
  if (age <= LIVE_WINDOW_MS) return provider.status === 'live' ? 'LIVE' : 'RECENT'
  if (age <= RECENT_WINDOW_MS) return 'RECENT'
  return 'STALE'
}

function formatUtcTimestamp(value) {
  const timestamp = Date.parse(value || '')
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : 'no successful refresh'
}

function timelineTimestamp(value) {
  if (typeof value !== 'string') return null
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const isTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  if (!isDate && !isTimestamp) return null
  const timestamp = Date.parse(isDate ? `${value}T00:00:00Z` : value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function timelineSourceStatus(provider, events, now) {
  if (provider?.status?.startsWith('disabled')) return 'DISABLED'
  const freshness = providerFreshness(provider, now)
  if (freshness === 'OFFLINE') return 'UNAVAILABLE'
  return events.length > 0 ? freshness : 'NO EVENTS'
}

function ActivityTrack({ events, start, end, resolution, cursor = null }) {
  const width = 1000
  const baseline = 23
  const maxHeight = 18
  // Buckets are the provider's real resolution — 15m bins for the 1h/6h
  // Cloudflare timeseries, hourly for 24h/NVD, daily for 7d/DShield/KEV.
  // Points are bucketed, never interpolated: a gap stays a gap.
  const bucketSize = resolution === '15m'
    ? 15 * 60 * 1000
    : resolution === 'hour' || resolution === '1h'
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000
  const barWidth = resolution === 'day' || resolution === '1d' ? 3 : 2.4
  const buckets = new Map()
  for (const event of events) {
    if (
      !Number.isFinite(event.timestamp) ||
      !Number.isFinite(event.value) ||
      event.value <= 0 ||
      event.timestamp < start ||
      event.timestamp > end ||
      (cursor !== null && event.timestamp > cursor)
    ) continue
    const bucket = Math.floor(event.timestamp / bucketSize) * bucketSize
    buckets.set(bucket, (buckets.get(bucket) || 0) + event.value)
  }
  const maxValue = Math.max(1, ...buckets.values())

  return (
    <svg viewBox={`0 0 ${width} 26`} preserveAspectRatio="none" className="gtw__activity-track" aria-hidden="true">
      <path d={`M 0 ${baseline} H ${width}`} className="gtw__activity-baseline" />
      {[...buckets.entries()].sort(([a], [b]) => a - b).map(([bucket, value]) => {
        const bucketCenter = bucket + bucketSize / 2
        const x = ((bucketCenter - start) / (end - start)) * width
        const height = 1 + Math.sqrt(value / maxValue) * (maxHeight - 1)
        return (
          <rect
            key={bucket}
            x={Math.max(0, Math.min(width - barWidth, x - barWidth / 2))}
            y={baseline - height}
            width={barWidth}
            height={height}
            className="gtw__activity-bar"
          />
        )
      })}
    </svg>
  )
}

function emptyCloudflareLayer() {
  return {
    pairs: [],
    meta: null,
    provider: null,
    generatedAt: null,
    window: null,
    windowShiftMinutes: null,
    status: 'unavailable',
    error: 'Layer file not loaded yet',
  }
}

function emptyTimeseries() {
  return {
    points: [],
    meta: null,
    normalization: null,
    status: 'unavailable',
    error: 'Timeseries file not loaded yet',
    aggInterval: null,
    generatedAt: null,
    window: null,
    windowShiftMinutes: null,
  }
}

export default function ThreatMap() {
  useMeta({
    title: 'Live Cyber Threat Map',
    description:
      'Live Cyber Threat Map — a regularly refreshed map of reported source addresses, scanned ports, exploited vulnerabilities and newly published CVEs from public feeds.',
  })

  const [data, setData] = useState({
    sources: [],
    ports: [],
    violations: [],
    threatfox: [],
    threatfoxStatus: 'disabled_license',
    dailySummary: [],
    nvdRecent: [],
    cloudflareRadar: { web: emptyCloudflareLayer(), ddos: emptyCloudflareLayer() },
    infocon: null,
    kev: null,
    rbIndex: null,
    rbGeo: null,
    rbLeaks: [],
    timeline: { dshield: [] },
    providers: null,
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [detailedCountryFeatures, setDetailedCountryFeatures] = useState(null)
  const [cloudflareGeometryError, setCloudflareGeometryError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [hovered, setHovered] = useState(null)
  const [chip, setChip] = useState(null)
  const [selectedIntel, setSelectedIntel] = useState(null)
  const [attackFilters, setAttackFilters] = useState({
    web: true,
    ddos: true,
    scanning: true,
    intruders: true,
    anonymizers: true,
  })
  // Interval default is 1h: the reference recording runs on a 1-hour
  // interval, and the timeline's default window is 1 hour.
  const [cfInterval, setCfInterval] = useState('1h')
  // Timeseries per mitigation product, keyed by product enum — WAF and
  // DDOS feed the Web/DDoS timeline tracks; all seven feed the attack
  // vectors panel. No timeseries files are published yet, so every
  // entry starts (and stays, until the pipeline publishes them) as
  // unavailable with empty points — never substituted or invented.
  const [cfTimeseriesByProduct, setCfTimeseriesByProduct] = useState({})
  const [cfManifest, setCfManifest] = useState(null)
  const [cfPreviousPairs, setCfPreviousPairs] = useState({ web: null, ddos: null })
  const [historicalCf, setHistoricalCf] = useState({ web: null, ddos: null })
  const cfIntervalRef = useRef(cfInterval)
  cfIntervalRef.current = cfInterval
  // Monotonic load-generation id: a response is applied only while its
  // generation is still current, so a slow earlier request (e.g. 1h)
  // resolving after a later one (e.g. 24h), or the 5-minute auto-refresh
  // racing an interval/product switch, can never apply one
  // interval/product's pairs under another's label.
  const loadGenerationRef = useRef(0)
  const historicalCfFetchedRef = useRef({ web: null, ddos: null })
  const [mapTransform, setMapTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [timeWindow, setTimeWindow] = useState(null)
  const [playhead, setPlayhead] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [timelineCollapsed, setTimelineCollapsed] = useState(false)
  const mounted = useRef(true)
  const mapWrapRef = useRef(null)
  const svgRef = useRef(null)
  const panRef = useRef(null)
  const suppressClickUntil = useRef(0)
  const playheadRef = useRef(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    const generation = ++loadGenerationRef.current
    const requestInterval = cfIntervalRef.current
    const nextErrors = {}
    try {
      // One fetch per dataset, all for the requested interval only:
      // WAF + DDOS pair files (the two map layers) and the
      // per-mitigation-product timeseries files (Web/DDoS tracks + the
      // attack-vectors panel). There is no fallback: a missing file
      // shows UNAVAILABLE for that layer/product instead of a
      // substitute. Manual refresh only re-fetches these same-origin
      // files — it never triggers a workflow re-run.
      const cloudflarePromise = (async () => {
        const results = await Promise.allSettled([
          fetchJson(cloudflareProductUrl(import.meta.env.BASE_URL, requestInterval, 'WAF')),
          fetchJson(cloudflareProductUrl(import.meta.env.BASE_URL, requestInterval, 'DDOS')),
          ...CLOUDFLARE_PRODUCTS.filter((product) => product !== 'all').map((product) =>
            fetchJson(cloudflareTimeseriesUrl(import.meta.env.BASE_URL, requestInterval, product))),
        ])
        return {
          pairsWaf: results[0],
          pairsDdos: results[1],
          timeseriesResults: results.slice(2),
        }
      })()
      const [snapshotResult, cloudflareResult] = await Promise.allSettled([
        fetchJson(THREAT_INTEL_SNAPSHOT),
        cloudflarePromise,
      ])
      // Stale-response guard: ignore everything from an earlier
      // generation (superseded interval/product switch or refresh).
      if (!mounted.current || generation !== loadGenerationRef.current) return
      if (snapshotResult.status === 'rejected') throw snapshotResult.reason
      const snapshot = snapshotResult.value
      if (!snapshot?.dashboard || !snapshot?.providers) {
        throw new Error('The threat-intel snapshot has an unexpected shape')
      }

      const dashboard = snapshot.dashboard
      const cloudflareDocs = cloudflareResult.status === 'fulfilled' ? cloudflareResult.value : null
      const fallbackProvider = snapshot.providers.cloudflare_radar || null
      // One layer state per Cloudflare dataset. A layer whose file is
      // missing, erroring, or mismatched yields empty pairs + status
      // 'unavailable' with the reason — never another layer's data.
      const layerFromPairsDoc = (settled, product) => {
        if (
          settled?.status === 'fulfilled' &&
          Array.isArray(settled.value?.pairs) &&
          settled.value?.provider &&
          responseMatchesRequest(settled.value, requestInterval, product)
        ) {
          const doc = settled.value
          return {
            pairs: doc.pairs,
            meta: doc.meta || null,
            provider: doc.provider,
            generatedAt: doc.generatedAt || null,
            window: doc.window || null,
            windowShiftMinutes: computeWindowShiftMinutes(doc),
            status: doc.intervalStatus || doc.provider?.status || 'live',
            error: doc.intervalError || null,
          }
        }
        return {
          ...emptyCloudflareLayer(),
          provider: fallbackProvider,
          error: settled?.status === 'rejected'
            ? settled.reason.message
            : settled?.status === 'fulfilled'
              ? 'Cloudflare Radar file does not match the requested interval/product, or has an unexpected response shape'
              : 'Cloudflare Radar file is unavailable',
        }
      }
      const webLayer = layerFromPairsDoc(cloudflareDocs?.pairsWaf, 'WAF')
      const ddosLayer = layerFromPairsDoc(cloudflareDocs?.pairsDdos, 'DDOS')
      if (webLayer.status === 'unavailable') nextErrors.cloudflareWeb = webLayer.error
      else if (webLayer.provider?.status !== 'live') {
        nextErrors.cloudflareWeb = webLayer.provider?.error || `Provider status: ${webLayer.provider?.status || 'unavailable'}`
      }
      if (ddosLayer.status === 'unavailable') nextErrors.cloudflareDdos = ddosLayer.error
      else if (ddosLayer.provider?.status !== 'live') {
        nextErrors.cloudflareDdos = ddosLayer.provider?.error || `Provider status: ${ddosLayer.provider?.status || 'unavailable'}`
      }
      // Timeseries per product: missing, erroring, or mismatched files
      // yield empty points + UNAVAILABLE — never another
      // interval/product's series.
      const timeseriesByProduct = {}
      const vectorProducts = CLOUDFLARE_PRODUCTS.filter((product) => product !== 'all')
      vectorProducts.forEach((product, index) => {
        const settled = cloudflareDocs?.timeseriesResults?.[index]
        if (
          settled?.status === 'fulfilled' &&
          settled.value &&
          typeof settled.value === 'object' &&
          responseMatchesRequest(settled.value, requestInterval, product)
        ) {
          const doc = settled.value
          const points = mapTimeseriesPoints(doc)
          const rawStatus = String(doc.timeseriesStatus || '').toLowerCase()
          timeseriesByProduct[product] = {
            points,
            meta: doc.meta || null,
            normalization: doc.meta?.normalization || doc.normalization || null,
            status: rawStatus === 'live' || rawStatus === 'stale'
              ? rawStatus
              : (points.length > 0 ? 'live' : 'unavailable'),
            error: rawStatus === 'unavailable' || rawStatus === 'error'
              ? (doc.timeseriesError || `Timeseries status: ${rawStatus}`)
              : null,
            aggInterval: doc.aggInterval || doc.meta?.aggInterval || cloudflareAggInterval(requestInterval),
            generatedAt: doc.generatedAt || null,
            window: doc.window || null,
            windowShiftMinutes: computeWindowShiftMinutes(doc),
          }
        } else {
          timeseriesByProduct[product] = {
            ...emptyTimeseries(),
            error: settled?.status === 'rejected'
              ? settled.reason.message
              : settled?.status === 'fulfilled'
                ? 'Timeseries file does not match the requested interval/product, or has an unexpected shape'
                : 'Timeseries file is unavailable',
            aggInterval: cloudflareAggInterval(requestInterval),
          }
        }
      })
      setCfTimeseriesByProduct(timeseriesByProduct)
      const providerMessage = (key) => {
        const provider = snapshot.providers[key]
        if (!provider || provider.status === 'live') return null
        return provider.error || `Provider status: ${provider.status}`
      }
      const dshieldWarning = providerMessage('dshield')
      const threatFoxWarning = providerMessage('threatfox')
      const threatFoxStatus = snapshot.providers.threatfox?.status || 'unavailable'
      const topPortsFeed = snapshot.providers.dshield?.subfeeds?.top_ports
      const nvdWarning = providerMessage('nvd')
      const kevWarning = providerMessage('cisa_kev')
      const breachWarning = providerMessage('recent_breaches')
      if (dshieldWarning) {
        nextErrors.dshield = dshieldWarning
      }
      if (threatFoxWarning && threatFoxStatus !== 'disabled_license') nextErrors.threatfox = threatFoxWarning
      if (nvdWarning) nextErrors.nvd = nvdWarning
      if (kevWarning) nextErrors.kev = kevWarning
      if (breachWarning) nextErrors.rb = breachWarning

      const sources = (Array.isArray(dashboard.sources) ? dashboard.sources : [])
        .filter((source) =>
          Number.isFinite(source.lat) &&
          Number.isFinite(source.lon) &&
          numericValue(source.reports) !== null,
        )
        .map((source) => ({
          ip: source.ip,
          reports: numericValue(source.reports),
          targets: numericValue(source.targets),
          country: source.country,
          countryCode: source.countryCode,
          city: source.city || null,
          lat: source.lat,
          lon: source.lon,
          firstSeen: source.firstSeen || null,
          lastSeen: source.lastSeen || null,
          dataDate: source.dataDate || null,
        }))

      const ports = extractPortRecords(dashboard.ports)
        .map((record) => {
          const port = numericValue(record.targetport ?? record.port ?? record.portin ?? record.number)
          const records = numericValue(record.records ?? record.reports ?? record.count)
          if (port == null || records == null || !Number.isInteger(port) || port < 1 || port > 65535 || records <= 0) {
            return null
          }
          return {
            port,
            records,
            rank: numericValue(record.rank),
            targets: numericValue(record.targets),
            sources: numericValue(record.sources),
            date: record.date || dashboard.ports?.date || null,
            // Kept only when the record supplies it; DShield's records
            // do not, so this is null and the UI says "not verified".
            protocol: typeof record.protocol === 'string' ? record.protocol : null,
          }
        })
        .filter(Boolean)
        .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 6)
      if (ports.length === 0 && topPortsFeed && topPortsFeed.status !== 'live') {
        nextErrors.ports = topPortsFeed.error || `Provider status: ${topPortsFeed.status}`
      } else if (ports.length === 0 && !topPortsFeed && dshieldWarning) {
        nextErrors.ports = dshieldWarning
      }

      const nvd = dashboard.nvd
      const violationCounts = new Map()
      const violationWindowStart = Date.now() - 48 * 60 * 60 * 1000
      for (const item of nvd?.vulnerabilities || []) {
        const cve = item.cve
        if (!cve) continue
        const publishedAt = Date.parse(cve.published || '')
        if (!Number.isFinite(publishedAt) || publishedAt < violationWindowStart) continue
        const primary = (cve.weaknesses || []).find((weakness) => weakness.type === 'Primary')
        const descriptions = primary
          ? primary.description || []
          : (cve.weaknesses || []).flatMap((weakness) => weakness.description || [])
        const ids = [...new Set(descriptions.filter((description) => description.lang === 'en').map((description) => description.value))]
        for (const id of ids) {
          if (/^CWE-\d+$/.test(id)) violationCounts.set(id, (violationCounts.get(id) || 0) + 1)
        }
      }
      const violations = [...violationCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ id, name: CWE_NAMES[id] || id, count }))

      const dailySummary = Array.isArray(dashboard.dailySummary) ? dashboard.dailySummary : []
      // The Scanners timeline track uses DShield DAILY points only —
      // sparse, one point per day, never dozens of fake hourly spikes.
      // NVD/KEV live in alerts + sidebar panels, not as timeline tracks.
      const dshieldEvents = dailySummary
        .map((day) => {
          const timestamp = timelineTimestamp(day.date)
          return timestamp == null ? null : { timestamp, value: Number(day.records) || 0 }
        })
        .filter(Boolean)
      const kev = dashboard.kev
      const threatfox = Array.isArray(dashboard.threatfox) ? dashboard.threatfox : []

      if (!mounted.current) return
      const nvdRecent = (Array.isArray(nvd?.vulnerabilities) ? nvd.vulnerabilities : [])
        .map((item) => ({ id: item?.cve?.id, published: item?.cve?.published }))
        .filter((item) => typeof item.id === 'string' && Number.isFinite(Date.parse(item.published || '')))
        .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
        .slice(0, 50)
      setData((current) => ({
        ...current,
        sources,
        ports,
        violations,
        threatfox,
        threatfoxStatus: threatFoxStatus,
        dailySummary,
        nvdRecent,
        cloudflareRadar: { web: webLayer, ddos: ddosLayer },
        providers: snapshot.providers,
        infocon: dashboard.infocon?.status || null,
        kev,
        rbIndex: dashboard.recentBreaches?.index || null,
        rbGeo: dashboard.recentBreaches?.geo || null,
        rbLeaks: Array.isArray(dashboard.recentBreaches?.leaks) ? dashboard.recentBreaches.leaks.slice(0, 4) : [],
        timeline: {
          dshield: dshieldEvents,
        },
      }))
      setErrors(nextErrors)
      setUpdatedAt(snapshot.generatedAt ? new Date(snapshot.generatedAt) : null)
    } catch (error) {
      if (mounted.current && generation === loadGenerationRef.current) {
        console.error(`Threat-intel snapshot unavailable: ${error.message}`)
        setErrors({ snapshot: error.message, dshield: error.message })
      }
    } finally {
      if (mounted.current && generation === loadGenerationRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    const timer = setInterval(() => load(true), REFRESH_MS)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [load])

  // Interval change: refetch that interval's Cloudflare files and leave
  // any historical playback behind (it belongs to the old interval).
  const firstIntervalRun = useRef(true)
  useEffect(() => {
    if (firstIntervalRun.current) {
      firstIntervalRun.current = false
      return
    }
    historicalCfFetchedRef.current = { web: null, ddos: null }
    setHistoricalCf({ web: null, ddos: null })
    setCfPreviousPairs({ web: null, ddos: null })
    load(true)
  }, [cfInterval, load])

  // History manifest: absent on older deploys — degrade to
  // current-snapshot-only behaviour, never crash, never invent history.
  useEffect(() => {
    let cancelled = false
    fetchJson(CLOUDFLARE_HISTORY_MANIFEST)
      .then((manifest) => {
        const hasEntries = manifest && typeof manifest === 'object' &&
          (manifest.intervals || manifest.pairs || manifest.timeseries)
        if (!cancelled && hasEntries) {
          setCfManifest(manifest)
        } else if (!cancelled) {
          setCfManifest(null)
        }
      })
      .catch(() => {
        if (!cancelled) setCfManifest(null)
      })
    return () => { cancelled = true }
  }, [])

  // Previous retained snapshot per layer, so the alerts panel can report
  // real Cloudflare pair changes. Null per layer = no prior snapshot
  // retained for that layer, so no pair-change alert is shown for it.
  useEffect(() => {
    setCfPreviousPairs({ web: null, ddos: null })
    let cancelled = false
    for (const [layer, product] of [['web', 'WAF'], ['ddos', 'DDOS']]) {
      const entries = manifestEntries(cfManifest, cfInterval, product, 'pairs')
      if (!Array.isArray(entries) || entries.length < 2) continue
      const previous = entries[entries.length - 2]
      const path = typeof previous?.path === 'string' ? previous.path.replace(/^\//, '') : null
      if (!path) continue
      fetchJson(`${import.meta.env.BASE_URL}${path}`)
        .then((snapshot) => {
          if (!cancelled && Array.isArray(snapshot?.pairs)) {
            setCfPreviousPairs((current) => ({ ...current, [layer]: snapshot.pairs }))
          }
        })
        .catch(() => {
          // No prior snapshot usable for this layer — no alert, no crash.
        })
    }
    return () => { cancelled = true }
  }, [cfManifest, cfInterval])

  // Retained snapshot at/before the playhead, per layer, for the ACTIVE
  // interval. When a layer has none at/before the playhead (and the
  // playhead is before that layer's live snapshot), that layer shows NO
  // pairs and a "no historical data" note — never today's pairs
  // presented as history.
  const selectedHistoricalEntries = useMemo(() => {
    if (playhead === null) return { web: null, ddos: null }
    return {
      web: selectHistoricalSnapshotForProduct(cfManifest, cfInterval, 'WAF', playhead),
      ddos: selectHistoricalSnapshotForProduct(cfManifest, cfInterval, 'DDOS', playhead),
    }
  }, [playhead, cfManifest, cfInterval])
  const liveWebGeneratedAt = data.cloudflareRadar.web.generatedAt
  const liveDdosGeneratedAt = data.cloudflareRadar.ddos.generatedAt
  const cfHistoryGap = useMemo(() => ({
    web: playhead !== null &&
      !selectedHistoricalEntries.web &&
      (liveWebGeneratedAt === null || playhead < Date.parse(liveWebGeneratedAt)),
    ddos: playhead !== null &&
      !selectedHistoricalEntries.ddos &&
      (liveDdosGeneratedAt === null || playhead < Date.parse(liveDdosGeneratedAt)),
  }), [playhead, selectedHistoricalEntries, liveWebGeneratedAt, liveDdosGeneratedAt])

  // Historical playback: when the playhead sits at/after a retained
  // snapshot for a layer, swap that layer to that snapshot's pairs.
  useEffect(() => {
    if (playhead === null) {
      setHistoricalCf((current) => (current.web === null && current.ddos === null
        ? current
        : { web: null, ddos: null }))
      historicalCfFetchedRef.current = { web: null, ddos: null }
      return undefined
    }
    let cancelled = false
    for (const layer of ['web', 'ddos']) {
      const selected = selectedHistoricalEntries[layer]
      const liveAt = layer === 'web' ? liveWebGeneratedAt : liveDdosGeneratedAt
      if (!selected || (liveAt && selected.generatedAt === liveAt)) {
        setHistoricalCf((current) => (current[layer] === null
          ? current
          : { ...current, [layer]: null }))
        historicalCfFetchedRef.current[layer] = null
        continue
      }
      if (historicalCfFetchedRef.current[layer] === selected.generatedAt) continue
      historicalCfFetchedRef.current[layer] = selected.generatedAt
      const path = typeof selected.path === 'string' ? selected.path.replace(/^\//, '') : null
      if (!path) continue
      const entryGeneratedAt = selected.generatedAt
      const product = layer === 'web' ? 'WAF' : 'DDOS'
      fetchJson(`${import.meta.env.BASE_URL}${path}`)
        .then((snapshot) => {
          // Guard: apply only if this entry is still the selected one
          // for the active interval+layer, and the snapshot matches them.
          if (
            !cancelled &&
            historicalCfFetchedRef.current[layer] === entryGeneratedAt &&
            Array.isArray(snapshot?.pairs) &&
            responseMatchesRequest(snapshot, cfIntervalRef.current, product)
          ) {
            setHistoricalCf((current) => ({
              ...current,
              [layer]: {
                generatedAt: entryGeneratedAt,
                pairs: snapshot.pairs,
                meta: snapshot.meta || null,
                window: snapshot.window || null,
                windowShiftMinutes: computeWindowShiftMinutes(snapshot),
              },
            }))
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHistoricalCf((current) => ({ ...current, [layer]: null }))
          }
        })
    }
    return () => { cancelled = true }
  }, [playhead, selectedHistoricalEntries, liveWebGeneratedAt, liveDdosGeneratedAt])

  const projection = useMemo(() => geoNaturalEarth1().fitSize([MAP_W, MAP_H], LAND), [])
  const path = useMemo(() => geoPath(projection), [projection])
  const graticulePath = useMemo(() => path(geoGraticule()), [path])

  const svgPoint = (clientX, clientY) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    return point.matrixTransform(matrix.inverse())
  }

  const zoomMap = (factor, focal = { x: MAP_W / 2, y: MAP_H / 2 }) => {
    setMapTransform((current) => zoomMapTransform(current, factor, focal))
  }

  const onMapWheel = (event) => {
    event.preventDefault()
    const focal = svgPoint(event.clientX, event.clientY)
    if (focal) zoomMap(event.deltaY < 0 ? 1.15 : 1 / 1.15, focal)
  }

  const onMapPointerDown = (event) => {
    if (event.button !== 0) return
    const point = svgPoint(event.clientX, event.clientY)
    if (!point) return
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      point,
      moved: false,
      country: event.target.closest?.('[data-country-id]')?.dataset || null,
      sourceId: event.target.closest?.('[data-source-id]')?.dataset.sourceId || null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onMapPointerMove = (event) => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    const point = svgPoint(event.clientX, event.clientY)
    if (!point) return
    if (Math.hypot(event.clientX - pan.clientX, event.clientY - pan.clientY) > 3) {
      pan.moved = true
      setIsPanning(true)
    }
    if (pan.moved) {
      setMapTransform((current) => panMapTransform(current, point.x - pan.point.x, point.y - pan.point.y))
    }
    pan.clientX = event.clientX
    pan.clientY = event.clientY
    pan.point = point
  }

  const onMapPointerUp = (event) => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    if (pan.moved) suppressClickUntil.current = performance.now() + 300
    else if (pan.sourceId) setSelectedIntel({ type: 'source', id: pan.sourceId })
    else if (pan.country?.countryId) {
      setSelectedIntel({
        type: 'country',
        id: pan.country.countryId,
        name: pan.country.countryName,
      })
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    panRef.current = null
    setIsPanning(false)
  }

  // Pin the country's name to the cursor in addition to the map readout.
  const onCountryHover = (e, info, name) => {
    const rect = mapWrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setChip({
      name: info?.activityType === 'source'
        ? `${info.country} · ${info.reports.toLocaleString('en-US')} DShield reports · last observed ${info.lastObservedAt ? fmtUtcTimestamp(info.lastObservedAt) : `per-IP time unavailable; feed updated ${fmtUtcTimestamp(info.lastRefresh)}`}`
        : `${name} · no verified DShield source activity`,
      x: Math.max(8, Math.min(x + 14, rect.width - 350)),
      y: Math.max(y - 16, 8),
    })
    if (info) setHovered(info)
  }

  const countrySourceFeed = data.providers?.dshield?.subfeeds?.source_locations
  const countrySourceFreshness = providerFreshness(countrySourceFeed)
  const countrySourceLastRefresh = countrySourceFeed?.fetchedAt || countrySourceFeed?.lastSuccessfulAt || null
  const timelineNow = updatedAt?.getTime() ?? INITIAL_TIMELINE_TIME
  // Default timeline window is 1 hour, matching the reference
  // recording's 1-hour interval; the axis shows a NOW marker at the end.
  const defaultTimelineStart = timelineNow - 60 * 60 * 1000
  const timelineWindowStart = timeWindow?.start ?? defaultTimelineStart
  const timelineWindowEnd = timeWindow?.end ?? timelineNow
  const activeTimeWindow = { start: timelineWindowStart, end: timelineWindowEnd }
  const historicalMapFilterActive = Boolean(timeWindow || playhead !== null)
  const visibleSources = useMemo(() => {
    if (!historicalMapFilterActive) return data.sources
    return sourcesInTimeWindow(data.sources, timelineWindowStart, timelineWindowEnd, playhead ?? timelineWindowEnd)
  }, [data.sources, historicalMapFilterActive, timelineWindowStart, timelineWindowEnd, playhead])
  const sourceActivity = useMemo(
    () => buildCountryActivity(visibleSources, COUNTRY_NUMERIC).activity,
    [visibleSources],
  )
  const cloudflareNeedsDetailedGeometry = [...data.cloudflareRadar.web.pairs, ...data.cloudflareRadar.ddos.pairs].some((pair) =>
    !COUNTRY_FEATURE_IDS.has(COUNTRY_NUMERIC[pair.originCountryAlpha2]) ||
    !COUNTRY_FEATURE_IDS.has(COUNTRY_NUMERIC[pair.targetCountryAlpha2]),
  )
  useEffect(() => {
    if (!cloudflareNeedsDetailedGeometry) return undefined
    let cancelled = false
    import('world-atlas/countries-50m.json', { with: { type: 'json' } })
      .then(({ default: detailedWorld }) => {
        if (cancelled) return
        setDetailedCountryFeatures(feature(detailedWorld, detailedWorld.objects.countries).features)
        setCloudflareGeometryError(null)
      })
      .catch((error) => {
        if (!cancelled) setCloudflareGeometryError(error.message)
      })
    return () => { cancelled = true }
  }, [cloudflareNeedsDetailedGeometry])
  const cloudflareCountryFeatures = detailedCountryFeatures || COUNTRIES.features
  // Effective pairs per layer: the historical snapshot when playback
  // shows one, live pairs otherwise, empty when that layer has no
  // retained snapshot at/before the playhead — never today's pairs as
  // history.
  const effectiveWebPairs = cfHistoryGap.web
    ? EMPTY_PAIRS
    : (historicalCf.web ? historicalCf.web.pairs : data.cloudflareRadar.web.pairs)
  const effectiveDdosPairs = cfHistoryGap.ddos
    ? EMPTY_PAIRS
    : (historicalCf.ddos ? historicalCf.ddos.pairs : data.cloudflareRadar.ddos.pairs)
  const effectiveLayerMeta = useMemo(() => ({
    web: cfHistoryGap.web ? null : (historicalCf.web ? historicalCf.web.meta : data.cloudflareRadar.web.meta),
    ddos: cfHistoryGap.ddos ? null : (historicalCf.ddos ? historicalCf.ddos.meta : data.cloudflareRadar.ddos.meta),
  }), [cfHistoryGap, historicalCf, data.cloudflareRadar])
  const effectiveLayerGeneratedAt = useMemo(() => ({
    web: historicalCf.web?.generatedAt || (cfHistoryGap.web ? null : data.cloudflareRadar.web.generatedAt),
    ddos: historicalCf.ddos?.generatedAt || (cfHistoryGap.ddos ? null : data.cloudflareRadar.ddos.generatedAt),
  }), [cfHistoryGap, historicalCf, data.cloudflareRadar])
  const effectiveLayerWindow = useMemo(() => ({
    web: cfHistoryGap.web ? null : (historicalCf.web ? historicalCf.web.window : data.cloudflareRadar.web.window),
    ddos: cfHistoryGap.ddos ? null : (historicalCf.ddos ? historicalCf.ddos.window : data.cloudflareRadar.ddos.window),
  }), [cfHistoryGap, historicalCf, data.cloudflareRadar])
  const effectiveLayerShift = useMemo(() => ({
    web: cfHistoryGap.web ? null : (historicalCf.web ? historicalCf.web.windowShiftMinutes : data.cloudflareRadar.web.windowShiftMinutes),
    ddos: cfHistoryGap.ddos ? null : (historicalCf.ddos ? historicalCf.ddos.windowShiftMinutes : data.cloudflareRadar.ddos.windowShiftMinutes),
  }), [cfHistoryGap, historicalCf, data.cloudflareRadar])
  // One shared Cloudflare state: rankings, map arcs, highlights,
  // country details and pair details all read this one combined list of
  // the currently ENABLED layers' pairs. A disabled layer contributes
  // nothing; when neither layer is enabled the list is empty and the
  // rankings show the disabled state, never the 'all' aggregate.
  const effectiveCloudflarePairs = useMemo(() => combineCloudflareLayerPairs({
    web: { pairs: effectiveWebPairs, enabled: attackFilters.web !== false },
    ddos: { pairs: effectiveDdosPairs, enabled: attackFilters.ddos !== false },
  }), [effectiveWebPairs, effectiveDdosPairs, attackFilters.web, attackFilters.ddos])
  const layerAvailable = {
    web: data.cloudflareRadar.web.status !== 'unavailable' && !cfHistoryGap.web,
    ddos: data.cloudflareRadar.ddos.status !== 'unavailable' && !cfHistoryGap.ddos,
  }
  const webLayers = cloudflareLayerVisibility(attackFilters, 'web', layerAvailable.web)
  const ddosLayers = cloudflareLayerVisibility(attackFilters, 'ddos', layerAvailable.ddos)
  const layerDisplayStatus = (layer) => {
    if (cfHistoryGap[layer]) return 'NO HISTORY'
    if (historicalCf[layer]) return 'HISTORICAL'
    return cloudflareFreshness(data.cloudflareRadar[layer].provider || data.providers?.cloudflare_radar)
  }
  const webLiveStatus = layerDisplayStatus('web')
  const ddosLiveStatus = layerDisplayStatus('ddos')
  // Map data is built per layer so each layer's arcs, highlights and
  // arrowheads can be shown, hidden, and styled independently.
  const webMapData = useMemo(
    () => buildCloudflareRadarMap(
      attackFilters.web !== false ? effectiveWebPairs : [],
      cloudflareCountryFeatures,
      projection,
      path,
      COUNTRY_NUMERIC,
      'web',
    ),
    [effectiveWebPairs, attackFilters.web, cloudflareCountryFeatures, projection, path],
  )
  const ddosMapData = useMemo(
    () => buildCloudflareRadarMap(
      attackFilters.ddos !== false ? effectiveDdosPairs : [],
      cloudflareCountryFeatures,
      projection,
      path,
      COUNTRY_NUMERIC,
      'ddos',
    ),
    [effectiveDdosPairs, attackFilters.ddos, cloudflareCountryFeatures, projection, path],
  )
  const cloudflareCountryCodeById = useMemo(
    () => new Map([...webMapData.countryCodeById, ...ddosMapData.countryCodeById]),
    [webMapData, ddosMapData],
  )
  // Travelling pulses run along real aggregate arcs only, only while a
  // layer is enabled, its file loaded, and its status is LIVE/RECENT.
  // There is no under-attack indicator on this page: pair values are
  // percentage shares, not absolute volumes, and no baseline exists to
  // define a defensible threshold — any threshold would be arbitrary.
  const cloudflarePulses = useMemo(() => {
    const liveArcs = [
      ...(webLayers.arcs && !historicalCf.web && (webLiveStatus === 'LIVE' || webLiveStatus === 'RECENT') ? webMapData.arcs : []),
      ...(ddosLayers.arcs && !historicalCf.ddos && (ddosLiveStatus === 'LIVE' || ddosLiveStatus === 'RECENT') ? ddosMapData.arcs : []),
    ]
    return arcPulsePlan(liveArcs, 12)
  }, [webLayers.arcs, ddosLayers.arcs, historicalCf, webLiveStatus, ddosLiveStatus, webMapData.arcs, ddosMapData.arcs])
  // Cloudflare map layers come from webLayers/ddosLayers (layer toggle +
  // file availability); DShield layers read attackFilters directly.

  // Country fills use verified source records only; destination geography
  // is unavailable from the currently permitted map feeds.
  const { countryPaths, nodes } = useMemo(() => {
    const visibleActivity = attackFilters.scanning ? sourceActivity : new Map()
    const countryPaths = COUNTRIES.features.map((f, i) => {
      const countryId = String(f.id)
      const info = sourceActivity.get(countryId)
      const fillInfo = visibleActivity.get(countryId)
      const name = f.properties?.name || ''
      const hoverInfo = {
        ...(info || { country: name, reports: 0, sources: 0, activityType: 'none' }),
        freshness: countrySourceFreshness,
        lastRefresh: countrySourceLastRefresh,
      }
      return (
        <path
          key={i}
          d={path(f) || undefined}
          className={`gtw__country gtw__country--${fillInfo?.intensity || 'none'}${selectedIntel?.type === 'country' && selectedIntel.id === countryId ? ' is-selected' : ''}`}
          style={countryFillStyle(visibleActivity, countryId)}
          onMouseEnter={() => setHovered(hoverInfo)}
          onMouseMove={(e) => onCountryHover(e, hoverInfo, name)}
          onMouseLeave={() => { setHovered(null); setChip(null) }}
          onClick={() => {
            if (performance.now() < suppressClickUntil.current) return
            setSelectedIntel({ type: 'country', id: String(f.id), name })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setSelectedIntel({ type: 'country', id: String(f.id), name })
            }
          }}
          onFocus={() => setHovered(hoverInfo)}
          onBlur={() => setHovered(null)}
          role="button"
          tabIndex={0}
          data-country-id={countryId}
          data-country-name={name}
          aria-label={`Open ${name} country intelligence`}
        >
          <title>
            {info
              ? `${name} — DShield source activity · ${info.reports.toLocaleString('en-US')} reports from ${info.sources} geolocated source IP${info.sources === 1 ? '' : 's'} · Last observed: ${info.lastObservedAt ? fmtUtcTimestamp(info.lastObservedAt) : `per-IP timestamp unavailable; feed updated ${fmtUtcTimestamp(countrySourceLastRefresh)}`}`
              : `${name} — no verified DShield source activity (${countrySourceFreshness.toLowerCase()} snapshot)`}
          </title>
        </path>
      )
    })
    const mapSources = attackFilters.scanning ? visibleSources : []
    const maxReports = Math.max(1, ...mapSources.map((s) => s.reports))
    const nodes = mapSources.map((s) => {
      const [x, y] = projection([s.lon, s.lat]) || [0, 0]
      const r = 2.5 + (Math.sqrt(s.reports / maxReports) * 5)
      return { ...s, id: s.ip, x, y, r, category: 'scanning' }
    })
    return { countryPaths, nodes }
  }, [sourceActivity, attackFilters.scanning, visibleSources, countrySourceFreshness, countrySourceLastRefresh, selectedIntel, path, projection])

  const countries = useMemo(() => {
    const totals = new Map()
    for (const s of data.sources) {
      const cur = totals.get(s.countryCode) || { country: s.country, code: s.countryCode, reports: 0, sources: 0 }
      cur.reports += s.reports
      cur.sources += 1
      totals.set(s.countryCode, cur)
    }
    return [...totals.values()].sort((a, b) => b.reports - a.reports).slice(0, 5)
  }, [data.sources])

  // Sidebar rankings from Cloudflare pair totals for the SELECTED interval
  // (historical snapshot when playback shows one). DShield's own ranking
  // stays separate above so the two sources are never confused.
  const cfOriginRanking = useMemo(
    () => rankCloudflareCountries(effectiveCloudflarePairs, 'origin').slice(0, 5),
    [effectiveCloudflarePairs],
  )
  const cfTargetRanking = useMemo(
    () => rankCloudflareCountries(effectiveCloudflarePairs, 'target').slice(0, 5),
    [effectiveCloudflarePairs],
  )
  // Rankings sum pair values across the currently ENABLED Cloudflare
  // layers only. When neither layer is enabled there is no ranking —
  // the disabled state, never the 'all' aggregate.
  const enabledCfLayerLabels = [
    ...(attackFilters.web !== false ? ['Web Attackers (WAF)'] : []),
    ...(attackFilters.ddos !== false ? ['DDoS Attackers (DDOS)'] : []),
  ]
  const cfRankingsDisabled = enabledCfLayerLabels.length === 0
  const sumCfOriginTotals = Math.max(1, cfOriginRanking.reduce((sum, c) => sum + c.total, 0))
  const sumCfTargetTotals = Math.max(1, cfTargetRanking.reduce((sum, c) => sum + c.total, 0))

  const sumCountryReports = Math.max(1, countries.reduce((sum, c) => sum + c.reports, 0))
  const maxPortRecords = Math.max(1, ...data.ports.map((p) => p.records))
  const totalReports = data.sources.reduce((sum, s) => sum + s.reports, 0)
  const sumViolationCount = Math.max(1, data.violations.reduce((sum, v) => sum + v.count, 0))
  const timelineStart = activeTimeWindow.start
  const timelineEnd = activeTimeWindow.end
  const timelineSpan = Math.max(1, timelineEnd - timelineStart)
  const timelineTicks = Array.from({ length: 7 }, (_, i) => timelineStart + (timelineSpan * i) / 6)
  const providerData = data.providers || {}
  const dshieldFeeds = providerData.dshield?.subfeeds || {}
  const dshieldDailyProvider = dshieldFeeds.daily_summary
  // Five timeline tracks, one per attack layer. Web/DDoS render their
  // layer's REAL timeseries serie points at the file's real aggregation
  // resolution (15m bins for 1h/6h, hourly for 24h, daily for 7d), with
  // no interpolation. Scanners render DShield DAILY points only — sparse.
  // Intruders/Anonymizers have no source, so their tracks show DISABLED.
  // NVD and KEV live in alerts + sidebar panels, not as tracks.
  const webTimeseries = cfTimeseriesByProduct.WAF || emptyTimeseries()
  const ddosTimeseries = cfTimeseriesByProduct.DDOS || emptyTimeseries()
  const layerTimeseries = { web: webTimeseries, ddos: ddosTimeseries }
  const timelineRows = TIMELINE_TRACKS
    .filter((track) => track.key === 'web' || track.key === 'ddos'
      ? timeseriesTrackVisible(track.key, attackFilters)
      : timelineTrackVisible(track.key, attackFilters))
    .map((track) => {
      let events = []
      let status = 'NO DATA'
      let resolution = track.resolution
      if (track.key === 'web' || track.key === 'ddos') {
        const series = layerTimeseries[track.key]
        events = series.points
        status = cfHistoryGap[track.key]
          ? 'NO HISTORY'
          : timeseriesStatusLabel({ timeseriesStatus: series.status, points: series.points })
        resolution = series.aggInterval || cloudflareAggInterval(cfInterval)
      } else if (track.key === 'scanners') {
        events = data.timeline.dshield
        const eventsInWindow = events.filter((event) =>
          event.timestamp >= timelineStart && event.timestamp <= timelineEnd,
        )
        status = timelineSourceStatus(dshieldDailyProvider, eventsInWindow, timelineNow)
      } else {
        // Intruders / Anonymizers: no enabled source — disabled track.
        status = 'DISABLED'
      }
      return { ...track, events, status, resolution }
    })
  const hasTimelineEvents = timelineRows.some((track) =>
    track.events.some((event) => event.timestamp >= timelineStart && event.timestamp <= timelineEnd),
  )
  // Alerts derived ONLY from data already in the snapshots. Cloudflare
  // pair-change alerts are computed per layer against that layer's
  // previous retained snapshot; without one there is simply no such
  // alert for that layer (see the panel note).
  const threatAlerts = useMemo(() => {
    const base = buildThreatAlerts({
      nvd: data.nvdRecent,
      kev: data.kev?.recent || [],
      dailySummary: data.dailySummary,
    })
    const webAlerts = buildThreatAlerts({
      cloudflareCurrentPairs: attackFilters.web !== false ? effectiveWebPairs : [],
      cloudflarePreviousPairs: cfPreviousPairs.web,
      cloudflareAsOf: effectiveLayerGeneratedAt.web,
      cloudflareLayer: 'web',
      cloudflareLayerLabel: 'Web Attackers (WAF)',
    })
    const ddosAlerts = buildThreatAlerts({
      cloudflareCurrentPairs: attackFilters.ddos !== false ? effectiveDdosPairs : [],
      cloudflarePreviousPairs: cfPreviousPairs.ddos,
      cloudflareAsOf: effectiveLayerGeneratedAt.ddos,
      cloudflareLayer: 'ddos',
      cloudflareLayerLabel: 'DDoS Attackers (DDOS)',
    })
    return [...base, ...webAlerts, ...ddosAlerts].sort((a, b) => b.timestamp - a.timestamp)
  }, [data.nvdRecent, data.kev, data.dailySummary, attackFilters.web, attackFilters.ddos, effectiveWebPairs, effectiveDdosPairs, cfPreviousPairs, effectiveLayerGeneratedAt])
  // Attack vectors, computed ONLY from per-mitigation-product timeseries
  // totals (see computeAttackVectorsFromTimeseries). DShield ports are
  // never converted into flood values.
  const attackVectors = useMemo(() => computeAttackVectorsFromTimeseries(
    CLOUDFLARE_PRODUCTS.filter((product) => product !== 'all').map((product) => ({
      product,
      label: CLOUDFLARE_PRODUCT_LABELS[product],
      points: cfTimeseriesByProduct[product]?.points || [],
      normalization: cfTimeseriesByProduct[product]?.normalization || null,
    })),
  ), [cfTimeseriesByProduct])

  useEffect(() => {
    if (!isPlaying) return undefined
    const timer = setInterval(() => {
      const next = Math.min(
        timelineEnd,
        (playheadRef.current ?? timelineStart) + Math.max(1000, timelineSpan / 40),
      )
      playheadRef.current = next
      setPlayhead(next)
      if (next >= timelineEnd) setIsPlaying(false)
    }, 250)
    return () => clearInterval(timer)
  }, [isPlaying, timelineStart, timelineEnd, timelineSpan])

  useEffect(() => {
    if (!selectedIntel) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedIntel(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedIntel])

  const updateTimelineBound = (bound, value) => {
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return
    const next = { ...activeTimeWindow, [bound]: timestamp }
    if (next.start >= next.end || next.end > timelineNow) return
    setTimeWindow(next)
    playheadRef.current = null
    setPlayhead(null)
    setIsPlaying(false)
  }

  const toggleAttackFilter = (key) => {
    setAttackFilters((current) => ({ ...current, [key]: !current[key] }))
  }

  const categoryCounts = {
    scanning: visibleSources.length,
    web: effectiveWebPairs.length,
    ddos: effectiveDdosPairs.length,
    intruders: 0,
    anonymizers: 0,
  }
  // Per-layer provider freshness: each Cloudflare layer reports its own
  // file's provider (upstream lastUpdated + status); the snapshot's
  // cloudflare_radar provider is the fallback where a layer has none.
  const freshnessItems = [
    { key: 'dshield-sources', label: 'DShield sources', provider: dshieldFeeds.source_locations },
    { key: 'dshield-ports', label: 'DShield ports', provider: dshieldFeeds.top_ports },
    { key: 'dshield-reports', label: 'DShield reports', provider: dshieldFeeds.daily_summary },
    { key: 'dshield-infocon', label: 'DShield InfoCon', provider: dshieldFeeds.infocon },
    { key: 'ipwho', label: 'ipwho.is geolocation', provider: providerData.ip_geolocation },
    { key: 'nvd', label: 'NIST NVD', provider: providerData.nvd },
    { key: 'kev', label: 'CISA KEV', provider: providerData.cisa_kev },
    { key: 'cloudflare-waf', label: 'Cloudflare Radar · Web (WAF)', layer: 'web', provider: data.cloudflareRadar.web.provider || providerData.cloudflare_radar },
    { key: 'cloudflare-ddos', label: 'Cloudflare Radar · DDoS (DDOS)', layer: 'ddos', provider: data.cloudflareRadar.ddos.provider || providerData.cloudflare_radar },
    { key: 'threatfox', label: 'ThreatFox', provider: providerData.threatfox },
    { key: 'recent-breaches', label: 'Recent Breaches', provider: providerData.recent_breaches },
  ]
  const selectedCountryInfo = selectedIntel?.type === 'country'
    ? sourceActivity.get(selectedIntel.id)
    : null
  const selectedCountrySources = selectedIntel?.type === 'country'
    ? visibleSources
      .filter((source) => COUNTRY_NUMERIC[source.countryCode] === selectedIntel.id)
      .sort((a, b) => b.reports - a.reports)
      .slice(0, 8)
    : []
  const selectedCountryAlpha2 = selectedIntel?.type === 'country'
    ? cloudflareCountryCodeById.get(selectedIntel.id)
    : null
  // Country pair details are per layer — the same country can have
  // different pairs in the WAF and DDoS datasets.
  const selectedWebPairs = selectedCountryAlpha2
    ? pairsForCountry(attackFilters.web !== false ? effectiveWebPairs : [], selectedCountryAlpha2)
    : { outbound: [], inbound: [] }
  const selectedDdosPairs = selectedCountryAlpha2
    ? pairsForCountry(attackFilters.ddos !== false ? effectiveDdosPairs : [], selectedCountryAlpha2)
    : { outbound: [], inbound: [] }
  const selectedSource = selectedIntel?.type === 'source'
    ? data.sources.find((source) => source.ip === selectedIntel.id)
    : null
  const selectedCloudflareArc = selectedIntel?.type === 'cloudflare-pair'
    ? [...webMapData.arcs, ...ddosMapData.arcs].find((arc) => arc.key === selectedIntel.id)
    : null
  const selectedArcLayer = selectedCloudflareArc?.layer === 'ddos' ? 'ddos' : 'web'
  const selectedArcMeta = effectiveLayerMeta[selectedArcLayer]
  const selectedArcGeneratedAt = effectiveLayerGeneratedAt[selectedArcLayer]
  const selectedArcWindow = effectiveLayerWindow[selectedArcLayer]
  const selectedArcShift = effectiveLayerShift[selectedArcLayer]
  const selectedPort = selectedIntel?.type === 'port'
    ? data.ports.find((port) => String(port.port) === selectedIntel.id) || null
    : null
  const selectedPortRank = selectedPort ? data.ports.findIndex((port) => port.port === selectedPort.port) + 1 : null

  // One layer's map rendering: country highlights + directional arcs
  // with arrowheads, styled distinctly per layer (Web solid, DDoS
  // dashed) so the two Cloudflare datasets stay distinguishable in
  // monochrome. A layer renders only when its toggle is on and its file
  // loaded; each arc carries its layer for the pair-detail panel.
  const renderCloudflareLayer = (layer, mapData, visibility, liveStatus) => (
    <>
      {visibility.highlights && (
        <g className="gtw__cf-country-highlights" pointerEvents="none">
          {[...mapData.roles].map(([countryId, role]) => {
            const country = mapData.countryFeatureById.get(countryId)
            if (!country) return null
            const d = path(country) || undefined
            return (
              <g key={`radar-country-${layer}-${countryId}`}>
                {role.originValue !== undefined && (
                  <path
                    d={d}
                    className={`gtw__cf-origin gtw__cf-origin--${layer}`}
                    fillOpacity={role.originOpacity}
                  >
                    <title>{`${country.properties?.name} · ${CLOUDFLARE_LAYER_LABELS[layer]} origin country · ${role.originValue.toFixed(2)} summed pair share`}</title>
                  </path>
                )}
                {role.targetValue !== undefined && (
                  <path
                    d={d}
                    className={`gtw__cf-target gtw__cf-target--${layer}`}
                    fillOpacity={role.targetOpacity}
                  >
                    <title>{`${country.properties?.name} · ${CLOUDFLARE_LAYER_LABELS[layer]} target country · ${role.targetValue.toFixed(2)} summed pair share`}</title>
                  </path>
                )}
              </g>
            )
          })}
        </g>
      )}
      {visibility.arcs && mapData.arcs.map((arc) => (
        <g key={arc.key}>
          <path
            d={arc.d}
            className="gtw__cf-arc-hit"
            role="button"
            tabIndex={0}
            aria-label={`Inspect aggregated Cloudflare Radar pair (${CLOUDFLARE_LAYER_LABELS[layer]}) from ${arc.originCountryName} to ${arc.targetCountryName}, ${arc.value}%`}
            onClick={(event) => {
              event.stopPropagation()
              setSelectedIntel({ type: 'cloudflare-pair', id: arc.key })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                setSelectedIntel({ type: 'cloudflare-pair', id: arc.key })
              }
            }}
          >
            <title>{`${arc.originCountryName} → ${arc.targetCountryName} · ${arc.value}% · ${CLOUDFLARE_LAYER_LABELS[layer]}`}</title>
          </path>
          <path
            id={arc.pathId}
            d={arc.d}
            markerEnd={(liveStatus === 'LIVE' || liveStatus === 'RECENT') && !historicalCf[layer] ? 'url(#gtw-cf-arrow)' : undefined}
            className={`gtw__cf-arc gtw__cf-arc--${layer}${liveStatus !== 'LIVE' && liveStatus !== 'RECENT' ? ' gtw__cf-arc--static' : ''}${selectedIntel?.type === 'cloudflare-pair' && selectedIntel.id === arc.key ? ' is-selected' : ''}`}
            style={{
              strokeWidth: selectedIntel?.type === 'cloudflare-pair' && selectedIntel.id === arc.key
                ? Math.max(arc.strokeWidth, 3)
                : arc.strokeWidth,
              opacity: selectedIntel?.type === 'cloudflare-pair' && selectedIntel.id === arc.key
                ? 1
                : arc.opacity,
            }}
            aria-hidden="true"
          />
        </g>
      ))}
    </>
  )

  return (
    <div
      className={`gtw${railCollapsed ? ' gtw--rail-hidden' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSelectedIntel(null)
      }}
    >
      {/* --- The stage: full-bleed dark map + right rail --- */}
      <div className="gtw__stage">
        <div className="gtw__mapcol">
          <div className="gtw__mapwrap" ref={mapWrapRef} aria-label="World map of most-reported attacking source addresses">
            <svg
              ref={svgRef}
              onWheel={onMapWheel}
              onPointerDown={onMapPointerDown}
              onPointerMove={onMapPointerMove}
              onPointerUp={onMapPointerUp}
              onPointerCancel={onMapPointerUp}
              className={`gtw__svg${isPanning ? ' is-panning' : ''}`}
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              preserveAspectRatio="xMidYMid slice"
              role="group"
              aria-label="Interactive world map of DShield-reported source locations. No destination routes are inferred."
            >
              <defs>
                <pattern id="gtw-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                  <path d="M 36 0 H 0 V 36" className="gtw__map-grid" />
                </pattern>
                <marker id="gtw-cf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#FFFFFF" />
                </marker>
              </defs>
              <g
                className="gtw__map-layers"
                transform={`translate(${mapTransform.x} ${mapTransform.y}) scale(${mapTransform.scale})`}
                style={{ transition: isPanning ? 'none' : 'transform 180ms ease-out' }}
              >
                <rect width={MAP_W} height={MAP_H} fill="url(#gtw-grid)" />
                <path d={graticulePath || undefined} className="gtw__graticule" />
                {countryPaths}
                {renderCloudflareLayer('web', webMapData, webLayers, webLiveStatus)}
                {renderCloudflareLayer('ddos', ddosMapData, ddosLayers, ddosLiveStatus)}
                {cloudflarePulses.length > 0 && (
                  <g className="gtw__cf-pulses" pointerEvents="none" aria-hidden="true">
                    {cloudflarePulses.map((pulse) => (
                      <circle key={pulse.key} r={2.4} className="gtw__cf-pulse">
                        <animateMotion dur={`${pulse.durationSec}s`} repeatCount="indefinite">
                          <mpath href={`#${pulse.pathId}`} />
                        </animateMotion>
                      </circle>
                    ))}
                  </g>
                )}
                {nodes.map((n) => (
                  <g
                    key={n.ip}
                    className={`gtw__node${selectedIntel?.type === 'source' && selectedIntel.id === n.ip ? ' is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    data-source-id={n.ip}
                    aria-label={`Inspect DShield source ${n.ip}, ${n.reports.toLocaleString('en-US')} reports, ${n.country}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (performance.now() < suppressClickUntil.current) return
                      setSelectedIntel({ type: 'source', id: n.ip })
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        setSelectedIntel({ type: 'source', id: n.ip })
                      }
                    }}
                  >
                    <title>{`${n.ip} · ${n.country}${n.city ? `, ${n.city}` : ''} · ${n.reports.toLocaleString('en-US')} DShield reports`}</title>
                    <circle cx={n.x} cy={n.y} r={n.r + 6} className="gtw__pulse" />
                    <circle cx={n.x} cy={n.y} r={n.r} className="gtw__dot" />
                  </g>
                ))}
              </g>
            </svg>

            <div className="gtw__map-controls" aria-label="Map controls">
              <button type="button" onClick={() => zoomMap(1.35)} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => zoomMap(1 / 1.35)} aria-label="Zoom out">−</button>
              <button type="button" onClick={() => setMapTransform({ x: 0, y: 0, scale: 1 })}>Reset view</button>
            </div>
            <span className="gtw__zoom-level" aria-live="polite">{Math.round(mapTransform.scale * 100)}%</span>

            {(historicalMapFilterActive || historicalCf.web || historicalCf.ddos || cfHistoryGap.web || cfHistoryGap.ddos) && (
              <div className="gtw__map-history-statuses" role="status">
                {historicalMapFilterActive && (
                  <p className="gtw__map-history-status">
                    {visibleSources.length
                      ? `Showing ${visibleSources.length} DShield locations with timestamps in the selected window.`
                      : 'No timestamped DShield source locations exist for this time window; current snapshot locations are hidden.'}
                  </p>
                )}
                {(historicalCf.web || historicalCf.ddos) && (
                  <p className="gtw__map-history-status">
                    Historical Cloudflare snapshot
                    {historicalCf.web ? ` Web ${fmtUtcTimestamp(historicalCf.web.generatedAt)}` : ''}
                    {historicalCf.ddos ? ` · DDoS ${fmtUtcTimestamp(historicalCf.ddos.generatedAt)}` : ''}
                    {' '}— pairs, highlights, arcs and rankings are from the retained snapshot(s), not live data. Select “Latest snapshot” to return to live data.
                  </p>
                )}
                {cfHistoryGap.web && (
                  <p className="gtw__map-history-status">
                    No retained Web Attackers (WAF) snapshot exists at or before {fmtUtcTimestamp(playhead)} for the {cfInterval} interval — that layer is empty rather than showing current data as history.
                  </p>
                )}
                {cfHistoryGap.ddos && (
                  <p className="gtw__map-history-status">
                    No retained DDoS Attackers (DDOS) snapshot exists at or before {fmtUtcTimestamp(playhead)} for the {cfInterval} interval — that layer is empty rather than showing current data as history.
                  </p>
                )}
              </div>
            )}

            {selectedIntel && (
              <aside className="gtw__intel-panel" role="dialog" aria-modal="false" aria-labelledby="gtw-intel-title">
                <div className="gtw__intel-panel-head">
                  <h2 id="gtw-intel-title">                  {selectedIntel.type === 'country'
                    ? selectedIntel.name
                    : selectedIntel.type === 'cloudflare-pair'
                      ? 'Cloudflare Radar attack pair'
                      : selectedIntel.type === 'port'
                        ? `Port ${selectedIntel.id}`
                        : selectedSource?.ip || selectedIntel.id}</h2>
                  <button type="button" onClick={() => setSelectedIntel(null)} aria-label="Close country intelligence panel">×</button>
                </div>
                {selectedIntel.type === 'country' ? (
                  <>
                    <dl>
                      <dt>Source type</dt><dd>DShield geolocated source IP reports</dd>
                      <dt>Verified report count</dt><dd>{(selectedCountryInfo?.reports || 0).toLocaleString('en-US')}</dd>
                      <dt>Geolocated source IPs</dt><dd>{selectedCountryInfo?.sources || 0}</dd>
                      <dt>Last observation</dt>
                      <dd>{selectedCountryInfo?.lastObservedAt
                        ? fmtUtcTimestamp(selectedCountryInfo.lastObservedAt)
                        : `Not supplied per IP · feed refreshed ${fmtUtcTimestamp(countrySourceLastRefresh)}`}</dd>
                      <dt>Feed status</dt><dd>{countrySourceFreshness}</dd>
                    </dl>
                    {selectedCountrySources.length > 0 ? (
                      <ol className="gtw__intel-sources">
                        {selectedCountrySources.map((source) => (
                          <li key={source.ip}>
                            <button type="button" onClick={() => setSelectedIntel({ type: 'source', id: source.ip })}>
                              <span>{source.ip}{source.city ? ` · ${source.city}` : ''}</span>
                              <strong>{source.reports.toLocaleString('en-US')} reports</strong>
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="gtw__aside-note">No verified DShield source locations for this country in the selected view.</p>
                    )}
                    <section className="gtw__intel-radar">
                      <h3>Cloudflare Radar · aggregated Layer 7 · {cfInterval}</h3>
                      {selectedCountryAlpha2 ? (
                        <>
                          <h4>Web Attackers (WAF)</h4>
                          {historicalCf.web && (
                            <p>Historical snapshot {fmtUtcTimestamp(historicalCf.web.generatedAt)} — pairs below are from that retained snapshot.</p>
                          )}
                          {cfHistoryGap.web && (
                            <p>No retained Web Attackers snapshot exists at or before the playhead — this layer is empty rather than showing current data as history.</p>
                          )}
                          <p>Outbound pairs in returned top 50: {selectedWebPairs.outbound.length}</p>
                          <ul>
                            {selectedWebPairs.outbound.map((pair) => (
                              <li key={`web-out:${pair.targetCountryAlpha2}`}>
                                <span>To {pair.targetCountryName}</span>
                                <strong>{pair.value}%</strong>
                              </li>
                            ))}
                          </ul>
                          <p>Inbound pairs in returned top 50: {selectedWebPairs.inbound.length}</p>
                          <ul>
                            {selectedWebPairs.inbound.map((pair) => (
                              <li key={`web-in:${pair.originCountryAlpha2}`}>
                                <span>From {pair.originCountryName}</span>
                                <strong>{pair.value}%</strong>
                              </li>
                            ))}
                          </ul>
                          <h4>DDoS Attackers (DDOS)</h4>
                          {historicalCf.ddos && (
                            <p>Historical snapshot {fmtUtcTimestamp(historicalCf.ddos.generatedAt)} — pairs below are from that retained snapshot.</p>
                          )}
                          {cfHistoryGap.ddos && (
                            <p>No retained DDoS Attackers snapshot exists at or before the playhead — this layer is empty rather than showing current data as history.</p>
                          )}
                          <p>Outbound pairs in returned top 50: {selectedDdosPairs.outbound.length}</p>
                          <ul>
                            {selectedDdosPairs.outbound.map((pair) => (
                              <li key={`ddos-out:${pair.targetCountryAlpha2}`}>
                                <span>To {pair.targetCountryName}</span>
                                <strong>{pair.value}%</strong>
                              </li>
                            ))}
                          </ul>
                          <p>Inbound pairs in returned top 50: {selectedDdosPairs.inbound.length}</p>
                          <ul>
                            {selectedDdosPairs.inbound.map((pair) => (
                              <li key={`ddos-in:${pair.originCountryAlpha2}`}>
                                <span>From {pair.originCountryName}</span>
                                <strong>{pair.value}%</strong>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p>No Cloudflare Radar pair was matched to this country in the returned data.</p>
                      )}
                      <small>Values are provider-reported percentages, not attack counts or individual packet records.</small>
                    </section>
                  </>
                ) : selectedIntel.type === 'cloudflare-pair' ? (
                  selectedCloudflareArc ? (
                    <>
                      <dl>
                        <dt>Provider</dt><dd>Cloudflare Radar · aggregated Layer 7</dd>
                        <dt>Origin</dt><dd>{selectedCloudflareArc.originCountryName} ({selectedCloudflareArc.originCountryAlpha2})</dd>
                        <dt>Target</dt><dd>{selectedCloudflareArc.targetCountryName} ({selectedCloudflareArc.targetCountryAlpha2})</dd>
                        <dt>Reported percentage</dt><dd>{selectedCloudflareArc.value}%</dd>
                        <dt>Layer</dt><dd>{CLOUDFLARE_LAYER_LABELS[selectedArcLayer]} ({selectedArcLayer === 'web' ? 'mitigationProduct=WAF' : 'mitigationProduct=DDOS'})</dd>
                        <dt>Interval</dt><dd>{cfInterval}{historicalCf[selectedArcLayer] ? ` · historical snapshot ${fmtUtcTimestamp(historicalCf[selectedArcLayer].generatedAt)}` : ''}</dd>
                        <dt>Snapshot generated</dt><dd>{fmtUtcTimestamp(selectedArcGeneratedAt)}</dd>
                        <dt>Upstream updated</dt><dd>{fmtUtcTimestamp(selectedArcMeta?.lastUpdated)}</dd>
                        <dt>Range / units</dt>
                        <dd>{formatCloudflareDateRange(selectedArcMeta?.dateRange)} · {formatCloudflareUnits(selectedArcMeta?.units)}</dd>
                        {Number.isFinite(selectedArcShift) && selectedArcShift !== 0 && (
                          <>
                            <dt>Window shift</dt>
                            <dd>
                              Cloudflare returned the latest fully aggregated window, which starts {Math.abs(selectedArcShift)} min {selectedArcShift > 0 ? 'earlier' : 'later'} than the requested window
                              {selectedArcWindow ? ` (${fmtUtcTimestamp(selectedArcWindow.dateStart)} – ${fmtUtcTimestamp(selectedArcWindow.dateEnd)})` : ''}. The range above is the actual returned window.
                            </dd>
                          </>
                        )}
                        <dt>Status</dt><dd>{layerDisplayStatus(selectedArcLayer)}</dd>
                      </dl>
                      <p className="gtw__aside-note">This is an aggregated country pair, not an individual attack, packet, or DShield route. Pulses on the map are aggregate motion along real arcs, not individual packets.</p>
                    </>
                  ) : <p className="gtw__aside-note">This pair is no longer present in the latest Cloudflare Radar snapshot.</p>
                ) : selectedIntel.type === 'port' ? (
                  selectedPort ? (
                    <dl>
                      <dt>Port</dt><dd>{selectedPort.port}</dd>
                      <dt>Protocol</dt><dd>{verifiedPortProtocol(selectedPort) || 'not verified'}</dd>
                      <dt>Service</dt><dd>{PORT_NAMES[selectedPort.port] || 'Service'}</dd>
                      <dt>Reports</dt><dd>{selectedPort.records.toLocaleString('en-US')}</dd>
                      <dt>Ranking</dt><dd>#{selectedPortRank} of {data.ports.length} most-probed ports</dd>
                      <dt>Data date</dt><dd>{selectedPort.date || 'not supplied by source'}</dd>
                      <dt>Source</dt><dd>DShield top ports (daily resolution)</dd>
                    </dl>
                  ) : <p className="gtw__aside-note">This port is no longer present in the latest snapshot.</p>
                ) : (
                  selectedSource ? (
                    <dl>
                      <dt>Source type</dt><dd>DShield top source IP location</dd>
                      <dt>Country / city</dt><dd>{selectedSource.country}{selectedSource.city ? ` · ${selectedSource.city}` : ''}</dd>
                      <dt>Verified reports</dt><dd>{selectedSource.reports.toLocaleString('en-US')}</dd>
                      <dt>Coordinates</dt><dd>{selectedSource.lat.toFixed(4)}, {selectedSource.lon.toFixed(4)}</dd>
                      <dt>Last observation</dt>
                      <dd>{sourceObservedAt(selectedSource) !== null
                        ? fmtUtcTimestamp(sourceObservedAt(selectedSource))
                        : `Not supplied per IP · feed refreshed ${fmtUtcTimestamp(countrySourceLastRefresh)}`}</dd>
                      <dt>Feed status</dt><dd>{countrySourceFreshness}</dd>
                    </dl>
                  ) : <p className="gtw__aside-note">This source is no longer present in the latest snapshot.</p>
                )}
              </aside>
            )}

            {/* Hover chip: the country's name, pinned to the cursor. */}
            {chip && (
              <span className="gtw__hover-chip" style={{ left: chip.x, top: chip.y }} aria-hidden="true">
                {chip.name}
              </span>
            )}

            {/* Brand block, top-left over the map */}
            <div className="gtw__brand">
              <span className="gtw__brand-name">Offline Theory</span>
              <span className="gtw__brand-sub">Live Cyber Threat Map</span>
              <span className="gtw__brand-note">Public feeds · refresh every 15 minutes</span>
              <span className="gtw__brand-status" role="status">
                <span className={`gtw__live-dot ${loading ? 'is-loading' : ''}`} aria-hidden="true" />
                {loading ? 'Loading the latest snapshot…' : `Snapshot · updated ${updatedAt ? fmtTime(updatedAt) : '—'} UTC`}
                {data.infocon && (
                  <span className="gtw__infocon"> · InfoCon: <strong>{data.infocon}</strong></span>
                )}
              </span>
            </div>

            {/* Callout button, top-centre */}
            <button type="button" className="gtw__cta" onClick={() => load(true)} disabled={refreshing || loading} title="Check for the latest published snapshot">
              Live Cyber Threat Map
            </button>

            {/* Top-right buttons */}
            <div className="gtw__top-actions">
              <span className="gtw__live-btn" role="status">
                <span className={`gtw__live-dot ${loading ? 'is-loading' : ''}`} aria-hidden="true" />
                Snapshot
              </span>
              <button type="button" className="gtw__refresh" onClick={() => load(true)} disabled={refreshing || loading}>
                {refreshing ? 'Checking…' : 'Check for updates'}
              </button>
            </div>

            <p className="gtw__map-hover" aria-live="polite">
              {hovered
                ? hovered.activityType === 'source'
                  ? `${hovered.country} — DShield source reports: ${hovered.reports.toLocaleString('en-US')} · ${hovered.sources} source IPs · last observed ${hovered.lastObservedAt ? fmtUtcTimestamp(hovered.lastObservedAt) : `per-IP time unavailable; feed updated ${fmtUtcTimestamp(hovered.lastRefresh)}`} · ${hovered.freshness}`
                  : `${hovered.country} — no verified DShield source activity · source feed ${hovered.freshness} · updated ${fmtUtcTimestamp(hovered.lastRefresh)}`
                : 'Hover a country for its figures'}
            </p>

            <div className="gtw__map-activity-legend" aria-label="Country shading: verified DShield source activity">
              <span className="gtw__map-activity-legend-title">DShield source reports · sqrt-scaled</span>
              <span><i className="gtw__map-activity-swatch gtw__map-activity-swatch--highest" />Highest</span>
              <span><i className="gtw__map-activity-swatch gtw__map-activity-swatch--high" />High</span>
              <span><i className="gtw__map-activity-swatch gtw__map-activity-swatch--moderate" />Moderate</span>
              <span><i className="gtw__map-activity-swatch gtw__map-activity-swatch--low" />Low</span>
              <span><i className="gtw__map-activity-swatch gtw__map-activity-swatch--none" />No verified source activity</span>
              <span><i className="gtw__radar-swatch gtw__radar-swatch--origin" />Web origins (WAF, solid)</span>
              <span><i className="gtw__radar-swatch gtw__radar-swatch--target" />Web targets (WAF, solid)</span>
              <span><i className="gtw__radar-swatch gtw__radar-swatch--arc" />Web pair arcs (WAF, solid)</span>
              <span><i className="gtw__radar-swatch gtw__radar-swatch--arc-ddos" />DDoS pair arcs (DDOS, dashed)</span>
              <span><i className="gtw__radar-swatch gtw__radar-swatch--origin-ddos" />DDoS origins/targets (DDOS, outlined)</span>
              <small>Cloudflare Radar — Aggregated Layer 7 attack intelligence. Web Attackers use the WAF dataset only; DDoS Attackers use the DDOS dataset only.</small>
              <small>DShield source counts are separate; arc dashes and travelling pulses are aggregate motion, not individual events or packets. Arrowheads show origin → target direction.</small>
            </div>

            {/* Left column over the map: attack types + threat alerts */}
            <div className="gtw__overlay" aria-label="Attack types and threat alerts">
              <section className="gtw__panel">
                <h2 className="gtw__panel-title">Attack types</h2>
                <ul className="gtw__legend">
                  {CATEGORIES.map((c) => (
                    <li key={c.key}>
                      <button
                        type="button"
                        className={`gtw__filter${attackFilters[c.key] ? ' is-active' : ''}${c.noSource ? ' gtw__filter--no-source' : ''}`}
                        aria-pressed={attackFilters[c.key]}
                        onClick={() => toggleAttackFilter(c.key)}
                      >
                        <span className="gtw__legend-check" style={{ borderColor: c.color, color: c.color }} aria-hidden="true">
                          {attackFilters[c.key] ? '✓' : ''}
                        </span>
                        <span>
                          <strong style={{ color: c.color }}>{c.label}{c.noSource ? ' · no enabled source' : ''}</strong>
                          <small>
                            {c.key === 'scanning'
                              ? `${categoryCounts[c.key].toLocaleString('en-US')} verified DShield locations`
                              : c.key === 'web'
                                ? `${categoryCounts[c.key].toLocaleString('en-US')} aggregated country pairs · ${cfInterval} interval · WAF dataset${historicalCf.web ? ' · historical snapshot' : ''}${cfHistoryGap.web ? ' · no historical data for this time' : ''}${!attackFilters.web ? ' · hidden by filter' : ''}`
                                : c.key === 'ddos'
                                  ? `${categoryCounts[c.key].toLocaleString('en-US')} aggregated country pairs · ${cfInterval} interval · DDOS dataset${historicalCf.ddos ? ' · historical snapshot' : ''}${cfHistoryGap.ddos ? ' · no historical data for this time' : ''}${!attackFilters.ddos ? ' · hidden by filter' : ''}`
                                  : c.noSource
                                    ? 'No enabled source — toggling this only shows or hides this notice; nothing is plotted.'
                                    : `${categoryCounts[c.key].toLocaleString('en-US')} provider records · no verified map coordinates`}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="gtw__aside-note">
                  Only DShield source locations are geolocated as points. Cloudflare Radar supplies aggregated origin-to-target country pairs (WAF and DDoS datasets separately), not individual routes. Country fills follow the active layers: DShield shading plus Web/DDoS origin and target highlights — disabling a layer removes its fills, arcs, highlights, timeline track and statistics contribution.
                </p>
                {!attackFilters.web && (
                  <p className="gtw__aside-note">Web Attackers hidden — enable the Web Attackers filter to show its arcs, country highlights, timeline track and ranking contribution.</p>
                )}
                {!attackFilters.ddos && (
                  <p className="gtw__aside-note">DDoS Attackers hidden — enable the DDoS Attackers filter to show its arcs, country highlights, timeline track and ranking contribution.</p>
                )}
                {attackFilters.intruders && (
                  <p className="gtw__aside-note">Intruders: no enabled source exists for this map, so nothing is plotted for this layer and no activity is invented. An event-level intrusion/IDS feed is required to enable it.</p>
                )}
                {attackFilters.anonymizers && (
                  <p className="gtw__aside-note">Anonymizers: no enabled source exists for this map, so nothing is plotted for this layer and no activity is invented. A Tor/anonymizer-exit-node feed is required to enable it.</p>
                )}
              </section>

              <section className="gtw__panel gtw__wire" aria-labelledby="wire-h">
                <h2 id="wire-h" className="gtw__panel-title">Threat alerts</h2>
                {threatAlerts.length === 0 && (
                  <p className="gtw__empty">No provider-backed alerts in the latest snapshot.</p>
                )}
                <ol className="gtw__wire-list">
                  {threatAlerts.slice(0, 6).map((alert) => (
                    <li key={alert.id}>
                      <a href={alert.href} target="_blank" rel="noopener noreferrer">{alert.title}</a>
                      <span className="gtw__wire-text">{alert.detail}</span>
                      <span className="meta">{alert.provider} · {fmtUtcTimestamp(alert.timestamp)}</span>
                    </li>
                  ))}
                </ol>
                {cfPreviousPairs.web === null && cfPreviousPairs.ddos === null && (
                  <p className="gtw__aside-note">No retained prior Cloudflare snapshot is available to compare against, so no Cloudflare pair-change alert is shown.</p>
                )}
                <p className="gtw__aside-note">
                  ThreatFox: <a href="https://threatfox.abuse.ch/" target="_blank" rel="noopener noreferrer">abuse.ch ThreatFox</a>
                  {' '}is disabled pending commercial-use eligibility or a paid subscription — no ThreatFox indicators are shown.
                  Recent Breaches is not included pending permission for this site&rsquo;s intended use.
                </p>
              </section>
            </div>

            {/* Vertical collapse tab on the right edge of the map */}
            <button
              type="button"
              className="gtw__collapse-tab"
              onClick={() => setRailCollapsed((v) => !v)}
              aria-expanded={!railCollapsed}
              aria-controls="gtw-rail"
            >
              {railCollapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>

          {/* Timeline strip along the bottom of the map */}
          {timelineCollapsed ? (
            <div className="gtw__timeline gtw__timeline--collapsed">
              <span className="gtw__timeline-collapsed-label">Threat activity · selected window collapsed</span>
              <button type="button" className="gtw__timeline-show" onClick={() => setTimelineCollapsed(false)}>
                Show timeline
              </button>
            </div>
          ) : (
            <section className="gtw__timeline" aria-label="Interactive threat activity timeline">
              <div className="gtw__timeline-head">
                <h3 className="gtw__panel-title">Threat activity · selected source window</h3>
                <button
                  type="button"
                  className="gtw__timeline-collapse"
                  onClick={() => setTimelineCollapsed(true)}
                  aria-label="Collapse timeline"
                >
                  ✕ Collapse
                </button>
              </div>
              <div className="gtw__timeline-controls">
                <label>
                  From
                  <input
                    type="datetime-local"
                    value={toLocalDateTimeInput(timelineStart)}
                    max={toLocalDateTimeInput(timelineNow)}
                    onChange={(event) => updateTimelineBound('start', event.target.value)}
                  />
                </label>
                <label>
                  To
                  <input
                    type="datetime-local"
                    value={toLocalDateTimeInput(timelineEnd)}
                    max={toLocalDateTimeInput(timelineNow)}
                    onChange={(event) => updateTimelineBound('end', event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setTimeWindow(null)
                    playheadRef.current = null
                    setPlayhead(null)
                    setIsPlaying(false)
                    historicalCfFetchedRef.current = { web: null, ddos: null }
                    setHistoricalCf({ web: null, ddos: null })
                  }}
                  aria-label="Return map to the latest source snapshot"
                >
                  Latest snapshot
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isPlaying) {
                      setIsPlaying(false)
                    } else {
                      if (playhead === null || playhead >= timelineEnd) {
                        playheadRef.current = timelineStart
                        setPlayhead(timelineStart)
                      }
                      if (!timeWindow) setTimeWindow(activeTimeWindow)
                      setIsPlaying(true)
                    }
                  }}
                  disabled={!hasTimelineEvents}
                  aria-label={isPlaying ? 'Pause timeline playback' : 'Play timeline'}
                >
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <input
                  className="gtw__timeline-scrubber"
                  type="range"
                  min={timelineStart}
                  max={timelineEnd}
                  step={Math.max(1, Math.floor(timelineSpan / 500))}
                  value={playhead ?? timelineStart}
                  disabled={!hasTimelineEvents}
                  aria-label="Timeline playback position"
                  onChange={(event) => {
                    setTimeWindow(activeTimeWindow)
                    const timestamp = Number(event.target.value)
                    playheadRef.current = timestamp
                    setPlayhead(timestamp)
                    setIsPlaying(false)
                  }}
                />
                <time dateTime={new Date(playhead ?? timelineEnd).toISOString()}>
                  {fmtUtcTimestamp(playhead ?? timelineEnd)}
                </time>
              </div>
              <div className="gtw__timeline-content">
                <div className="gtw__timeline-main">
                  <div className="gtw__timeline-axis" aria-hidden="true">
                    <div className="gtw__timeline-axis-plot">
                      {timelineTicks.map((tick, i) => (
                        <span
                          key={tick}
                          className={`gtw__timeline-label${i === 0 ? ' gtw__timeline-label--first' : ''}${i === timelineTicks.length - 1 ? ' gtw__timeline-label--last' : ''}`}
                          style={{ left: `${((tick - timelineStart) / timelineSpan) * 100}%` }}
                        >
                          {formatTimelineTick(tick, timelineSpan)}
                        </span>
                      ))}
                      {playhead !== null && (
                        <span className="gtw__timeline-playhead" style={{ left: `${((playhead - timelineStart) / timelineSpan) * 100}%` }} />
                      )}
                    </div>
                    <span className="gtw__timeline-now">{timelineEnd === timelineNow ? 'NOW' : 'END'}</span>
                  </div>
                  <div className="gtw__timeline-plot-layout">
                    <div className="gtw__timeline-plot">
                      <div className="gtw__timeline-grid" aria-hidden="true">
                        {timelineTicks.map((tick) => (
                          <span
                            key={tick}
                            style={{ left: `${((tick - timelineStart) / timelineSpan) * 100}%` }}
                          />
                        ))}
                      </div>
                      <div className="gtw__timeline-rows">
                        {timelineRows.map((track) => (
                          <div className="gtw__timeline-row" key={track.key}>
                            <ActivityTrack
                              events={track.events}
                              start={timelineStart}
                              end={timelineEnd}
                              resolution={track.resolution}
                              cursor={playhead}
                            />
                          </div>
                        ))}
                      </div>
                      {playhead !== null && (
                        <span className="gtw__timeline-playhead gtw__timeline-playhead--plot" style={{ left: `${((playhead - timelineStart) / timelineSpan) * 100}%` }} />
                      )}
                    </div>
                    <div className="gtw__timeline-now-plot" aria-hidden="true" />
                  </div>
                </div>
                <ul className="gtw__timeline-labels" aria-label="Activity sources">
                  {timelineRows.map((track) => (
                    <li key={track.key} className={`gtw__timeline-source gtw__timeline-source--${track.status.toLowerCase().replaceAll(' ', '-')}`}>
                      <span className="gtw__timeline-source-name">{track.label}</span>
                      <span className="gtw__timeline-source-status">{track.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="gtw__timeline-note">
                Five tracks, one per attack layer. Web Attackers and DDoS Attackers render their layer&apos;s published timeseries serie points at the file&apos;s real aggregation resolution (15m bins for 1h/6h, hourly for 24h, daily for 7d), with no interpolation; a missing or erroring timeseries file shows UNAVAILABLE. Scanners render DShield DAILY points only — sparse, one point per day, never dozens of fake hourly spikes. Intruders and Anonymizers have no source, so their tracks show DISABLED. NVD and CISA KEV live in alerts and sidebar panels, not as tracks.
                DShield source-location records in this snapshot have no per-IP observation time, so historical selections hide those markers instead of presenting current locations as historical. Playback follows provider-timestamped timeline events; destination routes are not available.
                Playback into a retained snapshot swaps that layer&apos;s map to the snapshot and labels it HISTORICAL; when no retained snapshot exists at or before the playhead, that layer is empty and labelled NO HISTORY — history is never invented, and the current serie is never presented as historical.
              </p>
            </section>
          )}
          {errors.dshield && (
            <p className="gtw__error gtw__error--below" role="alert">
              DShield status: {errors.dshield}
            </p>
          )}
        </div>

        {/* Right rail */}
        <aside className="gtw__rail" id="gtw-rail" aria-label="Live figures, rankings and scanned ports">
          <div className="gtw__rail-head">
            <h2 className="gtw__rail-title">Live Cyber Threat Map</h2>
            <div className="gtw__interval" role="group" aria-label="Cloudflare statistics interval">
              <span className="gtw__interval-label">Cloudflare interval</span>
              <div className="gtw__interval-buttons">
                {CLOUDFLARE_INTERVALS.map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    className={`gtw__interval-button${cfInterval === interval ? ' is-active' : ''}`}
                    aria-pressed={cfInterval === interval}
                    onClick={() => setCfInterval(interval)}
                  >
                    {interval}
                  </button>
                ))}
              </div>
              {['web', 'ddos'].map((layer) => {
                const meta = effectiveLayerMeta[layer]
                const shift = effectiveLayerShift[layer]
                const window = effectiveLayerWindow[layer]
                const series = layerTimeseries[layer]
                const seriesStatus = cfHistoryGap[layer]
                  ? 'NO HISTORY'
                  : timeseriesStatusLabel({ timeseriesStatus: series.status, points: series.points })
                return (
                  <p className="gtw__interval-note" key={`layer-note-${layer}`}>
                    {CLOUDFLARE_LAYER_LABELS[layer]} ({layer === 'web' ? 'WAF' : 'DDOS'}) — Window (actual, as returned by Cloudflare): {formatCloudflareDateRange(meta?.dateRange)}
                    {' · '}Upstream updated: {fmtUtcTimestamp(meta?.lastUpdated)}
                    {' · '}Snapshot generated: {fmtUtcTimestamp(effectiveLayerGeneratedAt[layer])}
                    {' · '}Status: {layerDisplayStatus(layer)}
                    {Number.isFinite(shift) && shift !== 0 && (
                      <>
                        {' · '}Window shift: Cloudflare returned the latest fully aggregated window, starting {Math.abs(shift)} min {shift > 0 ? 'earlier' : 'later'} than requested
                        {window ? ` (requested ${fmtUtcTimestamp(window.dateStart)} – ${fmtUtcTimestamp(window.dateEnd)})` : ''}
                      </>
                    )}
                    {' · '}Timeseries: {seriesStatus}
                    {series.aggInterval ? ` · ${series.aggInterval} bins` : ''}
                    {series.points.length > 0 ? ` · ${series.points.length} points` : ''}
                    {series.error && series.status === 'unavailable' ? ` (${series.error})` : ''}
                  </p>
                )
              })}
              {cfHistoryGap.web && (
                <p className="gtw__error" role="alert">No retained Web Attackers snapshot exists at or before {fmtUtcTimestamp(playhead)} for the {cfInterval} interval — showing no pairs for that layer rather than current data as history.</p>
              )}
              {cfHistoryGap.ddos && (
                <p className="gtw__error" role="alert">No retained DDoS Attackers snapshot exists at or before {fmtUtcTimestamp(playhead)} for the {cfInterval} interval — showing no pairs for that layer rather than current data as history.</p>
              )}
              {data.cloudflareRadar.web.status === 'unavailable' && (
                <p className="gtw__error" role="alert">The Web Attackers (WAF) file for the {cfInterval} interval is unavailable right now ({data.cloudflareRadar.web.error}). Showing no pairs for this layer rather than stale data.</p>
              )}
              {data.cloudflareRadar.ddos.status === 'unavailable' && (
                <p className="gtw__error" role="alert">The DDoS Attackers (DDOS) file for the {cfInterval} interval is unavailable right now ({data.cloudflareRadar.ddos.error}). Showing no pairs for this layer rather than stale data.</p>
              )}
              <p className="gtw__interval-note">DShield, NVD and CISA KEV are daily-resolution — their rankings do not change with this selector. Provider snapshots refresh every 15 minutes. Freshness is shown per feed.</p>
            </div>
            <ul className="gtw__provider-freshness" aria-label="Provider freshness">
              {freshnessItems.map(({ key, label, provider, layer }) => {
                const isCloudflare = Boolean(layer)
                // A layer row reports its own layer status (live file,
                // historical playback, history gap, or unavailable) so
                // the panel, map, rankings and timeline cannot disagree
                // about freshness.
                const freshness = isCloudflare
                  ? (data.cloudflareRadar[layer].status === 'unavailable'
                    ? 'OFFLINE'
                    : layerDisplayStatus(layer))
                  : providerFreshness(provider)
                const timestamp = isCloudflare
                  ? provider?.lastUpdated || null
                  : provider?.fetchedAt || provider?.lastSuccessfulAt || null
                const dataDate = provider?.dataDate
                const freshnessClass = freshness.toLowerCase().replaceAll(' ', '-')
                const title = [
                  timestamp
                    ? isCloudflare
                      ? `Cloudflare upstream lastUpdated: ${formatUtcTimestamp(timestamp)}`
                      : `Last successful refresh: ${formatUtcTimestamp(timestamp)}`
                    : isCloudflare
                      ? 'No upstream lastUpdated timestamp'
                      : 'No successful refresh recorded',
                  dataDate ? `Source data date: ${dataDate}` : null,
                  provider?.error || null,
                ].filter(Boolean).join(' · ')
                return (
                  <li key={key} className={`gtw__provider-freshness-item gtw__provider-freshness-item--${freshnessClass}`} title={title}>
                    <span className="gtw__provider-freshness-name">{label}</span>
                    <strong>{freshness}</strong>
                    {timestamp && (
                      <time dateTime={timestamp}>
                        {isCloudflare ? 'Upstream update · ' : 'Last success · '}{formatUtcTimestamp(timestamp)}
                      </time>
                    )}
                    {dataDate && <span className="gtw__provider-freshness-date">Source date: {dataDate}</span>}
                    {isCloudflare && Number.isInteger(provider?.pairCount) && (
                      <span className="gtw__provider-freshness-date">{provider.pairCount} valid country pairs</span>
                    )}
                    {isCloudflare && data.cloudflareRadar[layer].error && (
                      <span className="gtw__provider-freshness-error">{data.cloudflareRadar[layer].error}</span>
                    )}
                    {isCloudflare && cloudflareNeedsDetailedGeometry && cloudflareGeometryError && (
                      <span className="gtw__provider-freshness-error">Country geometry unavailable: {cloudflareGeometryError}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          <section className="gtw__panel" aria-labelledby="attackers-h">
            <h2 id="attackers-h" className="gtw__panel-title">Top attackers</h2>
            {cfRankingsDisabled && <p className="gtw__aside-note">No Cloudflare layer is enabled — enable Web Attackers or DDoS Attackers to show this ranking. The &lsquo;all&rsquo; aggregate is never substituted.</p>}
            {!cfRankingsDisabled && cfOriginRanking.length === 0 && !errors.cloudflareWeb && !errors.cloudflareDdos && <p className="gtw__empty">Loading…</p>}
            {!cfRankingsDisabled && cfOriginRanking.length === 0 && (errors.cloudflareWeb || errors.cloudflareDdos) && (
              <p className="gtw__aside-note">No Cloudflare Radar pairs for the {cfInterval} interval ({[errors.cloudflareWeb, errors.cloudflareDdos].filter(Boolean).join('; ')}).</p>
            )}
            {!cfRankingsDisabled && (
              <>
            <ol className="gtw__bars">
              {cfOriginRanking.map((c) => (
                <li key={c.code}>
                  <span className="gtw__bars-label"><span className="gtw__flag" aria-hidden="true">{flagEmoji(c.code)}</span>{c.name}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill" style={{ width: `${Math.max(4, (c.total / sumCfOriginTotals) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{Math.round((c.total / sumCfOriginTotals) * 100)} %</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Cloudflare Radar origin-country totals (sum of reported pair %) for the selected {cfInterval} interval, summed across the enabled layers: {enabledCfLayerLabels.join(' + ')}{(historicalCf.web || historicalCf.ddos) ? ' · historical snapshot' : ''}. Source: Cloudflare Radar.</p>
              </>
            )}
          </section>

          <section className="gtw__panel" aria-labelledby="dshield-countries-h">
            <h2 id="dshield-countries-h" className="gtw__panel-title">Top DShield source countries</h2>
            {countries.length === 0 && !errors.dshield && <p className="gtw__empty">Loading…</p>}
            <ol className="gtw__bars">
              {countries.map((c) => (
                <li key={c.code}>
                  <span className="gtw__bars-label"><span className="gtw__flag" aria-hidden="true">{flagEmoji(c.code)}</span>{c.country}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill" style={{ width: `${Math.max(4, (c.reports / sumCountryReports) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{Math.round((c.reports / sumCountryReports) * 100)} %</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Source countries of the most-reported addresses, by share of the top five&rsquo;s reports. Source: DShield (daily resolution).</p>
          </section>

          <section className="gtw__panel" aria-labelledby="attacked-h">
            <h2 id="attacked-h" className="gtw__panel-title">Top attacked</h2>
            {cfRankingsDisabled && <p className="gtw__aside-note">No Cloudflare layer is enabled — enable Web Attackers or DDoS Attackers to show this ranking. The &lsquo;all&rsquo; aggregate is never substituted.</p>}
            {!cfRankingsDisabled && cfTargetRanking.length === 0 && !errors.cloudflareWeb && !errors.cloudflareDdos && <p className="gtw__empty">Loading…</p>}
            {!cfRankingsDisabled && cfTargetRanking.length === 0 && (errors.cloudflareWeb || errors.cloudflareDdos) && (
              <p className="gtw__aside-note">No Cloudflare Radar pairs for the {cfInterval} interval ({[errors.cloudflareWeb, errors.cloudflareDdos].filter(Boolean).join('; ')}).</p>
            )}
            {!cfRankingsDisabled && (
              <>
            <ol className="gtw__bars">
              {cfTargetRanking.map((t) => (
                <li key={t.code}>
                  <span className="gtw__bars-label"><span className="gtw__flag" aria-hidden="true">{flagEmoji(t.code)}</span>{t.name}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill" style={{ width: `${Math.max(4, (t.total / sumCfTargetTotals) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{Math.round((t.total / sumCfTargetTotals) * 100)} %</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Cloudflare Radar target-country totals (sum of reported pair %) for the selected {cfInterval} interval, summed across the enabled layers: {enabledCfLayerLabels.join(' + ')}{(historicalCf.web || historicalCf.ddos) ? ' · historical snapshot' : ''}. Source: Cloudflare Radar. Breach geography is not shown while the Recent Breaches feed is disabled pending permission.</p>
              </>
            )}
          </section>

          <section className="gtw__panel" aria-labelledby="vectors-h">
            <h2 id="vectors-h" className="gtw__panel-title">Top network attack vectors</h2>
            {!attackVectors.available && (
              <p className="gtw__aside-note">DISABLED — {attackVectors.reason} DShield ports are most-probed services, not flood-type vectors, and are never converted into attack-vector values.</p>
            )}
            {attackVectors.available && (
              <>
                <ol className="gtw__bars">
                  {attackVectors.vectors.slice(0, 5).map((v) => (
                    <li key={v.product}>
                      <span className="gtw__bars-label">{v.label}</span>
                      <span className="gtw__bars-track">
                        <span className="gtw__bars-fill" style={{ width: `${Math.max(4, v.share * 100)}%` }} />
                      </span>
                      <span className="gtw__bars-num">{Math.round(v.share * 100)} %</span>
                    </li>
                  ))}
                </ol>
                <p className="gtw__aside-note">Share of summed per-mitigation-product timeseries totals (raw counts) for the selected {cfInterval} interval. Source: Cloudflare Radar timeseries.</p>
              </>
            )}
          </section>

          <section className="gtw__panel" aria-labelledby="app-violations-h">
            <h2 id="app-violations-h" className="gtw__panel-title">Top application violations</h2>
            <p className="gtw__aside-note">DISABLED — no source on this page supplies WAF/application violation categories. The Cloudflare Radar aggregates used here carry no violation taxonomy. Enabling this panel needs a WAF event-level feed with a violation taxonomy. The panel below shows published vulnerability weaknesses (NVD classifications), not observed violations.</p>
          </section>

          <section className="gtw__panel" aria-labelledby="violations-h">
            <h2 id="violations-h" className="gtw__panel-title">Top Published Vulnerability Weaknesses</h2>
            {data.violations.length === 0 && !errors.nvd && <p className="gtw__empty">Loading…</p>}
            {errors.nvd && (
              <p className="gtw__error" role="alert">The NVD feed is unavailable right now ({errors.nvd}).</p>
            )}
            <ol className="gtw__bars">
              {data.violations.map((v) => (
                <li key={v.id}>
                  <span className="gtw__bars-label" style={{ color: CAT_BY_KEY.scanning.color }}>{v.name}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill" style={{ width: `${Math.max(4, (v.count / sumViolationCount) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{v.id} · {v.count}</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Weakness types (CWE) in the vulnerabilities published in the last 48 hours — published classifications, not observed violations. Source: NIST NVD.</p>
          </section>

          <section className="gtw__panel" aria-labelledby="ports-h">
            <h2 id="ports-h" className="gtw__panel-title">Most-scanned ports · DShield</h2>
            {data.ports.length === 0 && !errors.ports && <p className="gtw__empty">Loading…</p>}
            {data.ports.length === 0 && errors.ports && (
              <p className="gtw__error" role="alert">The DShield top ports feed is unavailable right now ({errors.ports}).</p>
            )}
            <div className="gtw__port-grid">
              {data.ports.map((p, i) => (
                <button
                  type="button"
                  className={`gtw__port-tile${i === 0 ? ' gtw__port-tile--hero' : ''}`}
                  key={p.port}
                  onClick={() => setSelectedIntel({ type: 'port', id: String(p.port) })}
                  aria-label={`Inspect port ${p.port}, ${PORT_NAMES[p.port] || 'service'}, ${p.records.toLocaleString('en-US')} reports`}
                >
                  <span
                    className="gtw__port-num"
                    style={i === 0 ? undefined : { fontSize: `${Math.round(16 + Math.sqrt(p.records / maxPortRecords) * 12)}px` }}
                  >{p.port}</span>
                  <span className="gtw__port-proto">{verifiedPortProtocol(p) || '—'}</span>
                  <span className="gtw__port-name">{PORT_NAMES[p.port] || 'Service'}</span>
                  <span className="gtw__port-records">{p.records.toLocaleString('en-US')} reports</span>
                </button>
              ))}
            </div>
            <p className="gtw__aside-note">Ports the sensors saw probed most, by report count. DShield&rsquo;s records carry no protocol field, so protocol is shown only where verified, otherwise &ldquo;not verified&rdquo; — it is never inferred from the port number. Source: DShield. {totalReports > 0 && `${totalReports.toLocaleString('en-US')} reports from the ${data.sources.length} plotted sources in the current window.`}</p>
          </section>
        </aside>
      </div>

      {/* --- Site footer: the homepage footer band (InfoBar + Newsletter),
          on paper at the bottom of the dark map page. The global Footer
          nav row renders below it from App.jsx. The data credit stays
          here as a small line in the band. --- */}
      <div className="gtw__site-footer">
        <InfoBar />
        <Newsletter />
        <p className="gtw__site-footer-credit">
          Data: <a href="https://isc.sans.edu/api/" target="_blank" rel="noopener noreferrer">SANS Technology Institute / Internet Storm Center (DShield)</a>
          {' · '}<a href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog" target="_blank" rel="noopener noreferrer">CISA KEV</a>
          {' · '}<a href="https://nvd.nist.gov/" target="_blank" rel="noopener noreferrer">NIST NVD</a>
          {' · '}<a href="https://ipwho.is/" target="_blank" rel="noopener noreferrer">ipwho.is</a>
          {' · '}DShield data: commercial use with attribution; not for resale.
          {' — '}
          Arcs and travelling pulses are aggregate motion, not claimed attack routes or individual packets. ThreatFox is disabled pending commercial-use eligibility or a paid subscription; Recent Breaches is disabled pending permission.
          Attack vectors are most-probed services by port; Top Published Vulnerability Weaknesses are CWE types in the last 48 hours of NVD CVEs — published classifications, not observed violations.
        </p>
      </div>
    </div>
  )
}
