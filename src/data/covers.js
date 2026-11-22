// Share-image metadata for articles that have a unique cover (not a reused list thumb).
// filePrefix is the un-hashed Vite asset basename, used at build time to find the
// emitted file in dist/assets for Open Graph / Twitter / JSON-LD tags.

export const SEO_COVERS = {
  msOutage: {
    filePrefix: 'cover-microsoft-outage-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Cover collage with the headline “What the Microsoft 365 Outage Actually Broke, and What to Do Now,” a “News / Outages / Productivity” label, a laptop showing a Microsoft 365 service-outage screen, floating Outlook, Teams and cloud app icons, a Microsoft office building, a rust-orange sun in the clouds, and a checklist reading “What broke / Impact / What to do now,” with the last item checked.',
  },
  jonathanJames: {
    filePrefix: 'cover-jonathan-james-1448',
    width: 1448,
    height: 1086,
    type: 'image/webp',
    alt: 'Cover collage: a black-and-white photo of Jonathan James in front of a red sun, with the headline \u201cJonathan James\u201d and his handle \u201cc0mrade\u201d, the NASA Marshall Space Flight Center building, the International Space Station above Earth, a Defense Threat Reduction Agency seal, a beige 1990s computer, and labels reading \u201c1999, age 15\u201d, \u201c13 NASA computers\u201d and \u201cSix-month detention sentence \u00b7 2000\u201d.',
  },
  vendorBreach: {
    filePrefix: 'cover-vendor-breach-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Cover collage with the headline “Chase, Visa and Mastercard Data Leaked Through Their Vendors,” a “News / Security / Data Breach” label, branded Chase, Visa and Mastercard payment cards, a “Vendor Breach” warning with a barcode, a torn card form with blank name and card-number fields, and a hooded figure behind a laptop showing a padlock on a red screen, with a globe and a building in the background.',
  },
  fbiNcic: {
    filePrefix: 'cover-fbi-ncic-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Cover collage with a masthead reading “NEWS / SECURITY / LAW ENFORCEMENT,” the headline “The FBI Is Investigating a Reported Breach of Its National Crime Database,” a rust-red torn-paper banner behind the words National Crime Database, a vintage CRT monitor showing a fingerprint file and an “UNAUTHORIZED ACCESS” warning, a Department of Justice Federal Bureau of Investigation seal, a government office building under a rust-red sun with a silhouetted figure, and a torn contact sheet of mugshot-style portraits and a fingerprint.',
  },
  bleuprint: {
    filePrefix: 'cover-bleuprint-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Cover collage with the headline “BLEUPRINT: The Metro Detroit Tool for Getting Found and Chosen,” a halftone portrait of a smiling woman with long dark hair and a dark sleeveless top, a laptop showing the Bleuprint site with the line “Be the one customers choose,” a Michigan map, the Detroit skyline, a “Made in Metro Detroit” badge, and a checklist reading “Get found / Get booked / Get paid.”',
  },
  guidePhishing: {
    filePrefix: 'cover-guide-phishing-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Cover collage with the headline \u201cPhishing: The Hook That Steals Your Data,\u201d a fishing hook piercing an \u201cAccount Login\u201d form with email and password fields and a Log In button, a hooded figure at a laptop beside a warning triangle, an envelope on a browser window, and a checklist titled \u201cLook for the signs\u201d: urgent requests, unexpected links, login page lookalikes, suspicious senders, and requests for sensitive information.',
  },
  guideSocialEngineering: {
    filePrefix: 'cover-guide-social-engineering-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Cover collage with the label \u201cSecurity / Human Risk / Awareness\u201d and the headline \u201cSocial Engineering: How Attackers Manipulate People, Not Systems,\u201d a halftone portrait of a woman with a rust-orange strip across her eyes, a fishing hook holding an envelope, a laptop showing a sign-in form, silhouetted figures walking, and a checklist reading phishing, pretexting, baiting, vishing and tailgating.',
  },
  guideRansomware: {
    filePrefix: 'cover-guide-ransomware-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Cover collage with the headline \u201cRansomware: How It Locks Your Data, Disrupts Operations, and Extorts a Payout,\u201d a rust-red padlock on an opened hard drive, a torn note reading \u201cYour data has been encrypted. Pay in 72 hours or lose access,\u201d office buildings, and a row of old computer monitors, one showing a warning triangle.',
  },
}

export function getSeoCover(thumbKey) {
  return (thumbKey && SEO_COVERS[thumbKey]) || null
}
