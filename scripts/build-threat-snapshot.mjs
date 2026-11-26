// Builds the threat-intel snapshots the Live Cyber Threat Map reads
// same-origin: public/data/kev-snapshot.json (CISA KEV),
// public/data/sources-snapshot.json (SANS DShield feeds, geolocated
// server-side), and public/data/threatfox-snapshot.json (abuse.ch ThreatFox
// IOCs, only when licensing is cleared and the provider is explicitly enabled).
//
// Why snapshots: CISA publishes the KEV catalog as JSON but sends no CORS
// headers, so a browser on offlinetheory.github.io cannot fetch it directly.
// DShield's feeds are CORS-open, but every visitor's browser would then have
// to geolocate the IPs through ipwho.is — and ipwho.is rate-limits those
// lookups (HTTP 429), which once left the live map with no traffic data.
// ThreatFox requires an Auth-Key header, which must never ship in frontend
// JavaScript. This script runs in GitHub Actions every 15 minutes, fetches everything
// server-side, and commits small summaries the map page can fetch
// same-origin. Every snapshot is labelled with when it was generated and
// which provider each record came from, so the page can show LIVE vs CACHED
// honestly and never present a stale or simulated record as live.
//
// Rules the script enforces:
// - DShield live feeds are fetched every 15 minutes; the bulk daily_sources
//   availability check is cached for 24 hours. A failed feed never wipes the previous snapshot — the old file
//   stays in place and the failure is recorded in providers status.
// - Only valid public IPs are geolocated or published. Private, loopback,
//   reserved and otherwise non-routable addresses are excluded, as are
//   indicators that cannot be geolocated reliably. Coordinates are never
//   invented.
// - ThreatFox is disabled by default pending commercial-use eligibility or
//   an appropriate paid subscription. Once cleared, it can be enabled with
//   ENABLE_THREATFOX and the required THREATFOX_AUTH_KEY secret.
//
// Usage: node scripts/build-threat-snapshot.mjs [--out public/data/kev-snapshot.json] [--out-sources public/data/sources-snapshot.json] [--out-threatfox public/data/threatfox-snapshot.json]
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'

const KEV_URL =
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
const TOPIPS_TXT = 'https://feeds.dshield.org/feeds/topips.txt'
const TOPIPS_API = 'https://isc.sans.edu/api/topips/records/25?json'
const TOP10_TXT = 'https://feeds.dshield.org/feeds/top10.txt'
const BLOCK_TXT = 'https://feeds.dshield.org/feeds/block.txt'
const DAILY_SOURCES_URL = 'https://feeds.dshield.org/feeds/daily_sources'
const THREATFOX_URL = 'https://threatfox-api.abuse.ch/api/v1/'
const IPWHO_URL = 'https://ipwho.is'
const USER_AGENT =
  'OfflineTheoryThreatIntel/1.0 (+https://offlinetheory.github.io/; contact offlinetheory@proton.me)'
const THREATFOX_ENABLED = process.env.ENABLE_THREATFOX === 'true'

const outArg = process.argv.indexOf('--out')
const OUT = outArg >= 0 ? process.argv[outArg + 1] : 'public/data/kev-snapshot.json'
const outSourcesArg = process.argv.indexOf('--out-sources')
const OUT_SOURCES =
  outSourcesArg >= 0 ? process.argv[outSourcesArg + 1] : 'public/data/sources-snapshot.json'
const outThreatfoxArg = process.argv.indexOf('--out-threatfox')
const OUT_THREATFOX =
  outThreatfoxArg >= 0
    ? process.argv[outThreatfoxArg + 1]
    : 'public/data/threatfox-snapshot.json'

const DAY = 24 * 60 * 60 * 1000
const THREATFOX_KEY = process.env.THREATFOX_AUTH_KEY || ''

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// True only for a valid, publicly routable IP. Rejects private, loopback,
// link-local, CGNAT, documentation, benchmarking, multicast and reserved
// ranges, for both IPv4 and IPv6. No coordinate is ever published for an
// address that fails this check.
function isPublicIp(ip) {
  if (typeof ip !== 'string' || net.isIP(ip) === 0) return false
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10) return false // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return false // RFC1918
    if (a === 192 && b === 168) return false // RFC1918
    if (a === 127) return false // loopback
    if (a === 169 && b === 254) return false // link-local
    if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
    if (a === 0) return false // "this network"
    if (a === 192 && b === 0) return false // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return false // benchmarking
    if (a === 198 && b === 51) return false // TEST-NET-2
    if (a === 203 && b === 0) return false // TEST-NET-3
    if (a >= 224) return false // multicast (224-239) + reserved (240+) + broadcast
    return true
  }
  // IPv6: reject loopback, unspecified, link-local, ULA, documentation,
  // multicast and other non-global ranges.
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return false
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false // fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return false // fc00::/7 ULA
  if (lower.startsWith('ff')) return false // multicast
  if (lower.startsWith('2001:db8')) return false // documentation
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6: judge the embedded IPv4 address.
    return isPublicIp(lower.slice('::ffff:'.length))
  }
  return true
}

function providedNumber(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n')
}

async function fetchText(url, label) {
  const res = await fetchDshieldResponse(url, {
    headers: { accept: 'text/plain, */*', 'user-agent': USER_AGENT },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${label} fetch failed: HTTP ${res.status}: ${body.slice(0, 500)}`)
  return body
}

async function fetchDshieldResponse(url, options = {}, attempts = 2) {
  const { timeout = 30_000, ...fetchOptions } = options
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    let res
    try {
      res = await fetch(url, { ...fetchOptions, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    if (res.status !== 429) return res
    const body = await res.text()
    if (attempt === attempts) {
      throw new Error(`DShield rate limit persisted after retry: HTTP 429: ${body.slice(0, 500)}`)
    }
    const retryAfter = res.headers.get('retry-after')
    const retrySeconds = Number(retryAfter)
    const retryDate = Date.parse(retryAfter || '')
    const serverWait = Number.isFinite(retrySeconds) && retrySeconds > 0
      ? retrySeconds * 1000
      : Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 0
    const wait = Math.max(5 * 60 * 1000, serverWait)
    console.warn(`DShield rate limit received: HTTP 429: ${body.slice(0, 500)}; waiting ${Math.ceil(wait / 1000)} seconds before retry.`)
    await sleep(wait)
  }
  throw new Error('DShield request exhausted its retry attempts')
}

function rankedRows(data) {
  if (Array.isArray(data)) return data
  for (const key of ['topips', 'topports', 'data', 'ports']) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return Object.entries(data || {})
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, row]) => row)
}
// Geolocate one IP via ipwho.is, with retries on 429 (the free endpoint
// rate-limits bursts). Honours Retry-After when the server sends one.
async function geolocate(ip, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const res = await fetch(`${IPWHO_URL}/${encodeURIComponent(ip)}`, {
      headers: { accept: 'application/json' },
    })
    const body = await res.text()
    if (res.ok) {
      let geo
      try {
        geo = JSON.parse(body)
      } catch (error) {
        console.warn(`ipwho.is returned invalid JSON for ${ip}: ${error.message}; body: ${body.slice(0, 500)}`)
        return null
      }
      if (geo.success === false || typeof geo.latitude !== 'number' || typeof geo.longitude !== 'number') {
        console.warn(`ipwho.is returned no usable coordinates for ${ip}: ${body.slice(0, 500)}`)
        return null
      }
      return {
        ip,
        country: geo.country,
        countryCode: geo.country_code,
        city: geo.city || null,
        lat: geo.latitude,
        lon: geo.longitude,
      }
    }
    if (res.status === 429 && attempt < attempts) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt
      console.warn(`ipwho.is rate-limited ${ip} (HTTP 429, attempt ${attempt}/${attempts}): ${body.slice(0, 500)}; waiting ${wait}ms`)
      await sleep(wait)
      continue
    }
    console.warn(`ipwho.is lookup failed for ${ip}: HTTP ${res.status}: ${body.slice(0, 500)}`)
    return null
  }
  return null
}

// --- DShield text-feed parsers (defensive: skip comments/blank lines,
// require the expected columns, never throw on one bad line). ---

function parseTopIpsTxt(text) {
  // topips.txt is a ranked list: "IP<TAB>reverse-DNS-hostname", one per
  // line. It carries no counts — reports/targets come from the JSON API
  // (same ranking) and are joined by IP in buildSourcesSnapshot.
  const rows = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const ip = t.split(/\s+/)[0]
    if (!isPublicIp(ip)) continue
    rows.push({ source: ip, hostname: t.split(/\s+/)[1] || null })
  }
  return rows
}

function parseTop10Txt(text) {
  // top10.txt is a plain ranked list of source IPs, one per line. (Despite
  // the name it lists IPs, not ports — there is no port data in this feed.)
  const ips = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const ip = t.split(/\s+/)[0]
    if (isPublicIp(ip)) ips.push(ip)
  }
  return ips
}

function parseBlockTxt(text) {
  // block.txt lists /24 ranges: "startIP endIP prefix reports ASN country
  // abuse-contact". The country is given in the file, so no geolocation
  // lookup is needed for these entries.
  const ranges = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const parts = t.split(/\s+/)
    if (parts.length < 4 || !isPublicIp(parts[0])) continue
    ranges.push({
      network: `${parts[0]}/${parts[2] || '24'}`,
      startIp: parts[0],
      endIp: parts[1] || null,
      reports: Number(parts[3]) || 0,
      asn: parts[4] && parts[4] !== '-' ? parts[4] : null,
      country: parts[5] && parts[5] !== '-' ? parts[5] : null,
      abuse: parts[6] && parts[6] !== '-' ? parts[6] : null,
    })
  }
  return ranges
}

async function buildSourcesSnapshot() {
  const fetchedAt = new Date().toISOString()
  const feeds = { topips: 'error', topipsText: 'error', top10: 'error', block: 'error', dailySources: 'error' }
  let previousSnapshot = null
  try {
    previousSnapshot = JSON.parse(fs.readFileSync(OUT_SOURCES, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  let topRows = []
  let topIpsDataDate = null
  let topIpsFetchedAt = null
  let top10Sources = []
  let blocklist = []
  let dailySources = previousSnapshot?.dailySources || null

  // The two DShield rankings disagree on order: topips.txt / top10.txt rank
  // one way (IP + reverse-DNS hostname, no counts), the JSON API ranks
  // by reports and carries reports/targets. Geolocated sources require those
  // API counts; text-only rankings are metadata, never a count fallback.
  let topIpsTxt = []
  try {
    topIpsTxt = parseTopIpsTxt(await fetchText(TOPIPS_TXT, 'DShield topips.txt'))
    if (topIpsTxt.length === 0) throw new Error('topips.txt parsed to zero rows')
    feeds.topipsText = 'ok'
  } catch (err) {
    console.warn(`DShield topips.txt failed (${err.message})`)
  }
  try {
    const res = await fetchDshieldResponse(TOPIPS_API, {
      timeout: 30_000,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`)
    let data
    try {
      data = JSON.parse(body)
    } catch (error) {
      throw new Error(`invalid JSON response: ${error.message}; body: ${body.slice(0, 500)}`)
    }
    const rows = rankedRows(data)
    topRows = rows
      .filter((s) => s && isPublicIp(s.source) &&
        Number.isInteger(Number(s.rank)) && Number(s.rank) > 0 &&
        providedNumber(s.reports) != null && providedNumber(s.reports) > 0)
      .map((s) => ({
        rank: Number(s.rank),
        source: s.source,
        reports: providedNumber(s.reports),
        targets: providedNumber(s.targets),
        firstSeen: null, // the API publishes no first/last-seen timestamps
        lastSeen: null,
      }))
    if (topRows.length === 0) {
      throw new Error(`API returned no ranked rows; HTTP ${res.status}, body: ${body.slice(0, 500)}`)
    }
    topIpsFetchedAt = new Date().toISOString()
    topIpsDataDate = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
      ? data.date
      : null
    for (const row of topRows) row.dataDate = topIpsDataDate
    feeds.topips = 'ok'
  } catch (err) {
    console.warn(`DShield topips API failed: ${err.message}`)
  }

  try {
    top10Sources = parseTop10Txt(await fetchText(TOP10_TXT, 'DShield top10.txt'))
    feeds.top10 = 'ok'
  } catch (err) {
    console.warn(`DShield top10.txt failed: ${err.message}`)
  }

  try {
    blocklist = parseBlockTxt(await fetchText(BLOCK_TXT, 'DShield block.txt'))
    feeds.block = 'ok'
  } catch (err) {
    console.warn(`DShield block.txt failed: ${err.message}`)
  }

  // daily_sources is a ~149 MB dump not used by the map. Check availability
  // with HEAD only once a day; never download the body.
  const lastDailyCheck = Date.parse(dailySources?.checkedAt || '')
  if (!Number.isFinite(lastDailyCheck) || Date.now() - lastDailyCheck >= DAY) {
    try {
      const res = await fetchDshieldResponse(DAILY_SOURCES_URL, {
        method: 'HEAD',
        headers: { 'user-agent': USER_AGENT },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      dailySources = {
        bytes: Number(res.headers.get('content-length')) || null,
        checkedAt: fetchedAt,
        note: 'Bulk feed (~149 MB) — availability checked daily; body not downloaded.',
      }
      feeds.dailySources = 'ok'
    } catch (err) {
      console.warn(`DShield daily_sources check failed: ${err.message}`)
    }
  } else {
    feeds.dailySources = 'cached'
  }
  // Geolocate the top sources, sequentially with a polite pause: bursts are
  // what trip ipwho.is's rate limit. A failed lookup drops that one source;
  // it never invents a location.
  const sources = []
  for (const [i, s] of topRows.slice(0, 12).entries()) {
    if (i > 0) await sleep(1200)
    const geo = await geolocate(s.source).catch((err) => {
      console.warn(`ipwho.is lookup error for ${s.source}: ${err.message}`)
      return null
    })
    if (!geo) continue
    sources.push({
      ...geo,
      provider: 'DShield',
      reports: s.reports,
      targets: s.targets,
      rank: s.rank,
      dataDate: s.dataDate,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
    })
  }
  if (sources.length === 0) throw new Error('No DShield source IPs geolocated successfully')
  const geolocationFetchedAt = new Date().toISOString()
  const requestedGeolocations = Math.min(12, topRows.length)
  const geolocationStatus = sources.length === requestedGeolocations ? 'ok' : 'partial'

  if (topRows.length === 0) throw new Error('No valid dated DShield top-IP rows with provider-supplied report counts')

  const snapshot = {
    source: 'SANS Internet Storm Center (DShield) feeds, geolocated via ipwho.is',
    sourceUrl: TOPIPS_TXT,
    generatedAt: fetchedAt,
    dataDate: topIpsDataDate,
    providers: {
      dshield: { status: 'ok', fetchedAt: topIpsFetchedAt, dataDate: topIpsDataDate, feeds },
      ip_geolocation: {
        status: geolocationStatus,
        fetchedAt: geolocationFetchedAt,
        successfulLookups: sources.length,
        requestedLookups: requestedGeolocations,
        error: geolocationStatus === 'partial' ? 'Some source IPs could not be geolocated.' : null,
      },
      threatfox: { status: 'see threatfox-snapshot.json', fetchedAt: null },
    },
    sources,
    topIpsTxt,
    top10Sources,
    blocklist: { count: blocklist.length, ranges: blocklist },
    dailySources,
  }
  writeJson(OUT_SOURCES, snapshot)
  console.log(`Wrote ${OUT_SOURCES}: ${sources.length} geolocated sources, top10 ${top10Sources.length}, blocklist ${blocklist.length} ranges.`)
}

// ThreatFox get_iocs, gated on explicit licensing approval and THREATFOX_AUTH_KEY.
// Without both, nothing is requested and no file is written.
async function buildThreatfoxSnapshot() {
  if (!THREATFOX_ENABLED) {
    console.log('ThreatFox skipped: disabled pending commercial-use eligibility or a paid subscription.')
    return
  }
  if (!THREATFOX_KEY) {
    console.log('ThreatFox skipped: THREATFOX_AUTH_KEY is not configured.')
    return
  }
  const fetchedAt = new Date().toISOString()
  const res = await fetch(THREATFOX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Auth-Key': THREATFOX_KEY, 'user-agent': USER_AGENT },
    body: JSON.stringify({ query: 'get_iocs', days: 7 }),
  })
  if (!res.ok) throw new Error(`ThreatFox request failed: HTTP ${res.status}`)
  const body = await res.json()
  if (body.query_status !== 'ok' || !Array.isArray(body.data)) {
    throw new Error(`ThreatFox returned query_status ${body.query_status || 'unknown'}`)
  }
  const ipIocs = body.data
    .filter((d) => d.ioc_type === 'ip:port' || d.ioc_type === 'ip')
    .map((d) => ({ ...d, ip: String(d.ioc).split(':')[0] }))
    .filter((d) => isPublicIp(d.ip))
    .sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')))
    .slice(0, 25)

  const indicators = []
  for (const [i, d] of ipIocs.entries()) {
    if (i > 0) await sleep(1200)
    const geo = await geolocate(d.ip).catch((err) => {
      console.warn(`ipwho.is lookup error for ThreatFox ${d.ip}: ${err.message}`)
      return null
    })
    if (!geo) continue
    indicators.push({
      ...geo,
      provider: 'ThreatFox',
      iocType: d.ioc_type,
      threatType: d.threat_type || null,
      malware: d.malware || null,
      confidence: typeof d.confidence_level === 'number' ? d.confidence_level : null,
      firstSeen: d.first_seen || null,
      lastSeen: d.last_seen || null,
    })
  }

  writeJson(OUT_THREATFOX, {
    source: 'abuse.ch ThreatFox get_iocs (last 7 days), geolocated via ipwho.is',
    sourceUrl: THREATFOX_URL,
    generatedAt: fetchedAt,
    status: 'ok',
    totalReturned: body.data.length,
    indicators,
  })
  console.log(`Wrote ${OUT_THREATFOX}: ${indicators.length} geolocated IOCs (of ${body.data.length} returned).`)
}

async function buildKevSnapshot() {
  const res = await fetch(KEV_URL, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`KEV fetch failed: HTTP ${res.status}`)
  const catalog = await res.json()
  const vulns = Array.isArray(catalog.vulnerabilities) ? catalog.vulnerabilities : []
  const generatedAt = new Date().toISOString()

  const sorted = [...vulns].sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)))
  const now = Date.now()
  const last7 = sorted.filter((v) => now - Date.parse(v.dateAdded) <= 7 * DAY)
  const last30 = sorted.filter((v) => now - Date.parse(v.dateAdded) <= 30 * DAY)

  const vendorCounts = new Map()
  for (const v of vulns) vendorCounts.set(v.vendorProject, (vendorCounts.get(v.vendorProject) || 0) + 1)
  const topVendors = [...vendorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vendor, count]) => ({ vendor, count }))

  writeJson(OUT, {
    source: 'CISA Known Exploited Vulnerabilities catalog',
    sourceUrl: KEV_URL,
    generatedAt,
    catalogDate: catalog.dateReleased || null,
    totalKnownExploited: catalog.count ?? vulns.length,
    addedLast7Days: last7.length,
    addedLast30Days: last30.length,
    topVendors,
    recent: sorted.slice(0, 100).map((v) => ({
      cveID: v.cveID,
      vendorProject: v.vendorProject,
      product: v.product,
      vulnerabilityName: v.vulnerabilityName,
      dateAdded: v.dateAdded,
      dueDate: v.dueDate || null,
      shortDescription: v.shortDescription || '',
      knownRansomwareCampaignUse: v.knownRansomwareCampaignUse || 'Unknown',
    })),
  })
  console.log(`Wrote ${OUT}: ${vulns.length} KEV entries, ${last7.length} added in the last 7 days.`)
}

async function main() {
  // A KEV outage must not block other providers; the normalized snapshot
  // retains the last successful KEV data and marks its freshness honestly.
  try {
    await buildKevSnapshot()
  } catch (err) {
    console.warn(`KEV snapshot skipped: ${err.message}`)
  }

  // The sources snapshot is best-effort: if DShield or ipwho.is is
  // unavailable, the old file stays in place (the workflow only commits
  // files that changed, and this function throws before writing), the KEV
  // snapshot above still stands, and the page keeps showing the last good
  // data labelled CACHED.
  try {
    await buildSourcesSnapshot()
  } catch (err) {
    console.warn(`Sources snapshot skipped: ${err.message}`)
  }

  // ThreatFox is best-effort and key-gated: no key, no request, no file.
  // A failure writes nothing, so a previous good file (if any) stays live.
  try {
    await buildThreatfoxSnapshot()
  } catch (err) {
    console.warn(`ThreatFox snapshot skipped: ${err.message}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
