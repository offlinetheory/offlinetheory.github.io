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
  countryFillStyle,
  layerVisibility,
  LIVE_WINDOW_MS,
  panMapTransform,
  providerFreshness,
  RECENT_WINDOW_MS,
  sourceObservedAt,
  STALE_WINDOW_MS,
  sourcesInTimeWindow,
  timelineTrackVisible,
  zoomMapTransform,
} from './threatMapCountryActivity.js'
import {
  arcPulsePlan,
  buildCloudflareRadarMap,
  CLOUDFLARE_INTERVALS,
  cloudflareIntervalUrl,
  pairsForCountry,
  rankCloudflareCountries,
  selectHistoricalSnapshot,
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
 * category names. The categories are ours — Scanning, Ransomware,
 * Exploited Flaws, Breaches — and every
 * figure comes from our own published provider snapshots.
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
 * vectors" panel is the most-probed services from DShield's top ports,
 * shown as a share of those ports' reports — there is no free live
 * feed of flood-type vector volumes. Country fills and markers use
 * reported DShield source locations. Cloudflare Radar separately supplies
 * aggregated Layer 7 origin-to-target country pairs; these are not
 * individual DShield source-to-destination routes.
 * The timeline shows DShield daily totals, NVD publications, KEV additions
 * and, when licensing is cleared, ThreatFox indicators using provider
 * timestamps where available. Cloudflare upstream update time is displayed
 * independently from the local snapshot refresh time.
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
const CLOUDFLARE_RADAR_SNAPSHOT = `${import.meta.env.BASE_URL}data/cloudflare-attack-pairs.json`
const CLOUDFLARE_HISTORY_MANIFEST = `${import.meta.env.BASE_URL}data/history/cloudflare-manifest.json`
const REFRESH_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 15000
const INITIAL_TIMELINE_TIME = Date.now()

// Categories retain their identities in the data; map and legend accents
// use white for a consistent monochrome presentation.
const CATEGORIES = [
  { key: 'scanning', label: 'Scanning', color: '#FFFFFF', note: 'Probing of exposed ports, reported by volunteer sensors.' },
  { key: 'cloudflare', label: 'Cloudflare Radar pairs', color: '#FFFFFF', note: 'Aggregated Layer 7 origin-to-target country pairs.' },
  { key: 'exploited', label: 'Exploited flaws', color: '#FFFFFF', note: 'Vulnerabilities CISA confirms are in active use.' },
  { key: 'ransomware', label: 'Ransomware', color: '#FFFFFF', note: 'Victims posted to extortion leak sites.', noSource: true },
  { key: 'breaches', label: 'Breaches', color: '#FFFFFF', note: 'Disclosed incidents and regulator filings.', noSource: true },
]
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]))

const PORT_NAMES = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP',
  110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 1433: 'MSSQL',
  2222: 'SSH (alt)', 2323: 'Telnet (alt)', 3306: 'MySQL', 3389: 'RDP',
  5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 8000: 'HTTP (alt)', 8080: 'HTTP (alt)',
  8443: 'HTTPS (alt)', 8888: 'HTTP (alt)', 9000: 'HTTP (alt)',
}

// Transport protocol for the well-known ports DShield reports. Ports
// not listed here are shown without a protocol claim.
const PORT_PROTOCOL = {
  21: 'TCP', 22: 'TCP', 23: 'TCP', 25: 'TCP', 53: 'UDP', 69: 'UDP',
  80: 'TCP', 110: 'TCP', 111: 'TCP', 123: 'UDP', 135: 'TCP', 137: 'UDP',
  138: 'UDP', 139: 'TCP', 143: 'TCP', 161: 'UDP', 443: 'TCP', 445: 'TCP',
  500: 'UDP', 1433: 'TCP', 1701: 'UDP', 1900: 'UDP', 2222: 'TCP',
  2323: 'TCP', 3306: 'TCP', 3389: 'TCP', 5060: 'UDP', 5353: 'UDP',
  5432: 'TCP', 5900: 'TCP', 6379: 'TCP', 8000: 'TCP', 8080: 'TCP', 8443: 'TCP',
  8888: 'TCP', 9000: 'TCP', 11211: 'UDP', 27015: 'UDP',
}

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

// Country names as Recent Breaches returns them, to alpha-2 codes —
// for the flag in the Top Attacked list and real target locations.
const NAME_TO_CODE = {
  'United States': 'US', Canada: 'CA', Germany: 'DE', India: 'IN',
  'United Kingdom': 'GB', Spain: 'ES', 'South Korea': 'KR', Italy: 'IT',
  Brazil: 'BR', Malaysia: 'MY', Indonesia: 'ID', France: 'FR',
  Australia: 'AU', Japan: 'JP', Netherlands: 'NL', Russia: 'RU',
  'Russian Federation': 'RU', Ireland: 'IE', Singapore: 'SG', Poland: 'PL',
  Turkey: 'TR', Ukraine: 'UA', Mexico: 'MX', Argentina: 'AR', Chile: 'CL',
  Colombia: 'CO', Peru: 'PE', Venezuela: 'VE', Romania: 'RO', Czechia: 'CZ',
  'Czech Republic': 'CZ', Hungary: 'HU', Greece: 'GR', Portugal: 'PT',
  Sweden: 'SE', Norway: 'NO', Denmark: 'DK', Finland: 'FI', Switzerland: 'CH',
  Austria: 'AT', Belgium: 'BE', 'New Zealand': 'NZ', Philippines: 'PH',
  Pakistan: 'PK', Bangladesh: 'BD', Kazakhstan: 'KZ', Belarus: 'BY',
  Georgia: 'GE', Armenia: 'AM', Azerbaijan: 'AZ', Iraq: 'IQ', Afghanistan: 'AF',
  Nepal: 'NP', 'Sri Lanka': 'LK', Myanmar: 'MM', Cambodia: 'KH', Laos: 'LA',
  Mongolia: 'MN', Kyrgyzstan: 'KG', Tajikistan: 'TJ', Turkmenistan: 'TM',
  Uzbekistan: 'UZ', Moldova: 'MD', Albania: 'AL', 'Bosnia and Herzegovina': 'BA',
  Croatia: 'HR', Serbia: 'RS', Slovenia: 'SI', Slovakia: 'SK', Bulgaria: 'BG',
  Lithuania: 'LT', Latvia: 'LV', Estonia: 'EE', Iceland: 'IS', Luxembourg: 'LU',
  Malta: 'MT', Cyprus: 'CY', Algeria: 'DZ', Morocco: 'MA', Tunisia: 'TN',
  Libya: 'LY', Kenya: 'KE', Ghana: 'GH', 'Ivory Coast': 'CI', Senegal: 'SN',
  Cameroon: 'CM', Angola: 'AO', Ethiopia: 'ET', Tanzania: 'TZ', Uganda: 'UG',
  Zambia: 'ZM', Zimbabwe: 'ZW', 'Dominican Republic': 'DO', Cuba: 'CU',
  Jamaica: 'JM', Haiti: 'HT', Guatemala: 'GT', Honduras: 'HN', 'El Salvador': 'SV',
  Nicaragua: 'NI', 'Costa Rica': 'CR', Panama: 'PA', Ecuador: 'EC', Bolivia: 'BO',
  Paraguay: 'PY', Uruguay: 'UY', Guyana: 'GY', Suriname: 'SR',
  'Trinidad and Tobago': 'TT', China: 'CN', Taiwan: 'TW', 'Hong Kong': 'HK',
  Vietnam: 'VN', Thailand: 'TH', 'South Africa': 'ZA', Nigeria: 'NG',
  Egypt: 'EG', Israel: 'IL', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA',
  Iran: 'IR',
}

function flagEmoji(code) {
  if (!code || code.length !== 2) return ''
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const MAP_W = 1200
const MAP_H = 620

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
  { key: 'dshield', label: 'DShield daily reports', resolution: 'day' },
  { key: 'dshieldPorts', label: 'DShield top ports', resolution: 'day' },
  { key: 'nvd', label: 'NVD CVE publications', resolution: 'hour' },
  { key: 'kev', label: 'CISA KEV additions', resolution: 'day' },
  { key: 'cloudflare', label: 'Cloudflare Radar snapshots', resolution: 'snapshot' },
  { key: 'threatfox', label: 'ThreatFox indicators', resolution: 'hour' },
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
  const bucketSize = resolution === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const barWidth = resolution === 'hour' ? 2.4 : 3
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
    cloudflareRadar: { meta: null, pairs: [], provider: null, generatedAt: null },
    infocon: null,
    kev: null,
    rbIndex: null,
    rbGeo: null,
    rbLeaks: [],
    timeline: { dshield: [], dshieldPorts: [], nvd: [], kev: [], threatfox: [] },
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
    scanning: true,
    cloudflare: true,
    ransomware: true,
    exploited: true,
    breaches: true,
  })
  const [cfInterval, setCfInterval] = useState('24h')
  const [cfIntervalMeta, setCfIntervalMeta] = useState(null)
  const [cfManifest, setCfManifest] = useState(null)
  const [cfPreviousPairs, setCfPreviousPairs] = useState(null)
  const [historicalCf, setHistoricalCf] = useState(null)
  const cfIntervalRef = useRef(cfInterval)
  cfIntervalRef.current = cfInterval
  const historicalCfFetchedRef = useRef(null)
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
    const nextErrors = {}
    try {
      // The selected interval's file; for 24h the legacy base file remains
      // as a fallback until the per-interval -24h file is published.
      const cloudflarePromise = (async () => {
        try {
          return await fetchJson(cloudflareIntervalUrl(import.meta.env.BASE_URL, cfIntervalRef.current))
        } catch (error) {
          if (cfIntervalRef.current !== '24h') throw error
          return fetchJson(CLOUDFLARE_RADAR_SNAPSHOT)
        }
      })()
      const [snapshotResult, cloudflareResult] = await Promise.allSettled([
        fetchJson(THREAT_INTEL_SNAPSHOT),
        cloudflarePromise,
      ])
      if (snapshotResult.status === 'rejected') throw snapshotResult.reason
      const snapshot = snapshotResult.value
      if (!snapshot?.dashboard || !snapshot?.providers) {
        throw new Error('The threat-intel snapshot has an unexpected shape')
      }

      const dashboard = snapshot.dashboard
      const cloudflareSnapshot = cloudflareResult.status === 'fulfilled' &&
        Array.isArray(cloudflareResult.value?.pairs) &&
        cloudflareResult.value?.provider
        ? cloudflareResult.value
        : null
      let cloudflareProvider = cloudflareSnapshot?.provider || snapshot.providers.cloudflare_radar
      if (cloudflareSnapshot) {
        setCfIntervalMeta({
          interval: cloudflareSnapshot.interval || cfIntervalRef.current,
          generatedAt: cloudflareSnapshot.generatedAt || null,
          window: cloudflareSnapshot.window || null,
          intervalStatus: cloudflareSnapshot.intervalStatus || cloudflareSnapshot.provider?.status || null,
          intervalError: cloudflareSnapshot.intervalError || null,
        })
      }
      if (!cloudflareSnapshot) {
        nextErrors.cloudflare = cloudflareResult.status === 'rejected'
          ? cloudflareResult.reason.message
          : 'Cloudflare Radar snapshot has an unexpected response shape'
        setCfIntervalMeta({
          interval: cfIntervalRef.current,
          generatedAt: null,
          window: null,
          intervalStatus: 'unavailable',
          intervalError: nextErrors.cloudflare,
        })
        if (cloudflareProvider && cloudflareProvider.status !== 'not_configured') {
          const hasSuccessfulDataset = Boolean(cloudflareProvider.lastUpdated || cloudflareProvider.fetchedAt)
          cloudflareProvider = {
            ...cloudflareProvider,
            status: hasSuccessfulDataset ? 'stale' : 'offline',
            error: nextErrors.cloudflare,
          }
        }
      } else if (cloudflareProvider?.status !== 'live') {
        nextErrors.cloudflare = cloudflareProvider?.error || `Provider status: ${cloudflareProvider?.status || 'unavailable'}`
      }
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
      const dshieldEvents = dailySummary
        .map((day) => {
          const timestamp = timelineTimestamp(day.date)
          return timestamp == null ? null : { timestamp, value: Number(day.records) || 0 }
        })
        .filter(Boolean)
      const dshieldPortEvents = ports
        .map((port) => {
          const timestamp = timelineTimestamp(port.date)
          return timestamp == null ? null : { timestamp, value: port.records }
        })
        .filter(Boolean)
      const nvdEvents = (Array.isArray(nvd?.vulnerabilities) ? nvd.vulnerabilities : [])
        .map((item) => {
          const timestamp = timelineTimestamp(item?.cve?.published)
          return timestamp == null ? null : { timestamp, value: 1 }
        })
        .filter(Boolean)
      const kev = dashboard.kev
      const kevEvents = (Array.isArray(kev?.recent) ? kev.recent : [])
        .map((vulnerability) => {
          const timestamp = timelineTimestamp(vulnerability.dateAdded)
          return timestamp == null ? null : { timestamp, value: 1 }
        })
        .filter(Boolean)
      const threatfox = Array.isArray(dashboard.threatfox) ? dashboard.threatfox : []
      const threatFoxEvents = threatfox
        .map((indicator) => {
          const timestamp = timelineTimestamp(indicator.firstSeen)
          return timestamp == null ? null : { timestamp, value: 1 }
        })
        .filter(Boolean)

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
        cloudflareRadar: cloudflareSnapshot
          ? {
            meta: cloudflareSnapshot.meta,
            pairs: cloudflareSnapshot.pairs,
            provider: cloudflareProvider,
            generatedAt: cloudflareSnapshot.generatedAt || null,
          }
          : {
            meta: null,
            pairs: [],
            provider: cloudflareProvider,
            generatedAt: null,
          },
        providers: {
          ...snapshot.providers,
          cloudflare_radar: cloudflareProvider || snapshot.providers.cloudflare_radar || current.providers?.cloudflare_radar,
        },
        infocon: dashboard.infocon?.status || null,
        kev,
        rbIndex: dashboard.recentBreaches?.index || null,
        rbGeo: dashboard.recentBreaches?.geo || null,
        rbLeaks: Array.isArray(dashboard.recentBreaches?.leaks) ? dashboard.recentBreaches.leaks.slice(0, 4) : [],
        timeline: {
          dshield: dshieldEvents,
          dshieldPorts: dshieldPortEvents,
          nvd: nvdEvents,
          kev: kevEvents,
          threatfox: threatFoxEvents,
        },
      }))
      setErrors(nextErrors)
      setUpdatedAt(snapshot.generatedAt ? new Date(snapshot.generatedAt) : null)
    } catch (error) {
      if (mounted.current) {
        console.error(`Threat-intel snapshot unavailable: ${error.message}`)
        setErrors({ snapshot: error.message, dshield: error.message })
      }
    } finally {
      if (mounted.current) {
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

  // Interval change: refetch the selected interval's Cloudflare file and
  // leave any historical playback behind (it belongs to the old interval).
  const firstIntervalRun = useRef(true)
  useEffect(() => {
    if (firstIntervalRun.current) {
      firstIntervalRun.current = false
      return
    }
    historicalCfFetchedRef.current = null
    setHistoricalCf(null)
    setCfPreviousPairs(null)
    load(true)
  }, [cfInterval, load])

  // History manifest: absent on older deploys — degrade to
  // current-snapshot-only behaviour, never crash, never invent history.
  useEffect(() => {
    let cancelled = false
    fetchJson(CLOUDFLARE_HISTORY_MANIFEST)
      .then((manifest) => {
        if (!cancelled && manifest && typeof manifest === 'object' && manifest.intervals) {
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

  // Previous retained snapshot for the selected interval, so the alerts
  // panel can report real Cloudflare pair changes. Null = no prior
  // snapshot retained, so no Cloudflare-change alert is shown.
  useEffect(() => {
    const entries = cfManifest?.intervals?.[cfInterval]
    if (!Array.isArray(entries) || entries.length < 2) {
      setCfPreviousPairs(null)
      return undefined
    }
    const previous = entries[entries.length - 2]
    const path = typeof previous?.path === 'string' ? previous.path.replace(/^\//, '') : null
    if (!path) {
      setCfPreviousPairs(null)
      return undefined
    }
    let cancelled = false
    fetchJson(`${import.meta.env.BASE_URL}${path}`)
      .then((snapshot) => {
        if (!cancelled) setCfPreviousPairs(Array.isArray(snapshot?.pairs) ? snapshot.pairs : null)
      })
      .catch(() => {
        if (!cancelled) setCfPreviousPairs(null)
      })
    return () => { cancelled = true }
  }, [cfManifest, cfInterval])

  // Historical playback: when the playhead sits at/after a retained
  // Cloudflare snapshot, swap the map to that snapshot's pairs.
  useEffect(() => {
    if (playhead === null) {
      if (historicalCf !== null) setHistoricalCf(null)
      historicalCfFetchedRef.current = null
      return undefined
    }
    const entries = cfManifest?.intervals?.[cfInterval]
    const selected = selectHistoricalSnapshot(entries, playhead)
    const liveGeneratedAt = data.cloudflareRadar.generatedAt
    if (!selected || (liveGeneratedAt && selected.generatedAt === liveGeneratedAt)) {
      if (historicalCf !== null) setHistoricalCf(null)
      historicalCfFetchedRef.current = null
      return undefined
    }
    if (historicalCfFetchedRef.current === selected.generatedAt) return undefined
    historicalCfFetchedRef.current = selected.generatedAt
    const path = typeof selected.path === 'string' ? selected.path.replace(/^\//, '') : null
    if (!path) return undefined
    let cancelled = false
    fetchJson(`${import.meta.env.BASE_URL}${path}`)
      .then((snapshot) => {
        if (!cancelled && Array.isArray(snapshot?.pairs)) {
          setHistoricalCf({ generatedAt: selected.generatedAt, pairs: snapshot.pairs, meta: snapshot.meta || null })
        } else if (!cancelled) {
          setHistoricalCf(null)
        }
      })
      .catch(() => {
        if (!cancelled) setHistoricalCf(null)
      })
    return () => { cancelled = true }
  }, [playhead, cfManifest, cfInterval, data.cloudflareRadar.generatedAt, historicalCf])

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
  const defaultTimelineStart = timelineNow - 6 * 24 * 60 * 60 * 1000
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
  const cloudflareNeedsDetailedGeometry = data.cloudflareRadar.pairs.some((pair) =>
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
  const effectiveCloudflarePairs = historicalCf ? historicalCf.pairs : data.cloudflareRadar.pairs
  const effectiveCloudflareMeta = historicalCf ? historicalCf.meta : data.cloudflareRadar.meta
  // Computed here (before the provider panel below) so the memoised
  // map does not read a not-yet-declared binding.
  const cloudflareLiveStatus = cloudflareFreshness(data.providers?.cloudflare_radar)
  const cloudflareDisplayStatus = historicalCf ? 'HISTORICAL' : cloudflareLiveStatus
  const cloudflareMapData = useMemo(
    () => buildCloudflareRadarMap(
      effectiveCloudflarePairs,
      cloudflareCountryFeatures,
      projection,
      path,
      COUNTRY_NUMERIC,
    ),
    [effectiveCloudflarePairs, cloudflareCountryFeatures, projection, path],
  )
  // Travelling pulses run along real aggregate arcs only, only while the
  // Cloudflare layer is enabled and its status is LIVE/RECENT.
  const cloudflarePulses = useMemo(() => {
    if (!attackFilters.cloudflare || historicalCf) return []
    if (cloudflareLiveStatus !== 'LIVE' && cloudflareLiveStatus !== 'RECENT') return []
    return arcPulsePlan(cloudflareMapData.arcs, 12)
  }, [attackFilters.cloudflare, historicalCf, cloudflareLiveStatus, cloudflareMapData.arcs])
  const layers = layerVisibility(attackFilters)

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
  const sumCfOriginTotals = Math.max(1, cfOriginRanking.reduce((sum, c) => sum + c.total, 0))
  const sumCfTargetTotals = Math.max(1, cfTargetRanking.reduce((sum, c) => sum + c.total, 0))

  const sumCountryReports = Math.max(1, countries.reduce((sum, c) => sum + c.reports, 0))
  const maxPortRecords = Math.max(1, ...data.ports.map((p) => p.records))
  const totalReports = data.sources.reduce((sum, s) => sum + s.reports, 0)
  const topPortRecords = data.ports.reduce((sum, p) => sum + p.records, 0)
  const sumViolationCount = Math.max(1, data.violations.reduce((sum, v) => sum + v.count, 0))
  const timelineStart = activeTimeWindow.start
  const timelineEnd = activeTimeWindow.end
  const timelineSpan = Math.max(1, timelineEnd - timelineStart)
  const timelineTicks = Array.from({ length: 7 }, (_, i) => timelineStart + (timelineSpan * i) / 6)
  const providerData = data.providers || {}
  const dshieldFeeds = providerData.dshield?.subfeeds || {}
  const timelineProviders = {
    dshield: dshieldFeeds.daily_summary,
    dshieldPorts: dshieldFeeds.top_ports,
    nvd: providerData.nvd,
    kev: providerData.cisa_kev,
    cloudflare: providerData.cloudflare_radar,
    threatfox: providerData.threatfox,
  }
  // Cloudflare timeline events are REAL retained-snapshot timestamps from
  // the history manifest (one event per snapshot; value = pair count).
  // No manifest on older deploys -> no events, honestly, never invented.
  const cloudflareTimelineEvents = useMemo(() => {
    const entries = cfManifest?.intervals?.[cfInterval]
    if (!Array.isArray(entries)) return []
    return entries
      .map((entry) => {
        const timestamp = Date.parse(entry?.generatedAt || '')
        return Number.isFinite(timestamp) && Number.isFinite(Number(entry?.pairCount))
          ? { timestamp, value: Number(entry.pairCount) }
          : null
      })
      .filter(Boolean)
  }, [cfManifest, cfInterval])
  const timelineRows = TIMELINE_TRACKS
    .filter((track) => timelineTrackVisible(track.key, attackFilters))
    .map((track) => {
      const events = track.key === 'cloudflare' ? cloudflareTimelineEvents : data.timeline[track.key] || []
      const eventsInWindow = events.filter((event) =>
        event.timestamp >= timelineStart && event.timestamp <= timelineEnd,
      )
      const status = track.key === 'cloudflare' && historicalCf
        ? 'HISTORICAL'
        : timelineSourceStatus(timelineProviders[track.key], eventsInWindow, timelineNow)
      return { ...track, events, status }
    })
  const hasTimelineEvents = timelineRows.some((track) =>
    track.events.some((event) => event.timestamp >= timelineStart && event.timestamp <= timelineEnd),
  )
  // Alerts derived ONLY from data already in the snapshots. Cloudflare
  // pair-change alerts need a previous retained snapshot; without one
  // there is simply no such alert (see the panel note).
  const threatAlerts = useMemo(() => buildThreatAlerts({
    nvd: data.nvdRecent,
    kev: data.kev?.recent || [],
    dailySummary: data.dailySummary,
    cloudflareCurrentPairs: effectiveCloudflarePairs,
    cloudflarePreviousPairs: cfPreviousPairs,
    cloudflareAsOf: cfIntervalMeta?.generatedAt || data.cloudflareRadar.generatedAt,
  }), [data.nvdRecent, data.kev, data.dailySummary, effectiveCloudflarePairs, cfPreviousPairs, cfIntervalMeta, data.cloudflareRadar.generatedAt])

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
    cloudflare: effectiveCloudflarePairs.length,
    ransomware: data.rbLeaks.length,
    exploited: data.kev?.recent?.length || 0,
    breaches: (data.rbGeo?.targets || []).length,
  }
  const freshnessItems = [
    { key: 'dshield-sources', label: 'DShield sources', provider: dshieldFeeds.source_locations },
    { key: 'dshield-ports', label: 'DShield ports', provider: dshieldFeeds.top_ports },
    { key: 'dshield-reports', label: 'DShield reports', provider: dshieldFeeds.daily_summary },
    { key: 'dshield-infocon', label: 'DShield InfoCon', provider: dshieldFeeds.infocon },
    { key: 'ipwho', label: 'ipwho.is geolocation', provider: providerData.ip_geolocation },
    { key: 'nvd', label: 'NIST NVD', provider: providerData.nvd },
    { key: 'kev', label: 'CISA KEV', provider: providerData.cisa_kev },
    { key: 'cloudflare-radar', label: 'Cloudflare Radar', provider: providerData.cloudflare_radar },
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
    ? cloudflareMapData.countryCodeById.get(selectedIntel.id)
    : null
  const selectedCountryPairs = selectedCountryAlpha2
    ? pairsForCountry(effectiveCloudflarePairs, selectedCountryAlpha2)
    : { outbound: [], inbound: [] }
  const selectedOutboundPairs = selectedCountryPairs.outbound
  const selectedInboundPairs = selectedCountryPairs.inbound
  const selectedSource = selectedIntel?.type === 'source'
    ? data.sources.find((source) => source.ip === selectedIntel.id)
    : null
  const selectedCloudflareArc = selectedIntel?.type === 'cloudflare-pair'
    ? cloudflareMapData.arcs.find((arc) => arc.key === selectedIntel.id)
    : null
  const selectedPort = selectedIntel?.type === 'port'
    ? data.ports.find((port) => String(port.port) === selectedIntel.id) || null
    : null
  const selectedPortRank = selectedPort ? data.ports.findIndex((port) => port.port === selectedPort.port) + 1 : null

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
                {layers.cloudflareHighlights && (
                <g className="gtw__cf-country-highlights" pointerEvents="none">
                  {[...cloudflareMapData.roles].map(([countryId, role]) => {
                    const country = cloudflareMapData.countryFeatureById.get(countryId)
                    if (!country) return null
                    const d = path(country) || undefined
                    return (
                      <g key={`radar-country-${countryId}`}>
                        {role.originValue !== undefined && (
                          <path
                            d={d}
                            className="gtw__cf-origin"
                            fillOpacity={role.originOpacity}
                          >
                            <title>{`${country.properties?.name} · Cloudflare Radar origin country · ${role.originValue.toFixed(2)} summed pair share`}</title>
                          </path>
                        )}
                        {role.targetValue !== undefined && (
                          <path
                            d={d}
                            className="gtw__cf-target"
                            fillOpacity={role.targetOpacity}
                          >
                            <title>{`${country.properties?.name} · Cloudflare Radar target country · ${role.targetValue.toFixed(2)} summed pair share`}</title>
                          </path>
                        )}
                      </g>
                    )
                  })}
                </g>
                )}
                {layers.cloudflareArcs && cloudflareMapData.arcs.map((arc) => (
                  <g key={arc.key}>
                    <path
                      d={arc.d}
                      className="gtw__cf-arc-hit"
                      role="button"
                      tabIndex={0}
                      aria-label={`Inspect aggregated Cloudflare Radar pair from ${arc.originCountryName} to ${arc.targetCountryName}, ${arc.value}%`}
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
                      <title>{`${arc.originCountryName} → ${arc.targetCountryName} · ${arc.value}%`}</title>
                    </path>
                    <path
                      id={arc.pathId}
                      d={arc.d}
                      markerEnd={(cloudflareLiveStatus === 'LIVE' || cloudflareLiveStatus === 'RECENT') && !historicalCf ? 'url(#gtw-cf-arrow)' : undefined}
                      className={`gtw__cf-arc${cloudflareLiveStatus !== 'LIVE' && cloudflareLiveStatus !== 'RECENT' ? ' gtw__cf-arc--static' : ''}${selectedIntel?.type === 'cloudflare-pair' && selectedIntel.id === arc.key ? ' is-selected' : ''}`}
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

            {(historicalMapFilterActive || historicalCf) && (
              <div className="gtw__map-history-statuses" role="status">
                {historicalMapFilterActive && (
                  <p className="gtw__map-history-status">
                    {visibleSources.length
                      ? `Showing ${visibleSources.length} DShield locations with timestamps in the selected window.`
                      : 'No timestamped DShield source locations exist for this time window; current snapshot locations are hidden.'}
                  </p>
                )}
                {historicalCf && (
                  <p className="gtw__map-history-status">
                    Historical Cloudflare snapshot {fmtUtcTimestamp(historicalCf.generatedAt)} — pairs, highlights, arcs and rankings are from that retained snapshot, not live data. Select “Latest snapshot” to return to live data.
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
                      <h3>Cloudflare Radar · aggregated Layer 7 · {cfInterval}{historicalCf ? ' · historical snapshot' : ''}</h3>
                      {historicalCf && (
                        <p>Historical snapshot {fmtUtcTimestamp(historicalCf.generatedAt)} — pairs below are from that retained snapshot.</p>
                      )}
                      {selectedCountryAlpha2 ? (
                        <>
                          <p>Outbound pairs in returned top 50: {selectedOutboundPairs.length}</p>
                          <ul>
                            {selectedOutboundPairs.map((pair) => (
                              <li key={`out:${pair.targetCountryAlpha2}`}>
                                <span>To {pair.targetCountryName}</span>
                                <strong>{pair.value}%</strong>
                              </li>
                            ))}
                          </ul>
                          <p>Inbound pairs in returned top 50: {selectedInboundPairs.length}</p>
                          <ul>
                            {selectedInboundPairs.map((pair) => (
                              <li key={`in:${pair.originCountryAlpha2}`}>
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
                        <dt>Interval</dt><dd>{cfInterval}{historicalCf ? ` · historical snapshot ${fmtUtcTimestamp(historicalCf.generatedAt)}` : ''}</dd>
                        <dt>Snapshot generated</dt><dd>{fmtUtcTimestamp(historicalCf?.generatedAt || cfIntervalMeta?.generatedAt || data.cloudflareRadar.generatedAt)}</dd>
                        <dt>Upstream updated</dt><dd>{fmtUtcTimestamp(effectiveCloudflareMeta?.lastUpdated)}</dd>
                        <dt>Range / units</dt>
                        <dd>{formatCloudflareDateRange(effectiveCloudflareMeta?.dateRange)} · {formatCloudflareUnits(effectiveCloudflareMeta?.units)}</dd>
                        <dt>Status</dt><dd>{cloudflareDisplayStatus}</dd>
                      </dl>
                      <p className="gtw__aside-note">This is an aggregated country pair, not an individual attack, packet, or DShield route. Pulses on the map are aggregate motion along real arcs, not individual packets.</p>
                    </>
                  ) : <p className="gtw__aside-note">This pair is no longer present in the latest Cloudflare Radar snapshot.</p>
                ) : selectedIntel.type === 'port' ? (
                  selectedPort ? (
                    <dl>
                      <dt>Port</dt><dd>{selectedPort.port}</dd>
                      <dt>Protocol</dt><dd>{PORT_PROTOCOL[selectedPort.port] || 'not verified'}</dd>
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
              <span><i className="gtw__radar-swatch gtw__radar-swatch--origin" />Cloudflare origins</span>
              <span><i className="gtw__radar-swatch gtw__radar-swatch--target" />Cloudflare targets</span>
              <span><i className="gtw__radar-swatch gtw__radar-swatch--arc" />Aggregated pair arcs</span>
              <small>Cloudflare Radar — Aggregated Layer 7 attack intelligence.</small>
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
                              : c.key === 'cloudflare'
                                ? `${categoryCounts[c.key].toLocaleString('en-US')} aggregated country pairs · ${cfInterval} interval${historicalCf ? ' · historical snapshot' : ''}`
                                : c.noSource
                                  ? 'No enabled, licensed geographic source — toggling this only shows or hides this notice; nothing is plotted.'
                                  : `${categoryCounts[c.key].toLocaleString('en-US')} provider records · no verified map coordinates`}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="gtw__aside-note">
                  Only DShield source locations are currently geolocated. KEV records and the disabled ransomware/breach feeds do not provide enabled map coordinates. Exploited flaws have no map geography — that filter shows or hides the KEV/NVD panels and timeline tracks instead.
                </p>
                {!attackFilters.cloudflare && (
                  <p className="gtw__aside-note">Cloudflare Radar pairs hidden — enable the Cloudflare Radar pairs filter to show arcs, country highlights and pair details.</p>
                )}
                {!attackFilters.exploited && (
                  <p className="gtw__aside-note">Exploited flaws hidden — the vulnerability-weakness panel and the NVD/KEV timeline tracks are hidden until the filter is enabled again.</p>
                )}
                {attackFilters.ransomware && (
                  <p className="gtw__aside-note">Ransomware: no enabled, licensed geographic source exists for this map, so nothing is plotted for this filter and no activity is invented.</p>
                )}
                {attackFilters.breaches && (
                  <p className="gtw__aside-note">Breaches: the breach feed is disabled pending permission, so nothing is plotted for this filter and no activity is invented.</p>
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
                {cfPreviousPairs === null && (
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
                    historicalCfFetchedRef.current = null
                    setHistoricalCf(null)
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
                DShield reports, ports and CISA KEV use provider-supplied daily dates; NVD and available ThreatFox use hourly timestamps.
                DShield source-location records in this snapshot have no per-IP observation time, so historical selections hide those markers instead of presenting current locations as historical. Playback follows provider-timestamped timeline events; destination routes are not available.
                The Cloudflare Radar track shows one event per retained snapshot (value = pair count, resolution “snapshot”); playback into a retained snapshot swaps the map to that snapshot and labels Cloudflare HISTORICAL. When no history manifest exists, the track is empty and playback stays on the current snapshot — history is never invented.
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
              <p className="gtw__interval-note">
                Window: {cfIntervalMeta?.window
                  ? `${fmtUtcTimestamp(cfIntervalMeta.window.dateStart)} – ${fmtUtcTimestamp(cfIntervalMeta.window.dateEnd)}`
                  : formatCloudflareDateRange(effectiveCloudflareMeta?.dateRange)}
                {' · '}Upstream updated: {fmtUtcTimestamp(effectiveCloudflareMeta?.lastUpdated)}
                {' · '}Snapshot generated: {fmtUtcTimestamp(historicalCf?.generatedAt || cfIntervalMeta?.generatedAt || data.cloudflareRadar.generatedAt)}
                {' · '}Status: {cfIntervalMeta?.intervalStatus === 'unavailable' ? 'UNAVAILABLE' : cloudflareDisplayStatus}
              </p>
              {cfIntervalMeta?.intervalError && (
                <p className="gtw__error" role="alert">The {cfInterval} Cloudflare file is unavailable right now ({cfIntervalMeta.intervalError}). Showing no pairs for this interval rather than stale data.</p>
              )}
              <p className="gtw__interval-note">DShield, NVD and CISA KEV are daily-resolution — their rankings do not change with this selector. Provider snapshots refresh every 15 minutes. Freshness is shown per feed.</p>
            </div>
            <ul className="gtw__provider-freshness" aria-label="Provider freshness">
              {freshnessItems.map(({ key, label, provider }) => {
                const isCloudflare = key === 'cloudflare-radar'
                const freshness = isCloudflare ? cloudflareFreshness(provider) : providerFreshness(provider)
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
                    {isCloudflare && provider?.error && <span className="gtw__provider-freshness-error">{provider.error}</span>}
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
            {!attackFilters.cloudflare && <p className="gtw__aside-note">Cloudflare Radar pairs are hidden by the filter — enable it to show this ranking.</p>}
            {attackFilters.cloudflare && cfOriginRanking.length === 0 && !errors.cloudflare && <p className="gtw__empty">Loading…</p>}
            {attackFilters.cloudflare && cfOriginRanking.length === 0 && errors.cloudflare && (
              <p className="gtw__aside-note">No Cloudflare Radar pairs for the {cfInterval} interval ({errors.cloudflare}).</p>
            )}
            {attackFilters.cloudflare && (
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
            <p className="gtw__aside-note">Cloudflare Radar origin-country totals (sum of reported pair %) for the selected {cfInterval} interval{historicalCf ? ' · historical snapshot' : ''}. Source: Cloudflare Radar.</p>
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
            {!attackFilters.cloudflare && <p className="gtw__aside-note">Cloudflare Radar pairs are hidden by the filter — enable it to show this ranking.</p>}
            {attackFilters.cloudflare && cfTargetRanking.length === 0 && !errors.cloudflare && <p className="gtw__empty">Loading…</p>}
            {attackFilters.cloudflare && cfTargetRanking.length === 0 && errors.cloudflare && (
              <p className="gtw__aside-note">No Cloudflare Radar pairs for the {cfInterval} interval ({errors.cloudflare}).</p>
            )}
            {attackFilters.cloudflare && (
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
            <p className="gtw__aside-note">Cloudflare Radar target-country totals (sum of reported pair %) for the selected {cfInterval} interval{historicalCf ? ' · historical snapshot' : ''}. Source: Cloudflare Radar. Breach geography is not shown while the Recent Breaches feed is disabled pending permission.</p>
              </>
            )}
          </section>

          <section className="gtw__panel" aria-labelledby="vectors-h">
            <h2 id="vectors-h" className="gtw__panel-title">Top network attack vectors</h2>
            {data.ports.length === 0 && !errors.ports && <p className="gtw__empty">Loading…</p>}
            {data.ports.length === 0 && errors.ports && (
              <p className="gtw__error" role="alert">The DShield top ports feed is unavailable right now ({errors.ports}).</p>
            )}
            <ol className="gtw__bars">
              {data.ports.map((p) => (
                <li key={p.port}>
                  <span className="gtw__bars-label" style={{ color: CAT_BY_KEY.ransomware.color }}>{PORT_NAMES[p.port] || 'Service'} · {p.port}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill" style={{ width: `${Math.max(4, (p.records / maxPortRecords) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">
                    {topPortRecords ? `${Math.round((p.records / topPortRecords) * 100)} %` : '—'}
                  </span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Most-probed services, as a share of the most-probed ports&rsquo; reports. There is no free live feed of flood-type vector volumes, so the vectors are shown by probed port. Source: DShield.</p>
          </section>

          <section className="gtw__panel" aria-labelledby="violations-h">
            <h2 id="violations-h" className="gtw__panel-title">Top Published Vulnerability Weaknesses</h2>
            {!attackFilters.exploited && (
              <p className="gtw__aside-note">Exploited flaws are hidden by the filter — enable “Exploited flaws” to show this panel and the NVD/KEV timeline tracks. Exploited flaws have no map geography.</p>
            )}
            {attackFilters.exploited && data.violations.length === 0 && !errors.nvd && <p className="gtw__empty">Loading…</p>}
            {attackFilters.exploited && errors.nvd && (
              <p className="gtw__error" role="alert">The NVD feed is unavailable right now ({errors.nvd}).</p>
            )}
            {attackFilters.exploited && (
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
            )}
            <p className="gtw__aside-note">Weakness types (CWE) in the vulnerabilities published in the last 48 hours — published classifications, not observed violations. Source: NIST NVD.</p>
          </section>

          <section className="gtw__panel" aria-labelledby="ports-h">
            <h2 id="ports-h" className="gtw__panel-title">Top scanned UDP / TCP ports</h2>
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
                  <span className="gtw__port-num">{p.port}</span>
                  <span className="gtw__port-proto">{PORT_PROTOCOL[p.port] || '—'}</span>
                  <span className="gtw__port-name">{PORT_NAMES[p.port] || 'Service'}</span>
                  <span className="gtw__port-records">{p.records.toLocaleString('en-US')} reports</span>
                </button>
              ))}
            </div>
            <p className="gtw__aside-note">Ports the sensors saw probed most, by report count. Source: DShield. {totalReports > 0 && `${totalReports.toLocaleString('en-US')} reports from the ${data.sources.length} plotted sources in the current window.`}</p>
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
