import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoGraticule, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopo from 'world-atlas/countries-110m.json'
import PageHeader from '../components/PageHeader.jsx'
import Newsletter from '../components/Newsletter.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './ThreatMap.css'

/**
 * The Live Threat Map — a working picture of what the internet's sensors
 * are seeing right now, drawn from free public feeds. Nothing on this page
 * is simulated or invented:
 *
 *  - SANS Internet Storm Center (DShield) — most-reported attacking source
 *    IPs and most-targeted ports, fetched live in the browser. DShield
 *    publishes CORS headers, so no key or proxy is needed.
 *  - ipwho.is — geolocates those source IPs (latitude/longitude + country)
 *    so they can be plotted. Also CORS-open, no key.
 *  - NIST NVD API — vulnerabilities published or modified in the last 48
 *    hours, fetched live in the browser (CORS-open, no key).
 *  - CISA Known Exploited Vulnerabilities catalog — fetched hourly by an
 *    automation job (scripts/build-threat-snapshot.mjs) because CISA does
 *    not send CORS headers and browsers cannot read it directly. The page
 *    shows the snapshot's generation time and warns when it is stale.
 *
 * Feeds that are NOT on this page, and why: abuse.ch Feodo Tracker has
 * effectively stopped updating (last blocklist update March 2026, one
 * online command-and-control server left), and URLhaus's download
 * endpoints now return 410 Gone.
 */

const ISC = 'https://isc.sans.edu/api'
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

function fmtTime(date) {
  return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
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
    title: 'Live Threat Map',
    description:
      'A live map of the attacks the internet is seeing right now — most-reported source addresses, most-targeted ports, newly exploited vulnerabilities and newly published CVEs, from free public feeds.',
  })

  const [data, setData] = useState({
    sources: [],
    ports: [],
    infocon: null,
    kev: null,
    nvd: [],
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    const nextErrors = {}
    const [topIps, topPorts, infocon, kevSnap, nvd] = await Promise.all([
      fetchJson(`${ISC}/topips/records/25?json`).catch((e) => { nextErrors.dshield = e.message; return null }),
      fetchJson(`${ISC}/topports/records/10?json`).catch((e) => { nextErrors.dshield = e.message; return null }),
      fetchJson(`${ISC}/infocon?json`).catch(() => null),
      fetchJson(KEV_SNAPSHOT).catch((e) => { nextErrors.kev = e.message; return null }),
      fetchJson(
        `${NVD}?pubStartDate=${encodeURIComponent(isoDaysAgo(2))}&pubEndDate=${encodeURIComponent(new Date().toISOString())}&resultsPerPage=20&noRejected`,
      ).catch((e) => { nextErrors.nvd = e.message; return null }),
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

    if (!mounted.current) return
    const kevStaleAtLoad = kevSnap ? Date.now() - Date.parse(kevSnap.generatedAt) > 12 * 60 * 60 * 1000 : false
    setData({ sources, ports, infocon: infocon?.status || null, kev: kevSnap, nvd: nvdItems, kevStale: kevStaleAtLoad })
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
    const countryPaths = COUNTRIES.features.map((f, i) => (
      <path key={i} d={path(f) || undefined} className="threat-map__country" />
    ))
    const maxReports = Math.max(1, ...data.sources.map((s) => s.reports))
    const nodes = data.sources.map((s) => {
      const [x, y] = projection([s.lon, s.lat]) || [0, 0]
      const r = 4 + (Math.sqrt(s.reports / maxReports) * 11)
      return { ...s, x, y, r }
    })
    // Arcs trace the ranked order of the most-reported sources (1 → 2 → 3 …).
    // They are motion, not claimed attack routes: DShield reports where the
    // sources are, not where each packet was aimed.
    const arcs = []
    for (let i = 0; i + 1 < nodes.length; i += 1) {
      arcs.push({ key: `${nodes[i].ip}-${nodes[i + 1].ip}`, d: arcPath([nodes[i].x, nodes[i].y], [nodes[i + 1].x, nodes[i + 1].y]) })
    }
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

  return (
    <div className="threat-map">
      <PageHeader
        kicker="Live / Threat Map"
        title="Threat Map"
        description="What the internet's sensors are seeing right now — most-reported attacking addresses, most-targeted ports, and the vulnerabilities being exploited and published today."
      />

      <div className="threat-map__status" role="status">
        <span className={`threat-map__live-dot ${loading ? 'is-loading' : ''}`} aria-hidden="true" />
        <span>
          {loading ? 'Contacting the feeds…' : `Live — updated ${updatedAt ? fmtTime(updatedAt) : '—'} UTC`}
        </span>
        {data.infocon && (
          <span className="threat-map__infocon">
            InfoCon: <strong>{data.infocon}</strong>
          </span>
        )}
        <span className="threat-map__status-note">Refreshes every 5 minutes</span>
        <button type="button" className="btn btn--ghost threat-map__refresh" onClick={() => load(true)} disabled={refreshing || loading}>
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      <section className="threat-map__map-panel" aria-label="World map of most-reported attacking source addresses">
        <div className="threat-map__map-head">
          <h2 className="label col-label">Most-reported source addresses — SANS Internet Storm Center</h2>
          <span className="meta">
            {data.sources.length > 0
              ? `${data.sources.length} sources plotted · ${totalReports.toLocaleString()} reports in the current window`
              : 'Awaiting feed…'}
          </span>
        </div>
        <svg
          className="threat-map__svg"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          role="img"
          aria-label="World map showing the locations of the most-reported attacking IP addresses, with arcs tracing them in ranked order."
        >
          <path d={graticulePath || undefined} className="threat-map__graticule" />
          {countryPaths}
          {arcs.map((a) => (
            <path key={a.key} d={a.d} className="threat-map__arc" />
          ))}
          {nodes.map((n) => (
            <g key={n.ip} className="threat-map__node">
              <circle cx={n.x} cy={n.y} r={n.r + 10} className="threat-map__pulse" />
              <circle cx={n.x} cy={n.y} r={n.r} className="threat-map__dot" />
              <text x={n.x + n.r + 5} y={n.y + 3} className="threat-map__node-label">
                {n.countryCode} · {n.reports.toLocaleString()}
              </text>
            </g>
          ))}
        </svg>
        <p className="threat-map__map-note">
          Dots mark where the most-reported attacking addresses are located; larger dots filed more reports.
          Arcs trace those addresses in ranked order — they are not claimed attack routes. DShield reports
          where the sources are, not where each packet was aimed.
        </p>
        {errors.dshield && (
          <p className="threat-map__error" role="alert">
            The DShield feed is unavailable right now ({errors.dshield}). The map and port table will fill in when it answers.
          </p>
        )}
      </section>

      <div className="threat-map__ledger">
        <section aria-labelledby="sources-h">
          <h2 id="sources-h" className="label col-label">Most-reported sources</h2>
          {data.sources.length === 0 && !errors.dshield && <p className="threat-map__empty">Loading…</p>}
          <ol className="threat-map__ranked">
            {data.sources.slice(0, 8).map((s, i) => (
              <li key={s.ip}>
                <span className="meta">{String(i + 1).padStart(2, '0')}</span>
                <a
                  className="threat-map__ip"
                  href={`https://isc.sans.edu/ipinfo.html?ip=${encodeURIComponent(s.ip)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.ip}
                </a>
                <span className="threat-map__ranked-place">{s.city ? `${s.city}, ` : ''}{s.country}</span>
                <span className="threat-map__ranked-num">{s.reports.toLocaleString()} reports</span>
              </li>
            ))}
          </ol>
          <p className="aside-note">Source: SANS Internet Storm Center (DShield), volunteer sensor reports.</p>
        </section>

        <section aria-labelledby="countries-h">
          <h2 id="countries-h" className="label col-label">Source countries</h2>
          {countries.length === 0 && !errors.dshield && <p className="threat-map__empty">Loading…</p>}
          <ol className="threat-map__bars">
            {countries.map((c) => (
              <li key={c.code}>
                <span className="threat-map__bars-label">{c.country}</span>
                <span className="threat-map__bars-track">
                  <span className="threat-map__bars-fill" style={{ width: `${Math.max(4, (c.reports / maxCountryReports) * 100)}%` }} />
                </span>
                <span className="threat-map__bars-num">{c.reports.toLocaleString()}</span>
              </li>
            ))}
          </ol>
          <p className="aside-note">Reports aggregated by the country of each source address, from the same DShield window.</p>
        </section>

        <section aria-labelledby="ports-h">
          <h2 id="ports-h" className="label col-label">Most-targeted ports</h2>
          {data.ports.length === 0 && !errors.dshield && <p className="threat-map__empty">Loading…</p>}
          <ol className="threat-map__bars">
            {data.ports.map((p) => (
              <li key={p.port}>
                <span className="threat-map__bars-label">{p.port} · {PORT_NAMES[p.port] || 'Service'}</span>
                <span className="threat-map__bars-track">
                  <span className="threat-map__bars-fill threat-map__bars-fill--cobalt" style={{ width: `${Math.max(4, (p.records / maxPortRecords) * 100)}%` }} />
                </span>
                <span className="threat-map__bars-num">{p.records.toLocaleString()}</span>
              </li>
            ))}
          </ol>
          <p className="aside-note">Ports the sensors saw probed most, by report count. Source: DShield.</p>
        </section>
      </div>

      <div className="threat-map__alerts">
        <section aria-labelledby="kev-h">
          <h2 id="kev-h" className="label col-label">Newly listed as exploited — CISA KEV</h2>
          {data.kev ? (
            <>
              <p className="threat-map__kev-count">
                <strong>{data.kev.totalKnownExploited.toLocaleString()}</strong> vulnerabilities confirmed exploited in the wild.
                {' '}<strong>{data.kev.addedLast7Days}</strong> added in the last 7 days.
              </p>
              <p className="threat-map__snapshot-note">
                Snapshot generated {fmtDate(data.kev.generatedAt)} at {fmtTime(data.kev.generatedAt)} UTC · refreshed hourly by automation.
                {kevStale && ' This snapshot is more than 12 hours old — the hourly job may have missed a run.'}
              </p>
              <ol className="threat-map__alerts-list">
                {data.kev.recent.slice(0, 6).map((v) => (
                  <li key={v.cveID}>
                    <a href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(v.cveID)}`} target="_blank" rel="noopener noreferrer">
                      {v.cveID}
                    </a>
                    <span className="threat-map__alerts-text">
                      {v.vendorProject} {v.product} — {v.vulnerabilityName}
                    </span>
                    <span className="meta">Added {fmtDate(v.dateAdded)}{v.knownRansomwareCampaignUse === 'Known' ? ' · Ransomware use known' : ''}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="threat-map__empty">{errors.kev ? `KEV snapshot unavailable (${errors.kev}).` : 'Loading…'}</p>
          )}
          <p className="aside-note">Source: CISA Known Exploited Vulnerabilities catalog. CISA does not send CORS headers, so this panel reads an hourly server-side snapshot instead of fetching live.</p>
        </section>

        <section aria-labelledby="nvd-h">
          <h2 id="nvd-h" className="label col-label">Newly published vulnerabilities — NVD</h2>
          {data.nvd.length === 0 && !errors.nvd && <p className="threat-map__empty">Loading…</p>}
          {errors.nvd && (
            <p className="threat-map__error" role="alert">The NVD feed is unavailable right now ({errors.nvd}).</p>
          )}
          <ol className="threat-map__alerts-list">
            {data.nvd.map((cve) => (
              <li key={cve.id}>
                <a href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve.id)}`} target="_blank" rel="noopener noreferrer">
                  {cve.id}
                </a>
                {cve.cvss && (
                  <span className={`threat-map__severity threat-map__severity--${(cve.cvss.severity || '').toLowerCase()}`}>
                    {cve.cvss.severity} {cve.cvss.score}
                  </span>
                )}
                <span className="threat-map__alerts-text">{cve.descriptions}</span>
                <span className="meta">Published {fmtDate(cve.published)}</span>
              </li>
            ))}
          </ol>
          <p className="aside-note">Source: NIST National Vulnerability Database, vulnerabilities published or modified in the last 48 hours. Fetched live in your browser.</p>
        </section>
      </div>

      <section className="threat-map__method" aria-labelledby="method-h">
        <h2 id="method-h" className="label col-label">Sources &amp; method</h2>
        <p>
          This page reads four free public feeds, none of which requires an account or an API key. The SANS
          Internet Storm Center and NIST NVD publish CORS headers, so your browser fetches them live and the
          page refreshes every five minutes. CISA&rsquo;s KEV catalog does not, so it is fetched once an hour
          by an automation job and served as a timestamped snapshot. IP locations come from ipwho.is.
          No data on this page is simulated, and no attack is drawn that a feed did not report.
        </p>
        <p>
          Two feeds we looked at are not here: abuse.ch&rsquo;s Feodo Tracker blocklist has effectively
          stopped updating (last update March 2026), and URLhaus&rsquo;s download endpoints now answer 410
          Gone. If either returns, we will add it back and say so.
        </p>
        <p className="threat-map__method-links">
          <a href="https://isc.sans.edu/" target="_blank" rel="noopener noreferrer">SANS Internet Storm Center</a>
          {' · '}
          <a href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog" target="_blank" rel="noopener noreferrer">CISA KEV catalog</a>
          {' · '}
          <a href="https://nvd.nist.gov/" target="_blank" rel="noopener noreferrer">NIST NVD</a>
          {' · '}
          <a href="https://ipwho.is/" target="_blank" rel="noopener noreferrer">ipwho.is</a>
        </p>
      </section>

      <div className="section-page__newsletter"><Newsletter compact /></div>
    </div>
  )
}
