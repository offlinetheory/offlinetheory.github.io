// All editorial content is fictional placeholder copy written for this build.
// Replace with real articles (or wire to a CMS) before launch.

export const ARTICLES = [
  // ── The Digital Security Journal (homepage left column) ──────────────
  {
    slug: 'the-invisible-infrastructure-we-trust',
    title: 'The Invisible Infrastructure We Trust',
    section: 'analysis',
    volume: 'VOL. 001',
    thumb: 'arc',
    journal: true,
    author: 'Mara Ellison',
    date: '2026-01-12',
    readTime: 12,
    dek: 'DNS, certificate authorities, undersea cables and package registries: the quiet systems underneath everything, and the handful of people who keep them standing.',
    tags: ['infrastructure', 'dns', 'supply chain', 'pki'],
    body: [
      { type: 'p', text: 'Every time you load a page, you extend trust to dozens of parties you will never meet. A resolver answers a question about a name. A certificate authority vouches for a key. A registry serves a package that a stranger published at two in the morning. None of it is visible, and that is precisely the point.' },
      { type: 'p', text: 'Infrastructure is designed to disappear. When it works, nobody writes about it. When it fails, it fails all at once, and suddenly the abstractions that let us ignore it become the only thing anyone can talk about.' },
      { type: 'h2', text: 'A chain of strangers' },
      { type: 'p', text: 'Consider the path of a single HTTPS request. Before any content arrives, your machine has consulted a recursive resolver, walked a delegation chain from the root zone downward, validated a certificate against a trust store shipped by a browser vendor, and negotiated keys with a server that may be operated by a third-party CDN. Each step is a promise made by someone else.' },
      { type: 'quote', text: 'We do not trust the internet. We trust a long list of people who mostly do their jobs well.' },
      { type: 'p', text: 'The uncomfortable truth is that much of this work rests on remarkably small teams. Open-source maintainers, volunteer operators and under-funded standards bodies carry an outsized share of the load.' },
      { type: 'h2', text: 'What resilience actually looks like' },
      { type: 'list', items: ['Diversity of providers, so that one outage is not everyone\u2019s outage.', 'Transparency logs that make misissued certificates discoverable.', 'Funding models for the maintainers whose code ends up in everything.', 'Boring, well-rehearsed incident response.'] },
      { type: 'p', text: 'None of these are glamorous. All of them are cheaper than the alternative.' },
    ],
  },
  {
    slug: 'why-patching-still-matters',
    title: 'Why Patching Still Matters',
    section: 'guides',
    volume: 'VOL. 002',
    thumb: 'crt',
    journal: true,
    author: 'Theo Barrow',
    date: '2026-02-09',
    readTime: 9,
    dek: 'The least exciting security control is still the most effective one. A field guide to keeping old machines, and old habits, up to date.',
    tags: ['patching', 'updates', 'vulnerability management'],
    body: [
      { type: 'p', text: 'Most breaches do not begin with a brilliant exploit. They begin with a known vulnerability, a published fix, and a machine that never received it.' },
      { type: 'h2', text: 'The gap between disclosure and exploitation' },
      { type: 'p', text: 'The window between a public advisory and working exploit code keeps shrinking. For widely deployed software it can now be measured in days. Attackers read changelogs too.' },
      { type: 'code', text: '# Debian / Ubuntu: see what is pending, then apply\nsudo apt update && apt list --upgradable\nsudo apt upgrade\n\n# macOS\nsoftwareupdate --list' },
      { type: 'h2', text: 'A sensible routine' },
      { type: 'list', items: ['Turn on automatic updates for your operating system and browser.', 'Keep an inventory, even a rough one, of what you run.', 'Retire devices that no longer receive security updates.', 'Reboot. Many patches do nothing until you do.'] },
      { type: 'p', text: 'Patching is maintenance, not heroics. Treat it like brushing your teeth: small, routine, and non-negotiable.' },
    ],
  },
  {
    slug: 'privacy-in-a-hyper-connected-world',
    title: 'Privacy in a Hyper-Connected World',
    section: 'analysis',
    volume: 'VOL. 003',
    thumb: 'cctv',
    journal: true,
    author: 'Ines Okafor',
    date: '2026-03-16',
    readTime: 14,
    dek: 'When every object has a network connection, privacy stops being a setting and becomes a design decision made long before you open the box.',
    tags: ['privacy', 'iot', 'data brokers'],
    body: [
      { type: 'p', text: 'The thermostat knows when you are home. The television knows what you watch. The car knows where you went, how fast, and with which phone paired to it. Individually, each disclosure seems trivial. Together, they form a detailed biography.' },
      { type: 'h2', text: 'Consent at scale' },
      { type: 'p', text: 'Privacy policies were written for a world of a few websites. They do not scale to a household of thirty connected devices, each with its own terms, its own cloud and its own list of partners.' },
      { type: 'quote', text: 'You cannot meaningfully consent to a data flow you cannot see.' },
      { type: 'p', text: 'Regulation helps at the margins. The more durable fix is architectural: devices that process locally by default, and that keep working when the network does not.' },
    ],
  },
  {
    slug: 'the-rise-of-everyday-surveillance',
    title: 'The Rise of Everyday Surveillance',
    section: 'analysis',
    volume: 'VOL. 004',
    thumb: 'floppy',
    journal: true,
    author: 'Mara Ellison',
    date: '2026-04-20',
    readTime: 11,
    dek: 'Doorbell cameras, license plate readers and loyalty cards: surveillance did not arrive with a bang. It arrived as a convenience.',
    tags: ['surveillance', 'privacy', 'policy'],
    body: [
      { type: 'p', text: 'Surveillance used to require an institution. Now it requires a subscription. The infrastructure of observation has been distributed into doorbells, dashboards and point-of-sale terminals, and most of it is owned by people who would never describe themselves as watching anyone.' },
      { type: 'h2', text: 'From exception to default' },
      { type: 'p', text: 'What changed was not capability but cost. Storage became cheap, recognition became accurate, and retention became the default setting on products sold as safety features.' },
      { type: 'p', text: 'The question is no longer whether we are recorded, but who can ask for the footage, how long it is kept, and whether anyone ever says no.' },
    ],
  },

  // ── Latest (homepage right column) ──────────────────────────────────
  {
    slug: 'a-closer-look-at-the-latest-zero-day',
    title: 'A Closer Look at the Latest Zero-Day',
    section: 'news',
    category: 'Security',
    latest: 1,
    author: 'Theo Barrow',
    date: '2026-11-10',
    readTime: 8,
    dek: 'A memory-safety flaw in a widely used image parser was exploited before a fix existed. Here is what happened, who is affected, and what to do now.',
    tags: ['zero-day', 'vulnerability', 'incident', 'browser'],
    body: [
      { type: 'p', text: 'A zero-day is a vulnerability that defenders learn about at the same moment as everyone else: after it has already been used. This week\u2019s example, a heap overflow in a common image decoding library, followed a familiar pattern. A crafted file, a parser that trusted its input, and a payload delivered through a message preview that required no click at all.' },
      { type: 'h2', text: 'What we know' },
      { type: 'list', items: ['The flaw sits in a decoding routine shared by several browsers and messaging apps.', 'Exploitation was limited and targeted, according to the vendors\u2019 advisories.', 'Patches shipped within 72 hours of the first report.'] },
      { type: 'h2', text: 'What to do' },
      { type: 'p', text: 'Update your browser and messaging apps, then restart them. That is genuinely the whole list for most people. Organisations should check managed devices for lagging versions.' },
      { type: 'code', text: 'chrome://settings/help      # check and apply browser updates\nabout:preferences#general   # Firefox' },
      { type: 'p', text: 'The broader lesson is older than this bug: parsers are attack surface, and the industry\u2019s slow migration to memory-safe languages is not a style preference.' },
    ],
  },
  {
    slug: 'open-source-security-tools-worth-using',
    title: 'Open-Source Security Tools Worth Using',
    section: 'tools',
    category: 'Tools',
    latest: 2,
    author: 'Ines Okafor',
    date: '2026-11-06',
    readTime: 6,
    dek: 'A short, opinionated list of free tools that earn their place on a working machine, from password managers to network inspectors.',
    tags: ['open source', 'tools', 'password manager', 'review'],
    body: [
      { type: 'p', text: 'Good security tooling should be boring to use and easy to verify. Open-source software is not automatically safer, but it is inspectable, and the best projects have years of public scrutiny behind them.' },
      { type: 'h2', text: 'The shortlist' },
      { type: 'list', items: ['KeePassXC \u2014 an offline password manager with a simple, auditable file format.', 'Wireshark \u2014 the standard for seeing what is actually on your network.', 'age \u2014 small, modern file encryption with no configuration knobs to get wrong.', 'Nmap \u2014 for understanding what your own devices expose.'] },
      { type: 'code', text: '# encrypt a file to a recipient with age\nage -r age1example... -o notes.txt.age notes.txt' },
      { type: 'p', text: 'Pick fewer tools and learn them well. A tool you understand beats three you installed once.' },
    ],
  },
  {
    slug: 'the-real-cost-of-convenience',
    title: 'The Real Cost of Convenience',
    section: 'analysis',
    category: 'Analysis',
    latest: 3,
    author: 'Mara Ellison',
    date: '2026-11-02',
    readTime: 10,
    dek: 'Single sign-on, smart homes and one-tap payments save seconds. What they cost is harder to see, and it is usually paid later.',
    tags: ['convenience', 'privacy', 'identity', 'design'],
    body: [
      { type: 'p', text: 'Convenience is the most persuasive product feature ever invented. It is also, reliably, where security budgets go to die. Every removed step is a removed check.' },
      { type: 'h2', text: 'Concentration risk' },
      { type: 'p', text: 'Signing in with one account everywhere is efficient right up until that account is lost. The same consolidation that makes life easier makes failure total.' },
      { type: 'quote', text: 'The friction you remove for yourself, you also remove for whoever is pretending to be you.' },
      { type: 'p', text: 'None of this is an argument for inconvenience as a virtue. It is an argument for choosing friction deliberately: hardware keys over SMS codes, local control over cloud dependency, and recovery plans written down before they are needed.' },
    ],
  },

  // ── Section depth ───────────────────────────────────────────────────
  {
    slug: 'ransomware-groups-shift-to-data-extortion',
    title: 'Ransomware Groups Shift to Pure Data Extortion',
    section: 'news',
    category: 'Threats',
    author: 'Theo Barrow',
    date: '2026-10-28',
    readTime: 5,
    dek: 'Fewer encrypted servers, more stolen archives: why criminal crews are skipping the encryption step entirely.',
    tags: ['ransomware', 'extortion', 'threats'],
    body: [
      { type: 'p', text: 'Encryption was always the noisy part of ransomware. It triggered alarms, broke systems and invited law enforcement attention. Increasingly, groups are skipping it, stealing data quietly and negotiating over the threat of publication alone.' },
      { type: 'p', text: 'For defenders, that means backups are no longer the whole answer. Detecting large outbound transfers matters as much as restoring from tape.' },
    ],
  },
  {
    slug: 'passkeys-reach-the-mainstream',
    title: 'Passkeys Quietly Reach the Mainstream',
    section: 'news',
    category: 'Identity',
    author: 'Ines Okafor',
    date: '2026-10-19',
    readTime: 4,
    dek: 'Major platforms now default to passkeys for new accounts. Passwords are not gone, but they are finally optional.',
    tags: ['passkeys', 'identity', 'authentication', 'webauthn'],
    body: [
      { type: 'p', text: 'Passkeys replace a shared secret with a key pair bound to a specific site. There is nothing to phish because there is nothing to type. This autumn, several of the largest consumer platforms made them the default sign-in for new accounts.' },
      { type: 'p', text: 'The hard problem now is recovery: what happens when the device holding your keys is lost. Expect that to be the next battleground.' },
    ],
  },
  {
    slug: 'regulators-target-data-brokers',
    title: 'Regulators Turn Their Attention to Data Brokers',
    section: 'news',
    category: 'Policy',
    author: 'Mara Ellison',
    date: '2026-10-07',
    readTime: 6,
    dek: 'New rules would require brokers to register, disclose their sources and honour deletion requests within thirty days.',
    tags: ['policy', 'data brokers', 'privacy', 'regulation'],
    body: [
      { type: 'p', text: 'Data brokers sit in the least visible corner of the information economy, buying and selling location trails and purchase histories assembled from apps and loyalty programmes. A proposed set of rules would, for the first time, require them to say where their data comes from.' },
    ],
  },
  {
    slug: 'threat-modeling-for-normal-people',
    title: 'Threat Modeling for Normal People',
    section: 'analysis',
    category: 'Commentary',
    author: 'Theo Barrow',
    date: '2026-09-22',
    readTime: 13,
    dek: 'Security advice fails when it ignores who you are. Four questions that make every other decision easier.',
    tags: ['threat modeling', 'personal security', 'commentary'],
    body: [
      { type: 'p', text: 'Threat modeling sounds like something done in a conference room with a whiteboard. In practice it is four plain questions: what do I have, who might want it, how bad would losing it be, and how much effort am I willing to spend protecting it?' },
      { type: 'list', items: ['What am I protecting?', 'From whom?', 'What happens if I fail?', 'What can I realistically do?'] },
      { type: 'p', text: 'Answer those honestly and most of the noise in security advice falls away.' },
    ],
  },
  {
    slug: 'review-hardware-security-keys-2026',
    title: 'Review: Hardware Security Keys in 2026',
    section: 'tools',
    category: 'Review',
    author: 'Ines Okafor',
    date: '2026-09-30',
    readTime: 7,
    dek: 'We carried five FIDO2 keys for a month. The best one is the one you will actually keep on your keyring.',
    tags: ['hardware keys', 'fido2', 'review', 'authentication'],
    body: [
      { type: 'p', text: 'Hardware keys remain the strongest protection most people can add to an account. The differences between them are smaller than marketing suggests: connector type, durability and whether they store passkeys on the device.' },
      { type: 'p', text: 'Buy two. Register both. Keep one somewhere safe. That advice has not changed in years, and it is still the most important part of this review.' },
    ],
  },
  {
    slug: 'a-minimal-privacy-browser-setup',
    title: 'A Minimal Privacy Browser Setup',
    section: 'tools',
    category: 'Recommendations',
    author: 'Theo Barrow',
    date: '2026-08-18',
    readTime: 5,
    dek: 'Three settings and one extension that do more than a dozen add-ons ever will.',
    tags: ['browser', 'privacy', 'extensions', 'tools'],
    body: [
      { type: 'p', text: 'Every extension you install is code with access to your browsing. The best privacy setup is short: block third-party cookies, enable HTTPS-only mode, use a reputable content blocker, and stop there.' },
    ],
  },
  {
    slug: 'how-to-audit-your-accounts-in-an-afternoon',
    title: 'How to Audit Your Accounts in an Afternoon',
    section: 'guides',
    category: 'Tutorial',
    author: 'Mara Ellison',
    date: '2026-10-12',
    readTime: 15,
    dek: 'A step-by-step walkthrough for finding forgotten accounts, rotating weak passwords and turning on two-factor where it counts.',
    tags: ['tutorial', 'accounts', 'passwords', '2fa'],
    body: [
      { type: 'p', text: 'Set aside three hours, a cup of something warm and your password manager. By the end you will know where your important accounts are and how they are protected.' },
      { type: 'h2', text: 'Step one: inventory' },
      { type: 'p', text: 'Search your email for "welcome", "verify your email" and "receipt". Every hit is an account. List them.' },
      { type: 'h2', text: 'Step two: triage' },
      { type: 'list', items: ['Email and phone carrier first: they reset everything else.', 'Banking and payments second.', 'Everything else, then delete what you no longer use.'] },
    ],
  },
  {
    slug: 'encrypting-your-backups',
    title: 'Encrypting Your Backups, Properly',
    section: 'guides',
    category: 'Tutorial',
    author: 'Theo Barrow',
    date: '2026-07-27',
    readTime: 11,
    dek: 'Backups are only half a plan if anyone who finds the drive can read them.',
    tags: ['backups', 'encryption', 'tutorial'],
    body: [
      { type: 'p', text: 'A backup protects you from loss. An encrypted backup also protects you from theft. The extra step costs a few minutes and one password you must not forget.' },
      { type: 'code', text: '# restic: initialise an encrypted repository and back up your home folder\nrestic init --repo /Volumes/Backup/restic\nrestic -r /Volumes/Backup/restic backup ~/' },
    ],
  },
]

// Downloadable guides. PLACEHOLDERS: no files, prices, or checkout exist yet.
export const PRODUCTS = [
  { slug: 'personal-security-field-guide', title: 'The Personal Security Field Guide', format: 'PDF · 64 pages', price: 'Placeholder price', status: 'Coming soon' },
  { slug: 'small-office-hardening-checklist', title: 'Small Office Hardening Checklist', format: 'PDF + spreadsheet', price: 'Placeholder price', status: 'Coming soon' },
  { slug: 'offline-theory-print-001', title: 'Offline Theory, Print Edition VOL. 001', format: 'Printed journal', price: 'Placeholder price', status: 'Coming soon' },
]

export const getArticle = (slug) => ARTICLES.find((a) => a.slug === slug)
export const journalIssues = () => ARTICLES.filter((a) => a.journal)
export const latestArticles = () =>
  ARTICLES.filter((a) => a.latest).sort((a, b) => a.latest - b.latest)
export const articlesInSection = (section) =>
  ARTICLES.filter((a) => a.section === section).sort((a, b) => b.date.localeCompare(a.date))

export function articleText(a) {
  return [
    a.title, a.dek, a.section, a.category, a.author, a.volume, ...(a.tags || []),
    ...a.body.map((b) => b.text || (b.items || []).join(' ')),
  ].filter(Boolean).join(' ')
}

export function searchArticles(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return ARTICLES.map((a) => {
    const title = a.title.toLowerCase()
    const hay = articleText(a).toLowerCase()
    let score = 0
    for (const t of terms) {
      if (!hay.includes(t)) return null
      if (title.includes(t)) score += 5
      if ((a.tags || []).some((tag) => tag.includes(t))) score += 3
      if (a.dek.toLowerCase().includes(t)) score += 2
      score += 1
    }
    return { article: a, score }
  })
    .filter(Boolean)
    .sort((x, y) => y.score - x.score || y.article.date.localeCompare(x.article.date))
    .map((r) => r.article)
}

export function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
