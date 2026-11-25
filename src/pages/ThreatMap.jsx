import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-110m.json'
import { useMeta } from '../hooks/useMeta.js'
import './ThreatMap.css'

/**
 * LIVE CYBER THREAT MAP — Offline Theory's live threat map, in the exact
 * layout of the Radware Live Threat Map screenshot Miah supplied:
 * brand block top-left, red callout button top-centre, LIVE / REFRESH
 * buttons top-right, ATTACK TYPES legend and THREAT ALERTS panels down
 * the left over the map, a full-bleed dark map with teal outlines and
 * coloured country fills, a right rail (statistics interval, top
 * attackers, top attacked, attack vectors, application violations,
 * scanned ports), and a coloured multi-row timeline strip along the
 * bottom with a COLLAPSE control. A thin footer bar ends the page.
 *
 * Nothing of Radware's is copied: no Radware name, logo, report text,
 * "Contact Sales", or copyright line, and none of Radware's numbers or
 * category names. The categories are ours — Scanning, Ransomware,
 * Exploited Flaws, Breaches — each with its own colour, and every
 * figure comes from our own live feeds.
 *
 * Real data only — nothing simulated or invented. Live from the browser
 * (all CORS-open, no key):
 *  - SANS Internet Storm Center (DShield) — most-reported attacking
 *    source IPs, most-targeted ports, InfoCon, and a 7-day daily
 *    summary of sensor reports.
 *  - ipwho.is — geolocates those source IPs (lat/lon + country).
 *  - NIST NVD API — vulnerabilities published or modified in the last
 *    48 hours; the top weakness types (CWE) in those CVEs fill the
 *    "top application violations" panel.
 *  - Recent Breaches (recentbreaches.com) — free CORS-open JSON API:
 *    breach index (24h / 7d counts), breach geography by target
 *    country, and ransomware leak-site listings for the Threat Alerts
 *    panel. Attribution is shown on the page, as their licence
 *    requires. Their iframe widgets were not used: an iframe cannot
 *    be restyled, and the map widget would duplicate the map.
 *  - CISA Known Exploited Vulnerabilities catalog — hourly snapshot,
 *    because CISA sends no CORS headers; it powers the "flaws
 *    confirmed exploited" counter only.
 *
 * Honest substitutions, labelled on the page: the "top network attack
 * vectors" panel is the most-probed services from DShield's top ports,
 * shown as a share of those ports' reports — there is no free live
 * feed of flood-type vector volumes. Countries are coloured by the
 * dominant category among their own reported data: red = scanning
 * sources (DShield), purple = breach targets (Recent Breaches),
 * yellow = ransomware victims (leak listings that name a country);
 * exploited flaws have no geography in any feed, so they colour no
 * country. Arcs trace the ranked order of the most-reported sources —
 * motion, not claimed attack routes. The timeline rows trace the real
 * DShield daily sensor-report trend of the last 7 days; the feeds
 * publish no per-category history, so every row shows that same real
 * trend in its own colour, and the strip says so.
 *
 * Feeds that are NOT on this page, and why: abuse.ch Feodo Tracker
 * has effectively stopped updating (last blocklist update March 2026),
 * URLhaus and ThreatFox download endpoints answer 410 Gone, and
 * Brandefense's ThreatMap sends X-Frame-Options: SAMEORIGIN, so it
 * cannot be embedded, and publishes no public feed or API. DStrak's
 * map is a search-library feature with no public embed or API either —
 * its underlying data is DShield, which this page already reads
 * directly. Because Feodo and URLhaus are gone, there is no free live
 * feed for malware or phishing volumes, so those two categories are
 * not shown as live counts.
 */

const ISC = 'https://isc.sans.edu/api'
const RB = 'https://recentbreaches.com/api'
const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const KEV_SNAPSHOT = `${import.meta.env.BASE_URL}data/kev-snapshot.json`
const REFRESH_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 15000

// Our four categories, one colour each — the Radware screenshot's
// palette, applied to our own categories.
const CATEGORIES = [
  { key: 'scanning', label: 'Scanning', color: '#e5484d', note: 'Probing of exposed ports, reported by volunteer sensors.' },
  { key: 'ransomware', label: 'Ransomware', color: '#f0c13d', note: 'Victims posted to extortion leak sites.' },
  { key: 'exploited', label: 'Exploited flaws', color: '#5b8def', note: 'Vulnerabilities CISA confirms are in active use.' },
  { key: 'breaches', label: 'Breaches', color: '#8b5cf6', note: 'Disclosed incidents and regulator filings.' },
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
// Used to shade each country by the dominant category among its data.
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
// for the flag in the Top Attacked list and for colouring countries
// that appear as breach targets.
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

const MAP_BASE_FILL = '#0a1418'

const MAP_W = 1200
const MAP_H = 620

function fetchJson(url, { timeout = FETCH_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  return fetch(url, { signal: ctrl.signal })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .finally(() => clearTimeout(timer))
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function dateStrDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
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

// One waveform row of the timeline strip: the real DShield daily
// sensor-report trend of the last 7 days, drawn as an area chart in
// the category's colour. Every row traces the same real trend — the
// feeds publish no per-category history — and the strip says so.
function Waveform({ values, color }) {
  const w = 700
  const h = 40
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [
    (i / Math.max(1, values.length - 1)) * w,
    h - 3 - (v / max) * (h - 8),
  ])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="gtw__wave" aria-hidden="true">
      <path d={area} fill={color} opacity="0.16" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

export default function ThreatMap() {
  useMeta({
    title: 'Live Cyber Threat Map',
    description:
      'Live Cyber Threat Map — a live map of the attacks the internet is seeing right now: most-reported source addresses, most-targeted ports and countries, ransomware leak listings, exploited vulnerabilities and newly published CVEs, from free public feeds.',
  })

  const [data, setData] = useState({
    sources: [],
    ports: [],
    violations: [],
    infocon: null,
    kev: null,
    rbIndex: null,
    rbGeo: null,
    rbLeaks: [],
    timeline: [],
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [hovered, setHovered] = useState(null)
  const [interval, setInterval] = useState('1 hour')
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [timelineCollapsed, setTimelineCollapsed] = useState(false)
  const mounted = useRef(true)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    const nextErrors = {}
    const timelineDays = [6, 5, 4, 3, 2, 1, 0].map((d) => dateStrDaysAgo(d))
    const [topIps, topPorts, infocon, kevSnap, nvd, rbIndex, rbGeo, rbLeaks, timelineRes] = await Promise.all([
      fetchJson(`${ISC}/topips/records/25?json`).catch((e) => { nextErrors.dshield = e.message; return null }),
      fetchJson(`${ISC}/topports/records/10?json`).catch((e) => { nextErrors.dshield = e.message; return null }),
      fetchJson(`${ISC}/infocon?json`).catch(() => null),
      fetchJson(KEV_SNAPSHOT).catch((e) => { nextErrors.kev = e.message; return null }),
      fetchJson(
        `${NVD}?pubStartDate=${encodeURIComponent(isoDaysAgo(2))}&pubEndDate=${encodeURIComponent(new Date().toISOString())}&resultsPerPage=20&noRejected`,
      ).catch((e) => { nextErrors.nvd = e.message; return null }),
      fetchJson(`${RB}/index`).catch((e) => { nextErrors.rb = e.message; return null }),
      fetchJson(`${RB}/geo`).catch((e) => { nextErrors.rb = e.message; return null }),
      fetchJson(`${RB}/leaks`).catch((e) => { nextErrors.rb = e.message; return null }),
      Promise.allSettled(timelineDays.map((d) => fetchJson(`${ISC}/dailysummary/${d}?json`))),
    ])

    let sources = []
    if (Array.isArray(topIps)) {
      const top = topIps.slice(0, 12)
      const located = await Promise.allSettled(
        top.map((s) => fetchJson(`https://ipwho.is/${encodeURIComponent(s.source)}`)),
      )
      sources = top
        .map((s, i) => {
          const geo = located[i].status === 'fulfilled' ? located[i].value : null
          if (!geo || geo.success === false || typeof geo.latitude !== 'number') return null
          return {
            ip: s.source,
            reports: Number(s.reports) || 0,
            targets: Number(s.targets) || 0,
            country: geo.country,
            countryCode: geo.country_code,
            city: geo.city || null,
            lat: geo.latitude,
            lon: geo.longitude,
          }
        })
        .filter(Boolean)
    }

    const ports = topPorts
      ? Object.values(topPorts)
          .map((p) => ({
            port: Number(p.targetport),
            records: Number(p.records) || 0,
            targets: Number(p.targets) || 0,
            sources: Number(p.sources) || 0,
          }))
          .sort((a, b) => b.records - a.records)
          .slice(0, 6)
      : []

    // Top weakness types (CWE) across the newly published CVEs — the
    // real basis for the "top application violations" panel. Prefer each
    // CVE's Primary weakness; fall back to any English weakness listed.
    const violationCounts = new Map()
    for (const v of nvd?.vulnerabilities || []) {
      const cve = v.cve
      if (!cve) continue
      const primary = (cve.weaknesses || []).find((w) => w.type === 'Primary')
      const descs = primary
        ? primary.description || []
        : (cve.weaknesses || []).flatMap((w) => w.description || [])
      const ids = [...new Set(descs.filter((d) => d.lang === 'en').map((d) => d.value))]
      for (const id of ids) {
        if (/^CWE-\d+$/.test(id)) violationCounts.set(id, (violationCounts.get(id) || 0) + 1)
      }
    }
    const violations = [...violationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, name: CWE_NAMES[id] || id, count }))

    const timeline = timelineRes
      .map((r, i) => {
        if (r.status !== 'fulfilled') return null
        const day = Array.isArray(r.value) ? r.value[0] : null
        if (!day || typeof day.records !== 'number') return null
        return { date: timelineDays[i], records: day.records, sources: day.sources || 0 }
      })
      .filter(Boolean)

    if (!mounted.current) return
    setData({
      sources,
      ports,
      violations,
      infocon: infocon?.status || null,
      kev: kevSnap,
      rbIndex: rbIndex && !rbIndex.error ? rbIndex : null,
      rbGeo: rbGeo && !rbGeo.error ? rbGeo : null,
      rbLeaks: Array.isArray(rbLeaks?.leaks) ? rbLeaks.leaks.slice(0, 4) : [],
      timeline,
    })
    setErrors(nextErrors)
    setUpdatedAt(new Date())
    setLoading(false)
    setRefreshing(false)
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

  // Dominant category per country, from that country's own live data:
  // ransomware victims first (leak listings naming a country), then
  // breach targets (Recent Breaches geography), then scanning sources
  // (DShield). Exploited flaws have no geography in any feed, so they
  // colour no country.
  const { countryPaths, nodes, arcs } = useMemo(() => {
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
    // Only the top five breach-target countries colour purple — the
    // full 28-day geography list would paint half the map.
    const attackedCodes = new Set(
      ((data.rbGeo?.targets || []).slice(0, 5).map((t) => NAME_TO_CODE[t.country])).filter(Boolean),
    )
    // A country that is a top scanning source keeps its red: the map's
    // story is where attacks come from. Breach targets colour only
    // countries with no top source; ransomware victims colour leak
    // countries with no top source.
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
      if (num && cat) infoById.set(num, { ...c, category: cat, fill: CAT_BY_KEY[cat].color })
    }
    // Breach-target and ransomware-victim countries that filed no
    // top source still get their category colour.
    for (const code of [...attackedCodes, ...leakCodes]) {
      if (totals.has(code)) continue
      const num = COUNTRY_NUMERIC[code]
      const cat = categoryOf(code)
      if (num && cat) {
        const name = (data.rbGeo?.targets || []).find((t) => NAME_TO_CODE[t.country] === code)?.country || code
        infoById.set(num, { country: name, code, reports: 0, sources: 0, category: cat, fill: CAT_BY_KEY[cat].color })
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
          style={{ fill: info ? info.fill : MAP_BASE_FILL, fillOpacity: info ? 0.62 : 1 }}
          onMouseEnter={() => info && setHovered(info)}
          onMouseLeave={() => setHovered(null)}
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
      return { ...s, x, y, r, category: 'scanning' }
    })
    // Arcs trace the ranked order of the most-reported sources (1 → 2 → 3 …),
    // plus a web from the top source to every other. They are motion, not
    // claimed attack routes: DShield reports where the sources are, not
    // where each packet was aimed. Arc colour is the category of the
    // country the arc lands on.
    const arcs = []
    const seen = new Set()
    const addArc = (a, b) => {
      if (!a || !b || a.ip === b.ip) return
      const key = `${a.ip}>${b.ip}`
      if (seen.has(key)) return
      seen.add(key)
      arcs.push({ key, d: arcPath([a.x, a.y], [b.x, b.y]), color: CAT_BY_KEY[b.category].color })
    }
    for (let i = 0; i < nodes.length; i += 1) {
      addArc(nodes[i], nodes[i + 1])
      addArc(nodes[i], nodes[i + 2])
    }
    for (let i = 1; i < nodes.length; i += 1) addArc(nodes[0], nodes[i])
    return { countryPaths, nodes, arcs }
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
  const maxTimeline = Math.max(1, ...data.timeline.map((t) => t.records))
  const todayReports = data.timeline.length ? data.timeline[data.timeline.length - 1].records : null
  const topPortRecords = data.ports.reduce((sum, p) => sum + p.records, 0)
  const sumViolationCount = Math.max(1, data.violations.reduce((sum, v) => sum + v.count, 0))
  const timelineValues = data.timeline.map((t) => t.records)

  return (
    <div className={`gtw${railCollapsed ? ' gtw--rail-hidden' : ''}`}>
      {/* --- The stage: full-bleed dark map + right rail --- */}
      <div className="gtw__stage">
        <div className="gtw__mapcol">
          <div className="gtw__mapwrap" aria-label="World map of most-reported attacking source addresses">
            <svg
              className="gtw__svg"
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              preserveAspectRatio="xMidYMid slice"
              role="img"
              aria-label="World map showing the locations of the most-reported attacking IP addresses, with arcs tracing them in ranked order."
            >
              <defs>
                <pattern id="gtw-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                  <path d="M 36 0 H 0 V 36" fill="none" stroke="#0e2a2e" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width={MAP_W} height={MAP_H} fill="url(#gtw-grid)" />
              <path d={graticulePath || undefined} className="gtw__graticule" />
              {countryPaths}
              {arcs.map((a) => (
                <path key={a.key} d={a.d} className="gtw__arc" style={{ stroke: a.color }} />
              ))}
              {arcs.slice(0, 8).map((a, i) => (
                <circle key={`mover-${a.key}`} r="2.2" className="gtw__mover" style={{ fill: a.color }}>
                  <animateMotion dur={`${5 + (i % 4)}s`} repeatCount="indefinite" path={a.d} />
                </circle>
              ))}
              {nodes.map((n) => (
                <g key={n.ip} className="gtw__node">
                  <circle cx={n.x} cy={n.y} r={n.r + 6} className="gtw__pulse" style={{ fill: CAT_BY_KEY[n.category].color }} />
                  <circle cx={n.x} cy={n.y} r={n.r} className="gtw__dot" style={{ fill: CAT_BY_KEY[n.category].color }} />
                </g>
              ))}
            </svg>

            {/* Brand block, top-left over the map */}
            <div className="gtw__brand">
              <span className="gtw__brand-name">Offline Theory</span>
              <span className="gtw__brand-sub">Live Cyber Threat Map</span>
              <span className="gtw__brand-note">Live data · SANS Internet Storm Center</span>
              <span className="gtw__brand-status" role="status">
                <span className={`gtw__live-dot ${loading ? 'is-loading' : ''}`} aria-hidden="true" />
                {loading ? 'Contacting the feeds…' : `Live — updated ${updatedAt ? fmtTime(updatedAt) : '—'} UTC`}
                {data.infocon && (
                  <span className="gtw__infocon"> · InfoCon: <strong>{data.infocon}</strong></span>
                )}
              </span>
            </div>

            {/* Red callout button, top-centre */}
            <button type="button" className="gtw__cta" onClick={() => load(true)} disabled={refreshing || loading} title="Refresh the live feeds">
              Live Cyber Threat Map
            </button>

            {/* Top-right buttons */}
            <div className="gtw__top-actions">
              <span className="gtw__live-btn" role="status">
                <span className={`gtw__live-dot ${loading ? 'is-loading' : ''}`} aria-hidden="true" />
                Live
              </span>
              <button type="button" className="gtw__refresh" onClick={() => load(true)} disabled={refreshing || loading}>
                {refreshing ? 'Refreshing…' : 'Refresh now'}
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
                <h2 id="wire-h" className="gtw__panel-title">Threat alerts</h2>
                {data.rbLeaks.length === 0 && !errors.rb && <p className="gtw__empty">Loading…</p>}
                {errors.rb && (
                  <p className="gtw__error" role="alert">The Recent Breaches feed is unavailable right now ({errors.rb}).</p>
                )}
                <ol className="gtw__wire-list">
                  {data.rbLeaks.map((l) => (
                    <li key={l.slug}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer">
                        <span className="gtw__wire-icon" aria-hidden="true">↗</span>{l.victim}
                      </a>
                      <span className="gtw__wire-text">Listed by {l.group} — {l.claim || 'listed on a leak site'}</span>
                      <span className="meta">{l.listed_ago || l.listed} · Claim, unverified</span>
                    </li>
                  ))}
                </ol>
                <p className="gtw__aside-note">
                  Leak-site listings are third-party claims, not confirmed breaches.
                  Source: <a href="https://recentbreaches.com" target="_blank" rel="noopener noreferrer">Recent Breaches</a>.
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
              <span className="gtw__timeline-collapsed-label">Sensor reports — last 7 days · DShield · collapsed</span>
              <button type="button" className="gtw__timeline-show" onClick={() => setTimelineCollapsed(false)}>
                Show timeline
              </button>
            </div>
          ) : (
            <div className="gtw__timeline" aria-label="Sensor reports, last seven days">
              <div className="gtw__timeline-main">
                <div className="gtw__timeline-head">
                  <h3 className="gtw__panel-title">Sensor reports — last 7 days · DShield</h3>
                  <button
                    type="button"
                    className="gtw__timeline-collapse"
                    onClick={() => setTimelineCollapsed(true)}
                    aria-label="Collapse timeline"
                  >
                    ✕ Collapse
                  </button>
                </div>
                <div className="gtw__timeline-marks" aria-hidden="true">
                  {data.timeline.map((t) => (
                    <span key={t.date}>{fmtDayShort(t.date)}</span>
                  ))}
                  <span className="gtw__timeline-now">Now</span>
                </div>
                {data.timeline.length === 0 && !errors.dshield && <p className="gtw__empty">Loading…</p>}
                <div className="gtw__timeline-rows">
                  {CATEGORIES.map((c) => (
                    <div className="gtw__timeline-row" key={c.key}>
                      <Waveform values={timelineValues} color={c.color} />
                    </div>
                  ))}
                </div>
                <p className="gtw__timeline-note">
                  One row per category. The feeds publish no per-category history, so each row traces the same real
                  DShield daily trend — the shape is the internet&rsquo;s, not a simulation. Today: {todayReports != null ? `${todayReports.toLocaleString('en-US')} reports` : '—'} · 7-day peak {maxTimeline.toLocaleString('en-US')}.
                </p>
              </div>
              <ul className="gtw__timeline-legend" aria-label="Attack types shown on the timeline">
                {CATEGORIES.map((c) => (
                  <li key={c.key} style={{ color: c.color }}>
                    <span className="gtw__legend-dot" style={{ background: c.color }} aria-hidden="true" />
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {errors.dshield && (
            <p className="gtw__error gtw__error--below" role="alert">
              The DShield feed is unavailable right now ({errors.dshield}). The map and port table will fill in when it answers.
            </p>
          )}
        </div>

        {/* Right rail */}
        <aside className="gtw__rail" id="gtw-rail" aria-label="Live figures, rankings and scanned ports">
          <div className="gtw__rail-head">
            <h2 className="gtw__rail-title">Live Cyber Threat Map</h2>
            <label className="gtw__interval" htmlFor="gtw-interval">
              <span className="gtw__interval-label">Statistics interval</span>
              <select
                id="gtw-interval"
                value={interval}
                onChange={(e) => { setInterval(e.target.value); load(true) }}
              >
                <option value="1 hour">1 hour</option>
                <option value="6 hours">6 hours</option>
                <option value="24 hours">24 hours</option>
                <option value="7 days">7 days</option>
              </select>
              <span className="gtw__interval-note">Live window · feeds refresh every 5 minutes</span>
            </label>
          </div>

          <section className="gtw__panel" aria-label="Live figures">
            <div className="gtw__figures">
              <div className="gtw__figure">
                <span className="gtw__figure-num">{todayReports != null ? todayReports.toLocaleString('en-US') : '—'}</span>
                <span className="label">Sensor reports today</span>
                <span className="gtw__figure-src">Scanning · SANS DShield</span>
              </div>
              <div className="gtw__figure">
                <span className="gtw__figure-num">{data.rbIndex ? data.rbIndex.ransomware_7d.toLocaleString('en-US') : '—'}</span>
                <span className="label">Ransomware claims · 7 days</span>
                <span className="gtw__figure-src">Leak-site listings · Recent Breaches</span>
              </div>
              <div className="gtw__figure">
                <span className="gtw__figure-num">{data.kev ? data.kev.totalKnownExploited.toLocaleString('en-US') : '—'}</span>
                <span className="label">Flaws confirmed exploited</span>
                <span className="gtw__figure-src">CISA Known Exploited Vulnerabilities</span>
              </div>
              <div className="gtw__figure">
                <span className="gtw__figure-num">{data.rbIndex ? data.rbIndex.count_24h.toLocaleString('en-US') : '—'}</span>
                <span className="label">Breach disclosures · 24 hours</span>
                <span className="gtw__figure-src">Recent Breaches index</span>
              </div>
            </div>
          </section>

          <section className="gtw__panel" aria-labelledby="attackers-h">
            <h2 id="attackers-h" className="gtw__panel-title">Top attackers</h2>
            {countries.length === 0 && !errors.dshield && <p className="gtw__empty">Loading…</p>}
            <ol className="gtw__bars">
              {countries.map((c) => (
                <li key={c.code}>
                  <span className="gtw__bars-label"><span className="gtw__flag" aria-hidden="true">{flagEmoji(c.code)}</span>{c.country}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill gtw__bars-fill--red" style={{ width: `${Math.max(4, (c.reports / sumCountryReports) * 100)}%` }} />
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
            <ol className="gtw__bars">
              {geoTargets.map((t) => (
                <li key={t.country}>
                  <span className="gtw__bars-label"><span className="gtw__flag" aria-hidden="true">{flagEmoji(NAME_TO_CODE[t.country])}</span>{t.country}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill gtw__bars-fill--purple" style={{ width: `${Math.max(4, (t.count / sumTargetCount) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{Math.round((t.count / sumTargetCount) * 100)} %</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Countries with the most breach targets, last 28 days. Source: <a href="https://recentbreaches.com" target="_blank" rel="noopener noreferrer">Recent Breaches</a>.</p>
          </section>

          <section className="gtw__panel" aria-labelledby="vectors-h">
            <h2 id="vectors-h" className="gtw__panel-title">Top network attack vectors</h2>
            {data.ports.length === 0 && !errors.dshield && <p className="gtw__empty">Loading…</p>}
            <ol className="gtw__bars">
              {data.ports.map((p) => (
                <li key={p.port}>
                  <span className="gtw__bars-label" style={{ color: CAT_BY_KEY.ransomware.color }}>{PORT_NAMES[p.port] || 'Service'} · {p.port}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill gtw__bars-fill--yellow" style={{ width: `${Math.max(4, (p.records / maxPortRecords) * 100)}%` }} />
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
                    <span className="gtw__bars-fill gtw__bars-fill--red" style={{ width: `${Math.max(4, (v.count / sumViolationCount) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{v.id} · {v.count}</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Weakness types (CWE) in the vulnerabilities published in the last 48 hours. Source: NIST NVD.</p>
          </section>

          <section className="gtw__panel" aria-labelledby="ports-h">
            <h2 id="ports-h" className="gtw__panel-title">Top scanned UDP / TCP ports</h2>
            {data.ports.length === 0 && !errors.dshield && <p className="gtw__empty">Loading…</p>}
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

      {/* --- Thin footer bar: copyright, data credit, honesty notes --- */}
      <footer className="gtw__footer">
        <span>© 2026 Offline Theory — an independent publication.</span>
        <span className="gtw__footer-data">Data: SANS Internet Storm Center · Recent Breaches · CISA KEV · NIST NVD · ipwho.is</span>
        <span className="gtw__footer-note">
          Arcs are motion, not claimed attack routes. Countries are coloured by the dominant category among their
          reported sources — red scanning sources, purple breach targets with no top source, yellow ransomware victims.
          Attack vectors are most-probed services by port; application violations are CWE types in the last 48 hours of NVD CVEs.
        </span>
        <span className="gtw__footer-links">
          <a href="/">Offline Theory</a>
          {' · '}
          <a href="/about">About</a>
          {' · '}
          <a href="/privacy">Privacy</a>
        </span>
      </footer>
    </div>
  )
}
