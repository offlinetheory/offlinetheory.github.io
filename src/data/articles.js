// Most editorial content is fictional placeholder copy written for this build.
// Articles with placeholder: false are real editorial copy.

export const ARTICLES = [
  // ── The Digital Security Journal (homepage left column) ──────────────
  {
    slug: 'the-invisible-infrastructure-we-trust',
      placeholder: false,
    title: 'The Invisible Infrastructure We Trust',
    section: 'analysis',
    volume: 'VOL. 001',
    thumb: 'infrastructure',
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
      placeholder: false,
    title: 'Why Patching Still Matters',
    section: 'guides',
    volume: 'VOL. 002',
    thumb: 'patch',
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
      placeholder: false,
    title: 'Privacy in a Hyper-Connected World',
    section: 'analysis',
    volume: 'VOL. 003',
    thumb: 'privacy',
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
      placeholder: false,
    title: 'The Rise of Everyday Surveillance',
    section: 'analysis',
    volume: 'VOL. 004',
    thumb: 'surveillance',
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
      placeholder: false,
    title: 'A Closer Look at the Latest Zero-Day',
    section: 'news',
    category: 'Security',
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
      placeholder: false,
    title: 'Open-Source Security Tools Worth Using',
    section: 'tools',
    category: 'Tools',
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
      placeholder: false,
    title: 'The Real Cost of Convenience',
    section: 'analysis',
    category: 'Analysis',
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


  // ── Real editorial copy (Tools) ─────────────────────────────────────
  // TODO-AFFILIATE: replace the official Proton Pass and NordPass hrefs
  // below (https://proton.me/pass and https://nordpass.com/) with tracked
  // affiliate links once those accounts are approved. Anchors use
  // data-affiliate="TODO-AFFILIATE" and rel="sponsored noopener".
  {
    slug: 'password-managers-compared-2026',
    title: 'Password Managers, Compared Without the Hype',
    section: 'tools',
    category: 'Tools',
    placeholder: false,
    author: 'Jamiah McQuiller',
    date: '2026-11-14',
    readTime: 8,
    dek: 'Four popular vaults, lined up on encryption, audits, price, and whether the free plan is actually usable. A researched comparison, not a lab test.',
    tags: ['password manager', 'passkeys', 'tools', 'privacy', 'bitwarden', 'proton pass'],
    body: [
      { type: 'disclosure', text: 'OFFLINE THEORY may earn a commission if you buy through links in this article. It doesn’t affect our recommendations.' },
      { type: 'p', text: 'Most people still reuse a handful of passwords, or keep them in a notes app. That habit is what credential stuffing actually feeds on. A password manager is the least dramatic fix in security, and the one that does the most work: one strong master password, a unique password for every site, and a place to keep passkeys when a site finally offers them.' },
      { type: 'p', text: 'This comparison looks at four managers a beginner or a security-conscious reader is likely to consider in late 2026: Proton Pass and NordPass, which we may earn a commission on if you subscribe through our links, and Bitwarden and 1Password, which we do not. The order of appearance is not a ranking. None of these four has a LastPass-style vault-theft incident on the public record. We did not lab-test the apps ourselves. What follows is drawn from each company’s official pricing, security, and feature pages, and from published audit summaries, as of mid-November 2026. Prices, especially introductory ones, change. Check the live plans page before you pay.' },
      { type: 'h2', text: 'What actually matters' },
      { type: 'p', text: 'You are trusting a vault with the keys to the rest of your life. The boring questions are the right ones.' },
      { type: 'list', items: [
        'Can the vendor read your vault? You want end-to-end encryption, often called zero-knowledge: data is encrypted on your device before it is sent to the server.',
        'Has anyone independent looked at the code? An audit is not a guarantee. It is better than a claim with no paperwork.',
        'Is the source code public? Open source does not make software safe by itself. It does let other people check the claim.',
        'Does the free plan work on a phone and a computer at the same time? If it does not, you will stop using it.',
        'Can it store and use passkeys? Passwords are not gone, but they are no longer the only option.',
      ] },
      { type: 'h2', text: 'Bitwarden' },
      { type: 'p', text: 'Bitwarden is the default I would hand most people. It is open source, end-to-end encrypted, and independently audited every year. Vault data is encrypted with AES-256; keys are derived with PBKDF2 or Argon2id on your device. Bitwarden cannot read your vault or reset your master password.' },
      { type: 'p', text: 'The free plan is unusually complete: unlimited logins, notes, and cards, on unlimited devices, plus passkey storage and a two-person sharing organisation. Premium is $19.80 a year, about $1.65 a month when billed annually, and adds a built-in authenticator, emergency access, security reports, and file attachments. Families is $47.88 a year for up to six people. You can also self-host, which matters if you want the data on a machine you control.' },
      { type: 'p', text: 'The trade-off is polish. The apps do the job, but they are plainer than 1Password’s. That is not a reason to skip it.' },
      { type: 'h2', text: 'Proton Pass' },
      { type: 'p', text: 'Proton Pass sits inside Proton’s Swiss privacy suite, next to Mail, Calendar, VPN, and Drive. It is end-to-end encrypted and open source. Recurity Labs audited it between January and April 2026 and reported no remote exploits and no encryption bypasses; Proton says the memory-handling issues found in that review were fixed on retest.' },
      { type: 'p', text: 'The free plan is also generous: unlimited logins, notes, cards, and devices, passkeys, and alerts for weak or reused passwords, with ten hide-my-email aliases and a cap of three built-in two-factor items. Pass Plus is the paid tier. As of mid-November 2026, Proton listed it at $1.99 a month for the first year when billed annually, or $23.88, then $35.88 a year. Plus lifts the alias and two-factor limits, and adds vault sharing, dark web monitoring, file attachments, emergency access, and a command-line tool. A Family plan covers up to six people; an Unlimited bundle layers Pass on top of Proton’s other apps.' },
      { type: 'p', text: [
        'Passkeys work in the browser extension and on current Android and iOS apps. You still cannot sign into Proton’s own apps with a passkey. If you already live in Proton Mail, this is the vault that fits. You can start with ',
        { href: 'https://proton.me/pass', text: 'Proton Pass', sponsored: true },
        '. If you do not, Bitwarden’s free plan is the closer match for most people.',
      ] },
      { type: 'h2', text: 'NordPass' },
      { type: 'p', text: 'NordPass is a product of Nord Security, the company behind NordVPN. It uses end-to-end, zero-knowledge encryption, with XChaCha20 and Argon2id, and has been independently audited by Cure53. It is not open source. That is the main caveat, and it is a real one if you want to verify the cryptography yourself rather than trust an audit report.' },
      { type: 'p', text: 'The free plan stores an unlimited number of logins, but only one device can be active at a time. That is a hard limit for anyone who uses a phone and a laptop. Premium unlocks multiple devices, password health, a data-breach scanner, item sharing, file attachments, email masking, and emergency access. Family covers six separate Premium vaults. Paid plans carry a 30-day money-back guarantee. Introductory annual prices change often; as of mid-November 2026, NordPass advertised Premium at $1.99 a month for the first year when billed annually. Confirm the current figure on the official plans page.' },
      { type: 'p', text: [
        'NordPass also supports passkeys, and it is a reasonable paid choice if you already pay for NordVPN and want the vault in the same account. You can look at ',
        { href: 'https://nordpass.com/', text: 'NordPass', sponsored: true },
        ' if that is already your stack. It is not the free-plan winner.',
      ] },
      { type: 'h2', text: '1Password' },
      { type: 'p', text: '1Password is the most finished of the four, and the only one here without a lasting free plan. New customers typically get a short trial, then pay. As of mid-November 2026, Individual was listed at $2.99 a month for the first year with annual billing, then $3.99 a month, or $47.88 a year. Families is $4.49 a month introductory, then $5.99, and includes five people plus guest accounts.' },
      { type: 'p', text: 'The security model is well documented: end-to-end AES-256-GCM, PBKDF2 key derivation, and a 128-bit Secret Key that lives on your devices and is combined with your account password. That extra secret is a genuine advantage if someone later learns only your master password. The company publishes third-party assessments and holds ISO and SOC 2 certifications. The clients are not fully open source. 1Password has not disclosed a breach of customer vaults. In August 2024 it published fixes for local vulnerabilities that required an already-compromised device.' },
      { type: 'p', text: 'Passkeys, Watchtower alerts, travel mode, and consistently good apps across macOS, Windows, Linux, iOS, and Android are the reasons people pay. If you will use those apps every day and can afford the subscription, 1Password is easy to recommend. It is not the value pick, and there is no free on-ramp once the trial ends.' },
      { type: 'h2', text: 'Side by side' },
      { type: 'p', text: 'Figures are from official pricing and security pages as of mid-November 2026. Introductory prices are for new annual subscriptions and expire; taxes vary by region.' },
      {
        type: 'table',
        caption: 'Password manager comparison, mid-November 2026. Introductory prices change; confirm the live plans page before you buy.',
        headers: ['', 'Bitwarden', 'Proton Pass', 'NordPass', '1Password'],
        rows: [
          ['Free plan', 'Unlimited logins and devices; two-person sharing', 'Unlimited logins and devices; 10 email aliases; three built-in 2FA items', 'Unlimited storage; one active device', 'No lasting free plan; short trial'],
          ['Paid individual', '$19.80/year (Premium)', 'Pass Plus: $23.88 first year, then $35.88/year', 'Premium: advertised at $1.99/mo first year, billed annually; confirm live price', 'Individual: $2.99/mo first year, then $3.99/mo billed annually'],
          ['Family', '$47.88/year, up to six people', 'Family plan, up to six people', 'Six separate Premium vaults', 'Families: $4.49/mo first year, then $5.99/mo; five people'],
          ['Encryption', 'E2EE, AES-256, PBKDF2 or Argon2id', 'E2EE, open-source clients', 'E2EE, XChaCha20, Argon2id', 'E2EE, AES-256-GCM, PBKDF2, Secret Key'],
          ['Open source', 'Yes', 'Yes', 'No', 'Not fully'],
          ['Independent audit', 'Annual third-party audits', 'Recurity Labs, Jan–Apr 2026', 'Cure53', 'Periodic third-party assessments; ISO, SOC 2'],
          ['Passkeys', 'Yes', 'Yes, in the extension and on Android and iOS; not for Proton app sign-in', 'Yes', 'Yes'],
          ['Platforms', 'Windows, macOS, Linux, iOS, Android, browsers; self-host option', 'Windows, macOS, Linux, iOS, Android, browsers; CLI on Plus', 'Windows, macOS, Linux, iOS, Android, browsers', 'Windows, macOS, Linux, iOS, Android, browsers'],
          ['Notable incidents', 'No public vault-theft incident comparable to LastPass 2022', 'No vault-theft incident; 2026 audit found no encryption bypass', 'No public vault-theft incident comparable to LastPass 2022', 'No disclosed vault breach; 2024 local-device fixes'],
        ],
      },
      { type: 'h2', text: 'Who should pick which' },
      { type: 'p', text: 'If you want the best free plan, or you want software you can inspect and, if you choose, host yourself: Bitwarden. Pay for Premium if you want a built-in authenticator and emergency access. At $19.80 a year, that upgrade is still the cheapest paid option in this group.' },
      { type: 'p', text: [
        'If you already use Proton Mail or Proton VPN, and you want the vault under the same account: ',
        { href: 'https://proton.me/pass', text: 'Proton Pass', sponsored: true },
        '. The free tier is strong enough to start. Plus is worth it when you need unlimited aliases, sharing, or emergency access.',
      ] },
      { type: 'p', text: [
        'If you already subscribe to NordVPN and you are willing to pay for a simple, multi-device vault: ',
        { href: 'https://nordpass.com/', text: 'NordPass', sponsored: true },
        '. Skip the free plan if you need a phone and a computer at the same time.',
      ] },
      { type: 'p', text: 'If you want the most polished apps, a Secret Key on top of your master password, and you will pay for it: 1Password, especially on the Families plan.' },
      { type: 'p', text: 'Commission does not change that list. Bitwarden is still the recommendation I would make first, and we do not earn anything if you choose it.' },
      { type: 'p', text: 'If you already use one of these four and it is working, stay. Switching for a slightly nicer feature is rarely worth the risk of a sloppy export.' },
      { type: 'h2', text: 'How to switch safely' },
      { type: 'p', text: 'Moving a vault is a short, careful job, not an afternoon of heroics.' },
      { type: 'list', items: [
        'Create the new account and write down the master password, plus any recovery kit or Secret Key, on paper you actually keep.',
        'Turn on two-factor authentication for the new manager itself, preferably a hardware key or an authenticator app, not SMS.',
        'Export from the old manager in its official format. 1Password, Bitwarden, Proton Pass, and NordPass all document this. Prefer an encrypted export when the tool offers one. If you have to use a CSV, do it on a trusted computer, never email it, and delete the file after the import succeeds.',
        'Import into the new vault and spot-check a dozen important logins, including email, banking, and your Apple or Google account.',
        'Keep the old vault read-only for a few weeks. Sign into sites from the new manager as you go. When you are sure everything works, change the passwords that still feel important, then delete the old account and any leftover export files.',
      ] },
      { type: 'p', text: 'A password manager only works if you use it. Pick one, put your real logins in it, and stop repeating the same password.' },
    ],
  },
  {
    slug: 'microsoft-365-outage-november-2026',
    title: 'What the Microsoft 365 Outage Actually Broke, and What to Do Now',
    section: 'news',
    category: 'News',
    placeholder: false,
    thumb: 'msOutage',
    caption: 'Illustration / OFFLINE THEORY',
    incident: {
      eyebrow: 'The incident',
      status: 'Resolved',
      title: 'Microsoft 365',
      subtitle: 'Global service disruption',
      facts: [
        { label: 'Began', value: 'November 12, 2026' },
        { label: 'Restoration', value: 'November 14, 2026' },
        { label: 'Scope', value: 'Worldwide' },
        { label: 'Classification', value: 'Technical outage' },
      ],
      services: ['Outlook', 'Microsoft Teams', 'Exchange Online', 'SharePoint', 'Copilot'],
      note: 'Based on published incident reporting. Not every service was necessarily affected for every customer.',
    },
    timeline: [
      { date: 'November 12', title: 'Disruption begins', text: 'Users begin reporting widespread problems accessing Outlook and Microsoft 365 services.' },
      { date: 'November 13', title: 'Recovery efforts', text: 'Microsoft implements mitigation measures, works through infrastructure issues, and monitors delayed email delivery.' },
      { date: 'November 14', title: 'Services restored', text: 'Microsoft reports full restoration following a prolonged global disruption.' },
    ],
    author: 'Jamiah McQuiller',
    date: '2026-11-14',
    readTime: 6,
    dek: 'Outlook, Teams and Copilot went dark for more than a day across dozens of countries. Microsoft says it was a botched network change, not an attack. Here is what is confirmed, what is not, and what to check before Monday.',
    tags: ['microsoft', 'outage', 'outlook', 'microsoft 365', 'phishing', 'resilience', 'incident'],
    body: [
      { type: 'p', text: 'On Thursday afternoon, people across the Americas found they could not open their Outlook mailboxes. Within hours the problem had spread around the world. By the time Microsoft said it was finished early Saturday morning, the outage had run for well over 24 hours and reached governments, courts, hospitals, airlines, banks and anyone whose day runs through Microsoft 365.' },
      { type: 'p', text: 'This was not a breach. Microsoft says no attacker was involved, and nothing reported so far suggests otherwise. It is still a security story, because outages are when people take shortcuts, and when scammers go looking for them.' },
      { type: 'h2', text: 'What happened' },
      { type: 'p', text: 'Network testing company Ookla puts the start at about 12:25 p.m. Eastern on Thursday, Nov. 12. Microsoft first acknowledged reports at 12:54 p.m. that users in the Americas could not reach Exchange Online mailboxes, and within about 15 minutes warned that Microsoft 365 connectivity could be affected globally.' },
      { type: 'p', text: 'Microsoft\u2019s early updates said a number of servers had become \u201cunexpectedly unavailable,\u201d failing automated health checks and pushing extra load onto the rest of its infrastructure. Around 4 p.m. Eastern it said it had validated an alternative health-check method that brought some servers back. That evening it warned that servers returned to service could become unresponsive again once traffic hit them.' },
      { type: 'p', text: 'Recovery came region by region on Friday, with Asia Pacific among the first to stabilize. Around 10:30 a.m. Eastern, Microsoft reported \u201cencouraging recovery progress.\u201d At about 1 a.m. Eastern on Saturday, Nov. 14, it posted on X that it had restored service to the remaining affected customers and regions.' },
      { type: 'h2', text: 'Who was affected' },
      { type: 'list', items: [
        'Services: Outlook and Exchange Online email and calendars, Teams, SharePoint and the Copilot assistant, plus outside services that connect to Microsoft 365. OpenAI said some of its tools that connect to Microsoft services were affected too.',
        'Reach: users in more than 70 countries and territories reported problems, according to Downdetector. DW reports Downdetector logged more than 7.4 million problem reports worldwide.',
        'Organisations: the UK\u2019s NHS, courts in the UK and US, government offices in Japan, Singapore and the US, hospitals and rail passengers in Canada, and businesses that had to delay earnings releases.',
        'Email after recovery: Microsoft extended its delivery timeout to 48 hours to keep delayed messages from bouncing. That means some mail arrived hours late, and out of order.',
      ] },
      { type: 'h2', text: 'What Microsoft says caused it' },
      { type: 'quote', text: '\u201cThis was a technical issue not related to cyber or AI/agents. The incident was introduced by an issue during an earlier network capacity upgrade that surfaced following a recent network change.\u201d \u2014 Microsoft statement, Nov. 13' },
      { type: 'p', text: 'Microsoft has also said it is \u201cnot aware of any malicious activity\u201d behind the incident, and apologised, saying it is \u201cdeeply sorry for the disruption.\u201d It has promised a full post-incident report once its review is complete.' },
      { type: 'h2', text: 'What we still don\u2019t know' },
      { type: 'list', items: [
        'The exact root cause. \u201cAn issue during an earlier network capacity upgrade\u201d is a summary, not an explanation. The post-incident report has not been published yet.',
        'Why recovery took so long, and why restored servers kept falling over again on Thursday night.',
        'How many people and organisations were actually affected. Downdetector counts reports, not users.',
        'Whether any email was lost, rather than delayed, and whether business customers will be offered service credits.',
      ] },
      { type: 'h2', text: 'What to do now' },
      { type: 'list', items: [
        'Treat outage-themed email with suspicion. A security expert warned the BBC during the outage that fake support messages about it could be used to \u201cextract passwords from people and install malware.\u201d Do not sign in through a link in any email or text about the outage. Type the address yourself, or open the app you already use.',
        'Check your status page, not your inbox. Microsoft posts consumer and business updates at status.cloud.microsoft, and admins can see incident details in the Microsoft 365 admin center under Service health.',
        'Chase anything time-sensitive you sent on Thursday or Friday. Invoices, contracts and calendar invites may have arrived late or not at all. Confirm with the other person.',
        'Look for Friday\u2019s mail among Saturday\u2019s. Delayed messages are stamped when they arrived, so sort by sender or search for what you were expecting.',
        'Clean up after any workarounds. If you moved work to a personal email account, a messaging app or a USB stick to get through the day, move it back and delete the copies.',
        'Keep an offline copy of what you cannot work without. Contact numbers, the next week\u2019s calendar and key documents saved locally or on paper turn an outage into an annoyance instead of a lost day.',
        'If you run a small business, write down a plan B for email now: who you call, which backup channel you use, and how you tell customers. Then test it once.',
      ] },
      { type: 'p', text: 'The lesson is the same one every big outage teaches. When one provider sits underneath everything, its bad day becomes everyone\u2019s bad day. You cannot fix Microsoft\u2019s network. You can decide in advance what you will do the next time it goes quiet.' },
      { type: 'h2', text: 'Sources' },
      { type: 'list', items: [
        [{ href: 'https://apnews.com/article/microsoft-outage-outlook-email-365-recover-ca395c0f1e51af784b6d70afb6554f6a', text: 'AP: Microsoft says services fully restored after hourslong global outage' }],
        [{ href: 'https://www.cnbc.com/2026/11/12/microsoft-outage-outlook-aws-google.html', text: 'CNBC: Microsoft apologizes for massive outage that took down Outlook and other 365 services' }],
        [{ href: 'https://www.bbc.com/news/live/cq5y10ge3dp3t', text: 'BBC News live: Microsoft says it is \u2018deeply sorry\u2019 for global outage, including a timeline of Microsoft\u2019s updates' }],
        [{ href: 'https://www.bbc.co.uk/news/articles/c5gm3g9ldz8xo', text: 'BBC News: Global Microsoft outage affecting tens of thousands of users' }],
        [{ href: 'https://www.dw.com/en/microsoft-says-all-services-working-again/a-79946887', text: 'DW: Microsoft says all services working again' }],
        [{ href: 'https://www.theverge.com/tech/1033864/microsoft-has-finished-restoring-service-after-its-massive-outlook-outage', text: 'The Verge: Microsoft has finished restoring service after its massive Outlook outage' }],
        [{ href: 'https://status.cloud.microsoft/', text: 'Microsoft 365 Service Status' }],
      ] },
    ],
  },
  // ── Section depth ───────────────────────────────────────────────────
  {
    slug: 'ransomware-groups-shift-to-data-extortion',
      placeholder: false,
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
      placeholder: false,
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
      placeholder: false,
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
      placeholder: false,
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
      placeholder: false,
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
      placeholder: false,
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
      placeholder: false,
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
      placeholder: false,
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

// Downloadable guides. Free sample templates ship as PDFs in public/downloads/;
// the four paid guides are sold via Gumroad (buyUrl); prices live on the listings.
export const PRODUCTS = [
  { slug: 'sample-vulnerability-remediation-report', title: 'Vulnerability Remediation Report (Sample)', format: 'PDF · 5 pages', price: 'Free download', status: 'Free sample', file: '/downloads/Sample_Vulnerability_Remediation_Report.pdf' },
  { slug: 'sample-hipaa-access-control-policy', title: 'HIPAA Access Control Policy (Sample)', format: 'PDF · 5 pages', price: 'Free download', status: 'Free sample', file: '/downloads/Sample_HIPAA_Access_Control_Policy.pdf' },
  { slug: 'sample-patch-management-sop', title: 'Vulnerability & Patch Management SOP (Sample)', format: 'PDF · 5 pages', price: 'Free download', status: 'Free sample', file: '/downloads/Sample_Patch_Management_SOP.pdf' },
  { slug: 'sample-soc2-evidence-tracker', title: 'SOC 2 Evidence Tracker Template (Sample)', format: 'PDF · 5 pages', price: 'Free download', status: 'Free sample', file: '/downloads/Sample_SOC2_Evidence_Tracker_Template.pdf' },
  { slug: 'personal-security-field-guide', title: 'The Personal Security Field Guide', format: 'PDF · 62 pages', price: '$24', status: 'Available', buyUrl: 'https://theoryjournal.gumroad.com/l/dxjbt' },
  { slug: 'small-office-hardening-checklist', title: 'Small Office Hardening Checklist', format: 'PDF + spreadsheet', price: '$12', status: 'Available', buyUrl: 'https://theoryjournal.gumroad.com/l/brlwtu' },
  { slug: 'offline-theory-print-001', title: 'Offline Theory, Print Edition VOL. 001', format: 'PDF · 37 pages — digital download', price: '$29', status: 'Available', buyUrl: 'https://theoryjournal.gumroad.com/l/wdxmxq' },
  { slug: 'bundle-field-guide-checklist', title: 'Bundle: Field Guide + Hardening Checklist', format: 'PDFs + spreadsheet', price: '$29', status: 'Available', buyUrl: 'https://theoryjournal.gumroad.com/l/lkusx' },
]

export const getArticle = (slug) => ARTICLES.find((a) => a.slug === slug)
export const journalIssues = () => ARTICLES.filter((a) => a.journal)
// Homepage "Latest": the newest articles by date. On the same date, the one
// added later to ARTICLES comes first, so new pieces always take slot 1.
export const LATEST_COUNT = 3
export const latestArticles = (count = LATEST_COUNT) =>
  ARTICLES.map((a, i) => ({ a, i }))
    .sort((x, y) => y.a.date.localeCompare(x.a.date) || y.i - x.i)
    .slice(0, count)
    .map(({ a }) => a)
export const articlesInSection = (section) =>
  ARTICLES.filter((a) => a.section === section).sort((a, b) => b.date.localeCompare(a.date))

function collectText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(collectText).join(' ')
  if (value.text) return value.text
  return ''
}

export function articleText(a) {
  return [
    a.title, a.dek, a.section, a.category, a.author, a.volume, ...(a.tags || []),
    ...(a.body || []).flatMap((b) => [
      collectText(b.text),
      collectText(b.items),
      collectText(b.headers),
      collectText(b.rows),
      collectText(b.caption),
    ]),
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
