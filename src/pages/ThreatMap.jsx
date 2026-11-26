import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-110m.json'
import { useMeta } from '../hooks/useMeta.js'
import InfoBar from '../components/InfoBar.jsx'
import Newsletter from '../components/Newsletter.jsx'
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
 * figure comes from our own live feeds.
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
 *  - CISA Known Exploited Vulnerabilities catalog — 15-minute snapshot,
 *    because CISA sends no CORS headers; it powers the "flaws
 *    confirmed exploited" counter only.
 *
 * Honest substitutions, labelled on the page: the "top network attack
 * vectors" panel is the most-probed services from DShield's top ports,
 * shown as a share of those ports' reports — there is no free live
 * feed of flood-type vector volumes. Country outlines remain neutral;
 * source and target locations are derived from the available provider data.
 * The arcs connect reported source locations as visual motion, not
 * claimed attack routes, and use only locations supplied by the feeds.
 * The timeline shows DShield daily totals, NVD publications, KEV additions
 * and, when licensing is cleared, ThreatFox indicators using provider
 * timestamps where available.
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
const REFRESH_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 15000
const INITIAL_TIMELINE_TIME = Date.now()

// Categories retain their identities in the data; map and legend accents
// use white for a consistent monochrome presentation.
const CATEGORIES = [
  { key: 'scanning', label: 'Scanning', color: '#FFFFFF', note: 'Probing of exposed ports, reported by volunteer sensors.' },
  { key: 'ransomware', label: 'Ransomware', color: '#FFFFFF', note: 'Victims posted to extortion leak sites.' },
  { key: 'exploited', label: 'Exploited flaws', color: '#FFFFFF', note: 'Vulnerabilities CISA confirms are in active use.' },
  { key: 'breaches', label: 'Breaches', color: '#FFFFFF', note: 'Disclosed incidents and regulator filings.' },
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

function fmtDayShort(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function arcPath(a, b) {
  // A gentle arc between two projected points, lifted above the straight line.
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dist = Math.hypot(dx, dy) || 1
  const lift = Math.min(90, dist * 0.22)
  const cx = mx - (dy / dist) * lift
  const cy = my - (dx / dist) * lift
  return `M ${a[0]} ${a[1]} Q ${cx} ${cy} ${b[0]} ${b[1]}`
}

const TIMELINE_TRACKS = [
  { key: 'dshield', label: 'DShield daily reports', resolution: 'day' },
  { key: 'dshieldPorts', label: 'DShield top ports', resolution: 'day' },
  { key: 'nvd', label: 'NVD CVE publications', resolution: 'hour' },
  { key: 'kev', label: 'CISA KEV additions', resolution: 'day' },
  { key: 'threatfox', label: 'ThreatFox indicators', resolution: 'hour' },
]

const LIVE_WINDOW_MS = 20 * 60 * 1000
const RECENT_WINDOW_MS = 60 * 60 * 1000
const STALE_WINDOW_MS = 24 * 60 * 60 * 1000

function providerFreshness(provider, now = Date.now()) {
  const timestamp = Date.parse(provider?.fetchedAt || provider?.lastSuccessfulAt || '')
  if (!Number.isFinite(timestamp)) return 'OFFLINE'
  const age = Math.max(0, now - timestamp)
  if (provider.status === 'live' && age <= LIVE_WINDOW_MS) return 'LIVE'
  if (age <= RECENT_WINDOW_MS) return 'RECENT'
  if (age <= STALE_WINDOW_MS) return 'STALE'
  return 'OFFLINE'
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

function ActivityTrack({ events, start, end, resolution }) {
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
      event.timestamp > end
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
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [hovered, setHovered] = useState(null)
  const [chip, setChip] = useState(null)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [timelineCollapsed, setTimelineCollapsed] = useState(false)
  const mounted = useRef(true)
  const mapWrapRef = useRef(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    const nextErrors = {}
    try {
      const snapshot = await fetchJson(THREAT_INTEL_SNAPSHOT)
      if (!snapshot?.dashboard || !snapshot?.providers) {
        throw new Error('The threat-intel snapshot has an unexpected shape')
      }

      const dashboard = snapshot.dashboard
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
      setData({
        sources,
        ports,
        violations,
        threatfox,
        threatfoxStatus: threatFoxStatus,
        providers: snapshot.providers,
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
      })
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

  const projection = useMemo(() => geoNaturalEarth1().fitSize([MAP_W, MAP_H], LAND), [])
  const path = useMemo(() => geoPath(projection), [projection])
  const graticulePath = useMemo(() => path(geoGraticule()), [path])

  // Pin the country's name to the cursor in addition to the map readout.
  const onCountryHover = (e, info, name) => {
    const rect = mapWrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setChip({
      name: info?.country || name,
      x: Math.min(x + 14, rect.width - 120),
      y: Math.max(y - 16, 8),
    })
    if (info) setHovered(info)
  }

  // Provider-derived categories identify real source and target locations
  // for hover descriptions; they do not alter the monochrome map styling.
  const { countryPaths, nodes, arcs, targets } = useMemo(() => {
    const totals = new Map()
    for (const s of data.sources) {
      const cur = totals.get(s.countryCode) || { country: s.country, code: s.countryCode, reports: 0, sources: 0 }
      cur.reports += s.reports
      cur.sources += 1
      totals.set(s.countryCode, cur)
    }
    const leakCodes = new Set(
      (data.rbLeaks || []).map((l) => NAME_TO_CODE[l.country]).filter(Boolean),
    )
    // Limit breach-target countries to the top five so the target layer
    // remains focused on the strongest available provider records.
    const attackedCodes = new Set(
      ((data.rbGeo?.targets || []).slice(0, 5).map((t) => NAME_TO_CODE[t.country])).filter(Boolean),
    )
    // Preserve the source/target category used for hover descriptions and
    // endpoint selection without changing the map's monochrome country fill.
    const categoryOf = (code) => {
      if (totals.has(code)) return 'scanning'
      if (leakCodes.has(code)) return 'ransomware'
      if (attackedCodes.has(code)) return 'breaches'
      return null
    }
    const infoById = new Map()
    for (const [code, c] of totals) {
      const num = COUNTRY_NUMERIC[code]
      const cat = categoryOf(code)
      if (num && cat) infoById.set(num, { ...c, category: cat })
    }
    // Include real breach-target and ransomware-victim countries that
    // filed no top source so their endpoints remain available.
    for (const code of [...attackedCodes, ...leakCodes]) {
      if (totals.has(code)) continue
      const num = COUNTRY_NUMERIC[code]
      const cat = categoryOf(code)
      if (num && cat) {
        const name = (data.rbGeo?.targets || []).find((t) => NAME_TO_CODE[t.country] === code)?.country || code
        infoById.set(num, { country: name, code, reports: 0, sources: 0, category: cat })
      }
    }
    const countryPaths = COUNTRIES.features.map((f, i) => {
      const info = infoById.get(String(f.id))
      const name = f.properties?.name || ''
      return (
        <path
          key={i}
          d={path(f) || undefined}
          className="gtw__country"
          onMouseEnter={() => info && setHovered(info)}
          onMouseMove={(e) => onCountryHover(e, info, name)}
          onMouseLeave={() => { setHovered(null); setChip(null) }}
          onFocus={() => info && setHovered(info)}
          onBlur={() => setHovered(null)}
        >
          <title>
            {info
              ? info.reports > 0
                ? `${name} — ${CAT_BY_KEY[info.category].label} · ${info.reports.toLocaleString('en-US')} reports from ${info.sources} source${info.sources === 1 ? '' : 's'}`
                : `${name} — ${CAT_BY_KEY[info.category].label}`
              : name}
          </title>
        </path>
      )
    })
    const maxReports = Math.max(1, ...data.sources.map((s) => s.reports))
    const nodes = data.sources.map((s) => {
      const [x, y] = projection([s.lon, s.lat]) || [0, 0]
      const r = 2.5 + (Math.sqrt(s.reports / maxReports) * 5)
      return { ...s, id: s.ip, x, y, r, category: 'scanning' }
    })
    // Target points: the centroids of the breach-target and
    // ransomware-victim countries (real countries from our own feeds,
    // not top sources, so they have no node dot yet). Arcs run to them
    // from the top sources, so the map reads busy like the Radware
    // screenshot — every endpoint is still a real country from our data.
    const featureById = new Map(COUNTRIES.features.map((f) => [String(f.id), f]))
    const centroidOf = (code) => {
      const feat = featureById.get(COUNTRY_NUMERIC[code] || '')
      if (!feat) return null
      const c = path.centroid(feat)
      return Number.isFinite(c[0]) && Number.isFinite(c[1]) ? c : null
    }
    const targets = []
    for (const code of [...attackedCodes, ...leakCodes]) {
      if (totals.has(code) || targets.some((t) => t.code === code)) continue
      const c = centroidOf(code)
      if (!c) continue
      const cat = categoryOf(code)
      if (!cat) continue
      targets.push({
        id: `t:${code}`,
        code,
        category: cat,
        x: c[0],
        y: c[1],
      })
    }
    // Arcs run between every pair of most-reported sources and from
    // every source out to the breach-target and ransomware-victim
    // countries — a dense web. They are
    // motion, not claimed attack routes: DShield reports where the
    // sources are, not where each packet was aimed. Arcs are white.
    const arcs = []
    const seen = new Set()
    const addArc = (a, b) => {
      if (!a || !b || a.id === b.id) return
      if (a.countryCode && a.countryCode === b.code) return
      const key = `${a.id}>${b.id}`
      if (seen.has(key)) return
      seen.add(key)
      arcs.push({ key, d: arcPath([a.x, a.y], [b.x, b.y]) })
    }
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) addArc(nodes[i], nodes[j])
      for (const t of targets) addArc(nodes[i], t)
    }
    return { countryPaths, nodes, arcs, targets }
  }, [data.sources, data.rbGeo, data.rbLeaks, path, projection])

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

  const maxCountryReports = Math.max(1, ...countries.map((c) => c.reports))
  const sumCountryReports = Math.max(1, countries.reduce((sum, c) => sum + c.reports, 0))
  const maxPortRecords = Math.max(1, ...data.ports.map((p) => p.records))
  const totalReports = data.sources.reduce((sum, s) => sum + s.reports, 0)
  const geoTargets = (data.rbGeo?.targets || []).slice(0, 5)
  const sumTargetCount = Math.max(1, geoTargets.reduce((sum, t) => sum + t.count, 0))
  const topPortRecords = data.ports.reduce((sum, p) => sum + p.records, 0)
  const sumViolationCount = Math.max(1, data.violations.reduce((sum, v) => sum + v.count, 0))
  const timelineNow = updatedAt?.getTime() ?? INITIAL_TIMELINE_TIME
  const timelineStartDate = new Date(timelineNow)
  timelineStartDate.setUTCHours(0, 0, 0, 0)
  timelineStartDate.setUTCDate(timelineStartDate.getUTCDate() - 6)
  const timelineStart = timelineStartDate.getTime()
  const timelineTicks = Array.from({ length: 7 }, (_, i) => timelineStart + i * 24 * 60 * 60 * 1000)
  const providerData = data.providers || {}
  const dshieldFeeds = providerData.dshield?.subfeeds || {}
  const timelineProviders = {
    dshield: dshieldFeeds.daily_summary,
    dshieldPorts: dshieldFeeds.top_ports,
    nvd: providerData.nvd,
    kev: providerData.cisa_kev,
    threatfox: providerData.threatfox,
  }
  const timelineRows = TIMELINE_TRACKS.map((track) => {
    const events = data.timeline[track.key] || []
    return {
      ...track,
      events,
      status: timelineSourceStatus(timelineProviders[track.key], events, timelineNow),
    }
  })
  const freshnessItems = [
    { key: 'dshield-sources', label: 'DShield sources', provider: dshieldFeeds.source_locations },
    { key: 'dshield-ports', label: 'DShield ports', provider: dshieldFeeds.top_ports },
    { key: 'dshield-reports', label: 'DShield reports', provider: dshieldFeeds.daily_summary },
    { key: 'dshield-infocon', label: 'DShield InfoCon', provider: dshieldFeeds.infocon },
    { key: 'ipwho', label: 'ipwho.is geolocation', provider: providerData.ip_geolocation },
    { key: 'nvd', label: 'NIST NVD', provider: providerData.nvd },
    { key: 'kev', label: 'CISA KEV', provider: providerData.cisa_kev },
    { key: 'threatfox', label: 'ThreatFox', provider: providerData.threatfox },
    { key: 'recent-breaches', label: 'Recent Breaches', provider: providerData.recent_breaches },
  ]

  return (
    <div className={`gtw${railCollapsed ? ' gtw--rail-hidden' : ''}`}>
      {/* --- The stage: full-bleed dark map + right rail --- */}
      <div className="gtw__stage">
        <div className="gtw__mapcol">
          <div className="gtw__mapwrap" ref={mapWrapRef} aria-label="World map of most-reported attacking source addresses">
            <svg
              className="gtw__svg"
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              preserveAspectRatio="xMidYMid slice"
              role="img"
              aria-label="World map showing the locations of the most-reported attacking IP addresses, with arcs tracing them in ranked order."
            >
              <defs>
                <pattern id="gtw-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                  <path d="M 36 0 H 0 V 36" className="gtw__map-grid" />
                </pattern>
              </defs>
              <rect width={MAP_W} height={MAP_H} fill="url(#gtw-grid)" />
              <path d={graticulePath || undefined} className="gtw__graticule" />
              {countryPaths}
              {arcs.map((a) => (
                <path key={a.key} d={a.d} className="gtw__arc" />
              ))}
              {arcs.slice(0, 14).map((a, i) => (
                <circle key={`mover-${a.key}`} r="2.2" className="gtw__mover">
                  <animateMotion dur={`${5 + (i % 4)}s`} repeatCount="indefinite" path={a.d} />
                </circle>
              ))}
              {nodes.map((n) => (
                <g key={n.ip} className="gtw__node">
                  <circle cx={n.x} cy={n.y} r={n.r + 6} className="gtw__pulse" />
                  <circle cx={n.x} cy={n.y} r={n.r} className="gtw__dot" />
                </g>
              ))}
              {targets.map((t) => (
                <circle key={t.id} cx={t.x} cy={t.y} r="2.5" className="gtw__mover" />
              ))}
            </svg>

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
                ? hovered.reports > 0
                  ? `${hovered.country} — ${CAT_BY_KEY[hovered.category].label} · ${hovered.reports.toLocaleString('en-US')} reports from ${hovered.sources} source${hovered.sources === 1 ? '' : 's'}`
                  : `${hovered.country} — ${CAT_BY_KEY[hovered.category].label}`
                : 'Hover a country for its figures'}
            </p>

            {/* Left column over the map: attack types + threat alerts */}
            <div className="gtw__overlay" aria-label="Attack types and threat alerts">
              <section className="gtw__panel">
                <h2 className="gtw__panel-title">Attack types</h2>
                <ul className="gtw__legend">
                  {CATEGORIES.map((c) => (
                    <li key={c.key}>
                      <span className="gtw__legend-check" style={{ borderColor: c.color, color: c.color }} aria-hidden="true">✓</span>
                      <span><strong style={{ color: c.color }}>{c.label}</strong></span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="gtw__panel gtw__wire" aria-labelledby="wire-h">
                <h2 id="wire-h" className="gtw__panel-title">ThreatFox indicators</h2>
                {data.threatfox.length === 0 && !errors.threatfox && (
                  <p className="gtw__empty">
                    {data.threatfoxStatus === 'disabled_license'
                      ? 'Not fetched pending commercial-use eligibility or a paid subscription.'
                      : 'No indicators in the latest snapshot.'}
                  </p>
                )}
                {errors.threatfox && (
                  <p className="gtw__error" role="alert">ThreatFox status: {errors.threatfox}</p>
                )}
                <ol className="gtw__wire-list">
                  {data.threatfox.slice(0, 4).map((indicator) => (
                    <li key={indicator.id || `${indicator.ioc}:${indicator.firstSeen}`}>
                      <strong>{indicator.ioc}</strong>
                      <span className="gtw__wire-text">
                        {indicator.malware || indicator.threatType || indicator.iocType || 'Threat indicator'}
                      </span>
                      <span className="meta">
                        {indicator.iocType || 'IOC'}{indicator.firstSeen ? ` · first seen ${indicator.firstSeen}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="gtw__aside-note">
                  <a href="https://threatfox.abuse.ch/" target="_blank" rel="noopener noreferrer">abuse.ch ThreatFox</a>
                  is disabled pending commercial-use eligibility or a paid subscription.
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
              <span className="gtw__timeline-collapsed-label">Threat activity — last 7 days · collapsed</span>
              <button type="button" className="gtw__timeline-show" onClick={() => setTimelineCollapsed(false)}>
                Show timeline
              </button>
            </div>
          ) : (
            <section className="gtw__timeline" aria-label="Threat activity timeline, last seven days">
              <div className="gtw__timeline-head">
                <h3 className="gtw__panel-title">Threat activity — last 7 days</h3>
                <button
                  type="button"
                  className="gtw__timeline-collapse"
                  onClick={() => setTimelineCollapsed(true)}
                  aria-label="Collapse timeline"
                >
                  ✕ Collapse
                </button>
              </div>
              <div className="gtw__timeline-content">
                <div className="gtw__timeline-main">
                  <div className="gtw__timeline-axis" aria-hidden="true">
                    <div className="gtw__timeline-axis-plot">
                      {timelineTicks.map((tick, i) => (
                        <span
                          key={tick}
                          className={`gtw__timeline-label${i === 0 ? ' gtw__timeline-label--first' : ''}${i === timelineTicks.length - 1 ? ' gtw__timeline-label--last' : ''}`}
                          style={{ left: `${((tick - timelineStart) / (timelineNow - timelineStart)) * 100}%` }}
                        >
                          {fmtDayShort(new Date(tick).toISOString().slice(0, 10))}
                        </span>
                      ))}
                    </div>
                    <span className="gtw__timeline-now">NOW</span>
                  </div>
                  <div className="gtw__timeline-plot-layout">
                    <div className="gtw__timeline-plot">
                      <div className="gtw__timeline-grid" aria-hidden="true">
                        {timelineTicks.map((tick) => (
                          <span
                            key={tick}
                            style={{ left: `${((tick - timelineStart) / (timelineNow - timelineStart)) * 100}%` }}
                          />
                        ))}
                      </div>
                      <div className="gtw__timeline-rows">
                        {timelineRows.map((track) => (
                          <div className="gtw__timeline-row" key={track.key}>
                            <ActivityTrack
                              events={track.events}
                              start={timelineStart}
                              end={timelineNow}
                              resolution={track.resolution}
                            />
                          </div>
                        ))}
                      </div>
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
                Missing source timestamps are left blank rather than inferred.
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
            <p className="gtw__interval-note">Provider snapshots refresh every 15 minutes. Freshness is shown per feed.</p>
            <ul className="gtw__provider-freshness" aria-label="Provider freshness">
              {freshnessItems.map(({ key, label, provider }) => {
                const freshness = providerFreshness(provider)
                const timestamp = provider?.fetchedAt || provider?.lastSuccessfulAt || null
                const dataDate = provider?.dataDate
                const title = [
                  timestamp ? `Last successful refresh: ${formatUtcTimestamp(timestamp)}` : 'No successful refresh recorded',
                  dataDate ? `Source data date: ${dataDate}` : null,
                  provider?.error || null,
                ].filter(Boolean).join(' · ')
                return (
                  <li key={key} className={`gtw__provider-freshness-item gtw__provider-freshness-item--${freshness.toLowerCase()}`} title={title}>
                    <span className="gtw__provider-freshness-name">{label}</span>
                    <strong>{freshness}</strong>
                    {timestamp && <time dateTime={timestamp}>Last success · {formatUtcTimestamp(timestamp)}</time>}
                    {dataDate && <span className="gtw__provider-freshness-date">Source date: {dataDate}</span>}
                  </li>
                )
              })}
            </ul>
          </div>

          <section className="gtw__panel" aria-labelledby="attackers-h">
            <h2 id="attackers-h" className="gtw__panel-title">Top attackers</h2>
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
            <p className="gtw__aside-note">Source countries of the most-reported addresses, by share of the top five&rsquo;s reports. Source: DShield.</p>
          </section>

          <section className="gtw__panel" aria-labelledby="attacked-h">
            <h2 id="attacked-h" className="gtw__panel-title">Top attacked</h2>
            {geoTargets.length === 0 && !errors.rb && <p className="gtw__empty">Loading…</p>}
            {geoTargets.length === 0 && errors.rb && (
              <p className="gtw__aside-note">Recent Breaches data is disabled pending permission for this site&rsquo;s intended use.</p>
            )}
            <ol className="gtw__bars">
              {geoTargets.map((t) => (
                <li key={t.country}>
                  <span className="gtw__bars-label"><span className="gtw__flag" aria-hidden="true">{flagEmoji(NAME_TO_CODE[t.country])}</span>{t.country}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill" style={{ width: `${Math.max(4, (t.count / sumTargetCount) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{Math.round((t.count / sumTargetCount) * 100)} %</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Breach geography is not shown while the Recent Breaches feed is disabled pending permission.</p>
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
            <h2 id="violations-h" className="gtw__panel-title">Top application violations</h2>
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
            <p className="gtw__aside-note">Weakness types (CWE) in the vulnerabilities published in the last 48 hours. Source: NIST NVD.</p>
          </section>

          <section className="gtw__panel" aria-labelledby="ports-h">
            <h2 id="ports-h" className="gtw__panel-title">Top scanned UDP / TCP ports</h2>
            {data.ports.length === 0 && !errors.ports && <p className="gtw__empty">Loading…</p>}
            {data.ports.length === 0 && errors.ports && (
              <p className="gtw__error" role="alert">The DShield top ports feed is unavailable right now ({errors.ports}).</p>
            )}
            <div className="gtw__port-grid">
              {data.ports.map((p, i) => (
                <div className={`gtw__port-tile${i === 0 ? ' gtw__port-tile--hero' : ''}`} key={p.port}>
                  <span className="gtw__port-num">{p.port}</span>
                  <span className="gtw__port-proto">{PORT_PROTOCOL[p.port] || '—'}</span>
                  <span className="gtw__port-name">{PORT_NAMES[p.port] || 'Service'}</span>
                  <span className="gtw__port-records">{p.records.toLocaleString('en-US')} reports</span>
                </div>
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
          Arcs are motion, not claimed attack routes. ThreatFox is disabled pending commercial-use eligibility or a paid subscription; Recent Breaches is disabled pending permission.
          Attack vectors are most-probed services by port; application violations are CWE types in the last 48 hours of NVD CVEs.
        </p>
      </div>
    </div>
  )
}
