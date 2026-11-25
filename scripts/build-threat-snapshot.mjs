// Builds public/data/kev-snapshot.json from the CISA Known Exploited
// Vulnerabilities catalog, and public/data/sources-snapshot.json from the
// SANS DShield top attacking source IPs, geolocated server-side.
//
// Why snapshots: CISA publishes the KEV catalog as a JSON file, but it does
// not send CORS headers, so a browser on offlinetheory.github.io cannot fetch
// it directly. The DShield top-source list is CORS-open, but every visitor's
// browser then has to geolocate those IPs through ipwho.is — and ipwho.is
// rate-limits those lookups (HTTP 429), which left the live map with no
// traffic arcs and Top Attackers stuck on "Loading…". This script runs in
// GitHub Actions (hourly), fetches both server-side, and commits small
// summaries the threat-map page can fetch same-origin. The snapshots are
// always labelled with the time they were generated, and the page warns
// readers when one is stale.
//
// The sources snapshot is real DShield data geolocated at snapshot time;
// the page already shows its "Live — updated … UTC" time and names ipwho.is
// in the footer credit, so nothing extra needs to be said about it. If the
// snapshot fetch fails or comes back empty, the page falls back to the live
// topips + ipwho.is flow in the visitor's browser.
//
// Usage: node scripts/build-threat-snapshot.mjs [--out public/data/kev-snapshot.json] [--out-sources public/data/sources-snapshot.json]
import fs from 'node:fs'
import path from 'node:path'

const KEV_URL =
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
const TOPIPS_URL = 'https://isc.sans.edu/api/topips/records/25?json'
const IPWHO_URL = 'https://ipwho.is'

const outArg = process.argv.indexOf('--out')
const OUT = outArg >= 0 ? process.argv[outArg + 1] : 'public/data/kev-snapshot.json'
const outSourcesArg = process.argv.indexOf('--out-sources')
const OUT_SOURCES =
  outSourcesArg >= 0 ? process.argv[outSourcesArg + 1] : 'public/data/sources-snapshot.json'

const DAY = 24 * 60 * 60 * 1000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

async function buildSourcesSnapshot() {
  const res = await fetch(TOPIPS_URL, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`DShield topips fetch failed: HTTP ${res.status}`)
  const topIps = await res.json()
  if (!Array.isArray(topIps)) throw new Error('DShield topips returned an unexpected shape')

  const top = topIps.slice(0, 12)
  const sources = []
  for (const [i, s] of top.entries()) {
    // Sequential with a polite pause: 12 lookups in one burst is what
    // trips ipwho.is's rate limit.
    if (i > 0) await sleep(1200)
    const geo = await geolocate(s.source).catch((err) => {
      console.warn(`ipwho.is lookup error for ${s.source}: ${err.message}`)
      return null
    })
    if (!geo) continue
    sources.push({
      ...geo,
      reports: Number(s.reports) || 0,
      targets: Number(s.targets) || 0,
    })
  }
  if (sources.length === 0) throw new Error('No DShield source IPs geolocated successfully')

  const snapshot = {
    source: 'SANS Internet Storm Center (DShield) top attacking source IPs, geolocated via ipwho.is',
    sourceUrl: TOPIPS_URL,
    generatedAt: new Date().toISOString(),
    sources,
  }
  fs.mkdirSync(path.dirname(OUT_SOURCES), { recursive: true })
  fs.writeFileSync(OUT_SOURCES, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`Wrote ${OUT_SOURCES}: ${sources.length} geolocated sources.`)
}

async function main() {
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

  const snapshot = {
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
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`Wrote ${OUT}: ${snapshot.totalKnownExploited} KEV entries, ${snapshot.addedLast7Days} added in the last 7 days.`)

  // The sources snapshot is best-effort: if DShield or ipwho.is is
  // unavailable, the KEV snapshot above still stands and the page falls
  // back to its live flow, so a failure here must not fail the run.
  try {
    await buildSourcesSnapshot()
  } catch (err) {
    console.warn(`Sources snapshot skipped: ${err.message}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
