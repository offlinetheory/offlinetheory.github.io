// Builds the threat-intel snapshots the Live Cyber Threat Map reads
// same-origin: public/data/kev-snapshot.json (CISA KEV),
// public/data/sources-snapshot.json (SANS DShield feeds, geolocated
// server-side), and public/data/threatfox-snapshot.json (abuse.ch
// ThreatFox IOCs, only when THREATFOX_AUTH_KEY is configured).
//
// Why snapshots: CISA publishes the KEV catalog as JSON but sends no CORS
// headers, so a browser on offlinetheory.github.io cannot fetch it directly.
// DShield's feeds are CORS-open, but every visitor's browser would then have
// to geolocate the IPs through ipwho.is — and ipwho.is rate-limits those
// lookups (HTTP 429), which once left the live map with no traffic data.
// ThreatFox requires an Auth-Key header, which must never ship in frontend
// JavaScript. This script runs in GitHub Actions (hourly), fetches everything
// server-side, and commits small summaries the map page can fetch
// same-origin. Every snapshot is labelled with when it was generated and
// which provider each record came from, so the page can show LIVE vs CACHED
// honestly and never present a stale or simulated record as live.
//
// Rules the script enforces:
// - DShield feeds are fetched at most once per hour (the workflow runs
//   hourly); a failed feed never wipes the previous snapshot — the old file
//   stays in place and the failure is recorded in providers status.
// - Only valid public IPs are geolocated or published. Private, loopback,
//   reserved and otherwise non-routable addresses are excluded, as are
//   indicators that cannot be geolocated reliably. Coordinates are never
//   invented.
// - ThreatFox is skipped entirely unless THREATFOX_AUTH_KEY is set in the
//   environment (GitHub Actions secret). Without it the provider is reported
//   as not_configured and no request is attempted.
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

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n')
}

async function fetchText(url, label) {
  const res = await fetch(url, { headers: { accept: 'text/plain, */*' } })
  if (!res.ok) throw new Error(`${label} fetch failed: HTTP ${res.status}`)
  return await res.text()
}
// Geolocate one IP via ipwho.is, with retries on 429 (the free endpoint
// rate-limits bursts). Honours Retry-After when the server sends one.
async function geolocate(ip, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const res = await fetch(`${IPWHO_URL}/${encodeURIComponent(ip)}`, {
      headers: { accept: 'application/json' },
    })
    if (res.ok) {
      const geo = await res.json()
      if (geo.success === false || typeof geo.latitude !== 'number') return null
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
      console.warn(`ipwho.is rate-limited ${ip} (attempt ${attempt}/${attempts}); waiting ${wait}ms`)
      await sleep(wait)
      continue
    }
    console.warn(`ipwho.is lookup failed for ${ip}: HTTP ${res.status}`)
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
  const feeds = { topips: 'error', top10: 'error', block: 'error', dailySources: 'error' }
  let topRows = []
  let top10Sources = []
  let blocklist = []
  let dailySources = null

  // The two DShield rankings disagree on order: topips.txt / top10.txt rank
  // one way (IP + reverse-DNS hostname, no counts), the JSON API ranks by
  // reports and carries reports/targets. The map needs counts to size its
  // markers, so the geolocated sources come from the API; the txt rankings
  // are recorded alongside them for reference. No counts are ever joined
  // across the two rankings — they are different lists.
  let topIpsTxt = []
  try {
    topIpsTxt = parseTopIpsTxt(await fetchText(TOPIPS_TXT, 'DShield topips.txt'))
    if (topIpsTxt.length === 0) throw new Error('topips.txt parsed to zero rows')
    feeds.topips = 'ok'
  } catch (err) {
    console.warn(`DShield topips.txt failed (${err.message})`)
  }
  try {
    const res = await fetch(TOPIPS_API, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error('unexpected shape')
    topRows = data
      .filter((s) => isPublicIp(s.source))
      .map((s) => ({
        source: s.source,
        reports: Number(s.reports) || 0,
        targets: Number(s.targets) || 0,
        firstSeen: null, // the API publishes no first/last-seen timestamps
        lastSeen: null,
      }))
    if (topRows.length === 0) throw new Error('API returned zero public rows')
    if (feeds.topips === 'error') feeds.topips = 'ok (api only)'
  } catch (err) {
    console.warn(`DShield topips API failed: ${err.message}`)
    // Fall back to the txt ranking with null counts rather than no data.
    topRows = topIpsTxt.map((r) => ({
      source: r.source,
      reports: null,
      targets: null,
      firstSeen: null,
      lastSeen: null,
    }))
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

  // daily_sources is a ~149 MB bulk dump (millions of per-source rows). The
  // map cannot use it as markers, and downloading it hourly is wasteful, so
  // the pipeline checks its availability with a HEAD request only and
  // records the size. No body is downloaded.
  try {
    const res = await fetch(DAILY_SOURCES_URL, { method: 'HEAD' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    dailySources = {
      bytes: Number(res.headers.get('content-length')) || null,
      note: 'Bulk feed (~149 MB) — availability checked only, body not downloaded.',
    }
    feeds.dailySources = 'ok'
  } catch (err) {
    console.warn(`DShield daily_sources check failed: ${err.message}`)
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
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
    })
  }
  if (sources.length === 0) throw new Error('No DShield source IPs geolocated successfully')

  const snapshot = {
    source: 'SANS Internet Storm Center (DShield) feeds, geolocated via ipwho.is',
    sourceUrl: TOPIPS_TXT,
    generatedAt: fetchedAt,
    providers: {
      dshield: { status: feeds.topips === 'error' ? 'error' : 'ok', fetchedAt, feeds },
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

// ThreatFox get_iocs, gated on THREATFOX_AUTH_KEY. With no key configured
// nothing is requested and no file is written; the map reports the provider
// as not_configured.
async function buildThreatfoxSnapshot() {
  if (!THREATFOX_KEY) {
    console.log('ThreatFox skipped: THREATFOX_AUTH_KEY is not configured.')
    return
  }
  const fetchedAt = new Date().toISOString()
  const res = await fetch(THREATFOX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Auth-Key': THREATFOX_KEY },
    body: JSON.stringify({ query: 'get_iocs', days: 1 }),
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
    source: 'abuse.ch ThreatFox get_iocs (last 24h), geolocated via ipwho.is',
    sourceUrl: THREATFOX_URL,
    generatedAt: fetchedAt,
    status: 'ok',
    totalReturned: body.data.length,
    indicators,
  })
  console.log(`Wrote ${OUT_THREATFOX}: ${indicators.length} geolocated IOCs (of ${body.data.length} returned).`)
}

async function buildKevSnapshot() {
  const res = await fetch(KEV_URL, { headers: { accept: 'application/json' } })
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
    recent: sorted.slice(0, 12).map((v) => ({
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
  // KEV is required: if it fails, the run fails loudly.
  await buildKevSnapshot()

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
