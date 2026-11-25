import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-110m.json'
import Newsletter from '../components/Newsletter.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './ThreatMap.css'

/**
 * GLOBAL THREAT WATCH — Offline Theory's live picture of what the
 * internet's sensors are seeing right now. Interview-magazine editorial
 * treatment: Didone headlines, tiny uppercase technical labels, thin rules,
 * and a map in Radware's composition rendered strictly black and white —
 * black ground, grey-shaded countries, white arcs and dots.
 *
 * Real data only — nothing simulated or invented. Live from the browser
 * (all CORS-open, no key):
 *  - SANS Internet Storm Center (DShield) — most-reported attacking
 *    source IPs, most-targeted ports, InfoCon, and a 7-day daily
 *    summary of sensor reports.
 *  - ipwho.is — geolocates those source IPs (lat/lon + country).
 *  - NIST NVD API — vulnerabilities published or modified in the last
 *    48 hours.
 *  - Recent Breaches (recentbreaches.com) — free CORS-open JSON API:
 *    breach index (24h / 7d counts), breach geography by target
 *    country, ransomware leak-site listings, and the threat-actor
 *    leaderboard. Attribution is shown on the page, as their licence
 *    requires. Their iframe widgets were not used: an iframe cannot
 *    be restyled into this page's monochrome palette, and the map
 *    widget would duplicate the map below.
 *  - CISA Known Exploited Vulnerabilities catalog — hourly snapshot,
 *    because CISA sends no CORS headers.
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
 * not shown as live counts; the page says so in Sources & Method.
 */

const ISC = 'https://isc.sans.edu/api'
const RB = 'https://recentbreaches.com/api'
const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const KEV_SNAPSHOT = `${import.meta.env.BASE_URL}data/kev-snapshot.json`
const REFRESH_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 15000

const PORT_NAMES = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP',
  110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 1433: 'MSSQL',
  2222: 'SSH (alt)', 2323: 'Telnet (alt)', 3306: 'MySQL', 3389: 'RDP',
  5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 8080: 'HTTP (alt)',
  8443: 'HTTPS (alt)', 8888: 'HTTP (alt)', 9000: 'HTTP (alt)',
}

const LAND = feature(worldTopo, worldTopo.objects.land)
const COUNTRIES = feature(worldTopo, worldTopo.objects.countries)

// ISO 3166-1 numeric codes, keyed by the alpha-2 code ipwho.is returns.
// Used to shade each country by how many DShield reports its sources filed.
// Only the countries that commonly appear in the top sources are listed;
// a country not listed simply keeps the base near-black fill.
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

// Graded greys for the map: the most-reported country is near-white,
// the rest step down toward the near-black base fill.
const SHADE = ['#f2f2f2', '#c9c9c9', '#9a9a9a', '#6f6f6f', '#4a4a4a', '#333333']
const MAP_BASE_FILL = '#101010'

const MAP_W = 960
const MAP_H = 470

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

function fmtDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function fmtDayShort(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function cvssOf(cve) {
  const m = cve.metrics || {}
  const v31 = m.cvssMetricV31?.[0]?.cvssData
  const v30 = m.cvssMetricV30?.[0]?.cvssData
  const v2 = m.cvssMetricV2?.[0]?.cvssData
  const d = v31 || v30 || v2
  if (!d) return null
  return { score: d.baseScore, severity: d.baseSeverity || '—' }
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

export default function ThreatMap() {
  useMeta({
    title: 'Global Threat Watch',
    description:
      'Global Threat Watch — a live map of the attacks the internet is seeing right now: most-reported source addresses, most-targeted ports and countries, ransomware leak listings, exploited vulnerabilities and newly published CVEs, from free public feeds.',
  })

  const [data, setData] = useState({
    sources: [],
    ports: [],
    infocon: null,
    kev: null,
    nvd: [],
    rbIndex: null,
    rbGeo: null,
    rbLeaks: [],
    rbActors: [],
    timeline: [],
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [hovered, setHovered] = useState(null)
  const mounted = useRef(true)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    const nextErrors = {}
    const timelineDays = [6, 5, 4, 3, 2, 1, 0].map((d) => dateStrDaysAgo(d))
    const [topIps, topPorts, infocon, kevSnap, nvd, rbIndex, rbGeo, rbLeaks, rbActors, timelineRes] = await Promise.all([
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
      fetchJson(`${RB}/actors`).catch((e) => { nextErrors.rb = e.message; return null }),
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

    const nvdItems = nvd?.vulnerabilities
      ? [...nvd.vulnerabilities]
          .map((v) => v.cve)
          .filter(Boolean)
          .sort((a, b) => String(b.published).localeCompare(String(a.published)))
          .slice(0, 8)
          .map((cve) => ({
            id: cve.id,
            published: cve.published,
            descriptions: (cve.descriptions || []).find((d) => d.lang === 'en')?.value || '',
            cvss: cvssOf(cve),
          }))
      : []

    const timeline = timelineRes
      .map((r, i) => {
        if (r.status !== 'fulfilled') return null
        const day = Array.isArray(r.value) ? r.value[0] : null
        if (!day || typeof day.records !== 'number') return null
        return { date: timelineDays[i], records: day.records, sources: day.sources || 0 }
      })
      .filter(Boolean)

    if (!mounted.current) return
    const kevStaleAtLoad = kevSnap ? Date.now() - Date.parse(kevSnap.generatedAt) > 12 * 60 * 60 * 1000 : false
    setData({
      sources,
      ports,
      infocon: infocon?.status || null,
      kev: kevSnap,
      nvd: nvdItems,
      kevStale: kevStaleAtLoad,
      rbIndex: rbIndex && !rbIndex.error ? rbIndex : null,
      rbGeo: rbGeo && !rbGeo.error ? rbGeo : null,
      rbLeaks: Array.isArray(rbLeaks?.leaks) ? rbLeaks.leaks.slice(0, 6) : [],
      rbActors: Array.isArray(rbActors) ? rbActors.slice(0, 5) : [],
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

  const { countryPaths, nodes, arcs } = useMemo(() => {
    // Aggregate the live sources by country, then shade each country by
    // its share of reports: near-white for the most-reported, stepping
    // down through greys toward the near-black base fill.
    const totals = new Map()
    for (const s of data.sources) {
      const cur = totals.get(s.countryCode) || { country: s.country, code: s.countryCode, reports: 0, sources: 0 }
      cur.reports += s.reports
      cur.sources += 1
      totals.set(s.countryCode, cur)
    }
    const ranked = [...totals.values()].sort((a, b) => b.reports - a.reports)
    const infoById = new Map()
    ranked.forEach((c, i) => {
      const num = COUNTRY_NUMERIC[c.code]
      if (num) infoById.set(num, { ...c, fill: SHADE[Math.min(i, SHADE.length - 1)] })
    })
    const countryPaths = COUNTRIES.features.map((f, i) => {
      const info = infoById.get(String(f.id))
      const name = f.properties?.name || ''
      return (
        <path
          key={i}
          d={path(f) || undefined}
          className="gtw__country"
          style={{ fill: info ? info.fill : MAP_BASE_FILL }}
          onMouseEnter={() => info && setHovered(info)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => info && setHovered(info)}
          onBlur={() => setHovered(null)}
        >
          <title>
            {info
              ? `${name} — ${info.reports.toLocaleString('en-US')} reports from ${info.sources} source${info.sources === 1 ? '' : 's'}`
              : name}
          </title>
        </path>
      )
    })
    const maxReports = Math.max(1, ...data.sources.map((s) => s.reports))
    const nodes = data.sources.map((s) => {
      const [x, y] = projection([s.lon, s.lat]) || [0, 0]
      const r = 3 + (Math.sqrt(s.reports / maxReports) * 8)
      return { ...s, x, y, r }
    })
    // Arcs trace the ranked order of the most-reported sources (1 → 2 → 3 …),
    // plus a web from the top source to every other, so the map reads like
    // Radware's criss-cross of flights. They are motion, not claimed attack
    // routes: DShield reports where the sources are, not where each packet
    // was aimed.
    const arcs = []
    const seen = new Set()
    const addArc = (a, b) => {
      if (!a || !b || a.ip === b.ip) return
      const key = `${a.ip}>${b.ip}`
      if (seen.has(key)) return
      seen.add(key)
      arcs.push({ key, d: arcPath([a.x, a.y], [b.x, b.y]) })
    }
    for (let i = 0; i < nodes.length; i += 1) {
      addArc(nodes[i], nodes[i + 1])
      addArc(nodes[i], nodes[i + 2])
    }
    for (let i = 1; i < nodes.length; i += 1) addArc(nodes[0], nodes[i])
    return { countryPaths, nodes, arcs }
  }, [data.sources, path, projection])

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
  const maxPortRecords = Math.max(1, ...data.ports.map((p) => p.records))
  const kevStale = data.kevStale === true
  const totalReports = data.sources.reduce((sum, s) => sum + s.reports, 0)
  const geoTargets = (data.rbGeo?.targets || []).slice(0, 5)
  const maxTargetCount = Math.max(1, ...geoTargets.map((t) => t.count))
  const maxTimeline = Math.max(1, ...data.timeline.map((t) => t.records))
  const todayReports = data.timeline.length ? data.timeline[data.timeline.length - 1].records : null

  return (
    <div className="gtw">
      {/* --- Masthead --- */}
      <header className="gtw__masthead">
        <div className="gtw__masthead-meta label">
          <span>Offline Theory · Live</span>
          <span>{updatedAt ? `${fmtDate(updatedAt)} — ${fmtTime(updatedAt)} UTC` : 'Contacting the feeds…'}</span>
        </div>
        <h1 className="gtw__title">Global<br />Threat Watch</h1>
        <p className="gtw__dek">
          What the internet&rsquo;s sensors are seeing right now — the addresses doing the
          probing, the countries being hit, the ransomware crews posting victims, and the
          flaws being exploited today.
        </p>
        <div className="gtw__status" role="status">
          <span className={`gtw__live-dot ${loading ? 'is-loading' : ''}`} aria-hidden="true" />
          <span>{loading ? 'Contacting the feeds…' : `Live — updated ${updatedAt ? fmtTime(updatedAt) : '—'} UTC`}</span>
          {data.infocon && (
            <span className="gtw__infocon">
              InfoCon: <strong>{data.infocon}</strong>
            </span>
          )}
          <span className="gtw__status-note">Refreshes every 5 minutes</span>
          <button type="button" className="gtw__refresh" onClick={() => load(true)} disabled={refreshing || loading}>
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </header>

      {/* --- Category strip: the numbers, in figures --- */}
      <section className="gtw__figures" aria-label="Headline figures">
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
      </section>

      {/* --- The map, Radware's composition, editorially --- */}
      <div className="gtw__spread">
        <aside className="gtw__rail gtw__rail--left" aria-label="Attack types and live wire">
          <section>
            <h2 className="label gtw__panel-title">Attack types</h2>
            <ul className="gtw__legend">
              <li><span className="gtw__legend-dot gtw__legend-dot--white" aria-hidden="true" /><span><strong>Scanning</strong><span className="gtw__legend-note">Probing of exposed ports, reported by volunteer sensors.</span></span></li>
              <li><span className="gtw__legend-dot gtw__legend-dot--white" aria-hidden="true" /><span><strong>Ransomware</strong><span className="gtw__legend-note">Victims posted to extortion leak sites.</span></span></li>
              <li><span className="gtw__legend-dot gtw__legend-dot--white" aria-hidden="true" /><span><strong>Exploited flaws</strong><span className="gtw__legend-note">Vulnerabilities CISA confirms are in active use.</span></span></li>
              <li><span className="gtw__legend-dot gtw__legend-dot--white" aria-hidden="true" /><span><strong>Breaches</strong><span className="gtw__legend-note">Disclosed incidents and regulator filings.</span></span></li>
            </ul>
            <p className="gtw__aside-note">
              White marks the most-reported source addresses on the black map, and
              countries are shaded by how many reports their sources filed — the
              lightest country filed the most. Arcs trace them in ranked order —
              motion, not claimed attack routes. Hover a country for its figures.
            </p>
          </section>

          <section className="gtw__wire" aria-labelledby="wire-h">
            <h2 id="wire-h" className="label gtw__panel-title">Live wire — ransomware</h2>
            {data.rbLeaks.length === 0 && !errors.rb && <p className="gtw__empty">Loading…</p>}
            {errors.rb && (
              <p className="gtw__error" role="alert">The Recent Breaches feed is unavailable right now ({errors.rb}).</p>
            )}
            <ol className="gtw__wire-list">
              {data.rbLeaks.map((l) => (
                <li key={l.slug}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">{l.victim}</a>
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
        </aside>

        <section className="gtw__map-panel" aria-label="World map of most-reported attacking source addresses">
          <div className="gtw__map-head">
            <h2 className="label gtw__panel-title gtw__panel-title--inline">Most-reported source addresses — SANS Internet Storm Center</h2>
            <span className="meta gtw__map-meta">
              {data.sources.length > 0
                ? `${data.sources.length} sources plotted · ${totalReports.toLocaleString('en-US')} reports in the current window`
                : 'Awaiting feed…'}
            </span>
          </div>
          <p className="gtw__map-hover" aria-live="polite">
            {hovered
              ? `${hovered.country} — ${hovered.reports.toLocaleString('en-US')} reports from ${hovered.sources} source${hovered.sources === 1 ? '' : 's'}`
              : 'Hover a country for its figures'}
          </p>
          <svg
            className="gtw__svg"
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            role="img"
            aria-label="World map showing the locations of the most-reported attacking IP addresses, with arcs tracing them in ranked order."
          >
            <defs>
              <pattern id="gtw-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 H 0 V 36" fill="none" stroke="#1b1b1b" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width={MAP_W} height={MAP_H} fill="url(#gtw-grid)" />
            <path d={graticulePath || undefined} className="gtw__graticule" />
            {countryPaths}
            {arcs.map((a) => (
              <path key={a.key} d={a.d} className="gtw__arc" />
            ))}
            {arcs.slice(0, 8).map((a, i) => (
              <circle key={`mover-${a.key}`} r="2.2" className="gtw__mover">
                <animateMotion dur={`${5 + (i % 4)}s`} repeatCount="indefinite" path={a.d} />
              </circle>
            ))}
            {nodes.map((n) => (
              <g key={n.ip} className="gtw__node">
                <circle cx={n.x} cy={n.y} r={n.r + 10} className="gtw__pulse" />
                <circle cx={n.x} cy={n.y} r={n.r} className="gtw__dot" />
                <text x={n.x + n.r + 5} y={n.y + 3} className="gtw__node-label">
                  {n.countryCode} · {n.reports.toLocaleString('en-US')}
                </text>
              </g>
            ))}
          </svg>

          <div className="gtw__timeline" aria-label="Sensor reports, last seven days">
            <h3 className="label gtw__panel-title">Sensor reports — last 7 days · DShield</h3>
            {data.timeline.length === 0 && !errors.dshield && <p className="gtw__empty">Loading…</p>}
            <div className="gtw__timeline-bars">
              {data.timeline.map((t) => (
                <div className="gtw__timeline-bar" key={t.date}>
                  <span className="gtw__timeline-value">{(t.records / 1_000_000).toFixed(1)}m</span>
                  <span
                    className="gtw__timeline-fill"
                    style={{ height: `${Math.max(4, (t.records / maxTimeline) * 100)}%` }}
                    title={`${fmtDayShort(t.date)} — ${t.records.toLocaleString('en-US')} reports`}
                  />
                  <span className="gtw__timeline-day">{fmtDayShort(t.date)}</span>
                </div>
              ))}
            </div>
            <span className="gtw__timeline-now">Now</span>
          </div>

          <p className="gtw__map-note">
            Dots mark where the most-reported attacking addresses are located; larger dots
            filed more reports. DShield reports where the sources are, not where each
            packet was aimed — so no destination is claimed for any arc.
          </p>
          {errors.dshield && (
            <p className="gtw__error" role="alert">
              The DShield feed is unavailable right now ({errors.dshield}). The map and port table will fill in when it answers.
            </p>
          )}
        </section>

        <aside className="gtw__rail gtw__rail--right" aria-label="Rankings">
          <section aria-labelledby="attackers-h">
            <h2 id="attackers-h" className="label gtw__panel-title">Top attackers</h2>
            {countries.length === 0 && !errors.dshield && <p className="gtw__empty">Loading…</p>}
            <ol className="gtw__bars">
              {countries.map((c) => (
                <li key={c.code}>
                  <span className="gtw__bars-label">{c.country}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill" style={{ width: `${Math.max(4, (c.reports / maxCountryReports) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{c.reports.toLocaleString('en-US')}</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Source countries of the most-reported addresses, by report count. Source: DShield.</p>
          </section>

          <section aria-labelledby="attacked-h">
            <h2 id="attacked-h" className="label gtw__panel-title">Top attacked</h2>
            {geoTargets.length === 0 && !errors.rb && <p className="gtw__empty">Loading…</p>}
            <ol className="gtw__bars">
              {geoTargets.map((t) => (
                <li key={t.country}>
                  <span className="gtw__bars-label">{t.country}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill" style={{ width: `${Math.max(4, (t.count / maxTargetCount) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{t.count}</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Countries with the most breach targets, last 28 days. Source: <a href="https://recentbreaches.com" target="_blank" rel="noopener noreferrer">Recent Breaches</a>.</p>
          </section>

          <section aria-labelledby="ports-h">
            <h2 id="ports-h" className="label gtw__panel-title">Most-probed ports</h2>
            {data.ports.length === 0 && !errors.dshield && <p className="gtw__empty">Loading…</p>}
            <ol className="gtw__bars">
              {data.ports.map((p) => (
                <li key={p.port}>
                  <span className="gtw__bars-label">{p.port} · {PORT_NAMES[p.port] || 'Service'}</span>
                  <span className="gtw__bars-track">
                    <span className="gtw__bars-fill" style={{ width: `${Math.max(4, (p.records / maxPortRecords) * 100)}%` }} />
                  </span>
                  <span className="gtw__bars-num">{p.records.toLocaleString('en-US')}</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Ports the sensors saw probed most, by report count. Source: DShield.</p>
          </section>

          <section aria-labelledby="actors-h">
            <h2 id="actors-h" className="label gtw__panel-title">Threat actors</h2>
            {data.rbActors.length === 0 && !errors.rb && <p className="gtw__empty">Loading…</p>}
            <ol className="gtw__ranked">
              {data.rbActors.map((a, i) => (
                <li key={a.slug || a.name}>
                  <span className="meta">{String(i + 1).padStart(2, '0')}</span>
                  <a className="gtw__actor" href={a.url} target="_blank" rel="noopener noreferrer">{a.name}</a>
                  <span className="gtw__ranked-place">{a.origin || 'Origin unattributed'}</span>
                  <span className="gtw__ranked-num">{Number(a.count).toLocaleString('en-US')} victims · all time</span>
                </li>
              ))}
            </ol>
            <p className="gtw__aside-note">Most active ransomware groups by victim count. Origins are attribution estimates. Source: <a href="https://recentbreaches.com" target="_blank" rel="noopener noreferrer">Recent Breaches</a>.</p>
          </section>
        </aside>
      </div>

      {/* --- Alerts: exploited & newly published --- */}
      <div className="gtw__alerts">
        <section aria-labelledby="kev-h">
          <h2 id="kev-h" className="label gtw__panel-title">Newly listed as exploited — CISA KEV</h2>
          {data.kev ? (
            <>
              <p className="gtw__kev-count">
                <strong>{data.kev.totalKnownExploited.toLocaleString('en-US')}</strong> vulnerabilities confirmed exploited in the wild.
                {' '}<strong>{data.kev.addedLast7Days}</strong> added in the last 7 days.
              </p>
              <p className="gtw__snapshot-note">
                Snapshot generated {fmtDate(data.kev.generatedAt)} at {fmtTime(data.kev.generatedAt)} UTC · refreshed hourly by automation.
                {kevStale && ' This snapshot is more than 12 hours old — the hourly job may have missed a run.'}
              </p>
              <ol className="gtw__alerts-list">
                {data.kev.recent.slice(0, 6).map((v) => (
                  <li key={v.cveID}>
                    <a href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(v.cveID)}`} target="_blank" rel="noopener noreferrer">
                      {v.cveID}
                    </a>
                    <span className="gtw__alerts-text">
                      {v.vendorProject} {v.product} — {v.vulnerabilityName}
                    </span>
                    <span className="meta">Added {fmtDate(v.dateAdded)}{v.knownRansomwareCampaignUse === 'Known' ? ' · Ransomware use known' : ''}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="gtw__empty">{errors.kev ? `KEV snapshot unavailable (${errors.kev}).` : 'Loading…'}</p>
          )}
          <p className="gtw__aside-note">Source: CISA Known Exploited Vulnerabilities catalog. CISA does not send CORS headers, so this panel reads an hourly server-side snapshot instead of fetching live.</p>
        </section>

        <section aria-labelledby="nvd-h">
          <h2 id="nvd-h" className="label gtw__panel-title">Newly published vulnerabilities — NVD</h2>
          {data.nvd.length === 0 && !errors.nvd && <p className="gtw__empty">Loading…</p>}
          {errors.nvd && (
            <p className="gtw__error" role="alert">The NVD feed is unavailable right now ({errors.nvd}).</p>
          )}
          <ol className="gtw__alerts-list">
            {data.nvd.map((cve) => (
              <li key={cve.id}>
                <a href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve.id)}`} target="_blank" rel="noopener noreferrer">
                  {cve.id}
                </a>
                {cve.cvss && (
                  <span className={`gtw__severity gtw__severity--${(cve.cvss.severity || '').toLowerCase()}`}>
                    {cve.cvss.severity} {cve.cvss.score}
                  </span>
                )}
                <span className="gtw__alerts-text">{cve.descriptions}</span>
                <span className="meta">Published {fmtDate(cve.published)}</span>
              </li>
            ))}
          </ol>
          <p className="gtw__aside-note">Source: NIST National Vulnerability Database, vulnerabilities published or modified in the last 48 hours. Fetched live in your browser.</p>
        </section>
      </div>

      {/* --- Sources & method --- */}
      <section className="gtw__method" aria-labelledby="method-h">
        <h2 id="method-h" className="label gtw__panel-title">Sources &amp; method</h2>
        <p>
          This page reads five free public feeds, none of which requires an account or an
          API key. The SANS Internet Storm Center, NIST NVD and Recent Breaches publish
          CORS headers, so your browser fetches them live and the page refreshes every
          five minutes. CISA&rsquo;s KEV catalog does not, so it is fetched once an hour
          by an automation job and served as a timestamped snapshot. IP locations come
          from ipwho.is. No data on this page is simulated, and no attack is drawn that
          a feed did not report.
        </p>
        <p>
          Two categories are missing on purpose. There is no free live feed for malware
          or phishing volumes that a static page can read: abuse.ch&rsquo;s Feodo Tracker
          has effectively stopped updating (last update March 2026) and URLhaus&rsquo;s
          download endpoints now answer 410 Gone. Brandefense&rsquo;s ThreatMap cannot be
          embedded — it sends X-Frame-Options: SAMEORIGIN and publishes no public feed —
          and DStrak&rsquo;s map has no public embed or API; its underlying data is
          DShield, which this page already reads directly. If any of those feeds returns,
          we will add it back and say so.
        </p>
        <p className="gtw__method-links">
          <a href="https://isc.sans.edu/" target="_blank" rel="noopener noreferrer">SANS Internet Storm Center</a>
          {' · '}
          <a href="https://recentbreaches.com" target="_blank" rel="noopener noreferrer">Recent Breaches</a>
          {' · '}
          <a href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog" target="_blank" rel="noopener noreferrer">CISA KEV catalog</a>
          {' · '}
          <a href="https://nvd.nist.gov/" target="_blank" rel="noopener noreferrer">NIST NVD</a>
          {' · '}
          <a href="https://ipwho.is/" target="_blank" rel="noopener noreferrer">ipwho.is</a>
        </p>
        <p className="gtw__credit">
          Breach data from <a href="https://recentbreaches.com" target="_blank" rel="noopener noreferrer">Recent Breaches</a>.
        </p>
      </section>

      <div className="gtw__paper-band"><Newsletter compact /></div>
    </div>
  )
}
