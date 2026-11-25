// Builds public/data/kev-snapshot.json from the CISA Known Exploited
// Vulnerabilities catalog.
//
// Why a snapshot: CISA publishes the KEV catalog as a JSON file, but it does
// not send CORS headers, so a browser on offlinetheory.github.io cannot fetch
// it directly. This script runs in GitHub Actions (hourly), fetches the
// catalog server-side, and commits a small summary the threat-map page can
// fetch same-origin. The snapshot is always labelled with the time it was
// generated, and the page warns readers when it is stale.
//
// Usage: node scripts/build-threat-snapshot.mjs [--out public/data/kev-snapshot.json]
import fs from 'node:fs'
import path from 'node:path'

const KEV_URL =
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'

const outArg = process.argv.indexOf('--out')
const OUT = outArg >= 0 ? process.argv[outArg + 1] : 'public/data/kev-snapshot.json'

const DAY = 24 * 60 * 60 * 1000

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
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
