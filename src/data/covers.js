// Share-image metadata for articles that have a unique cover (not a reused list thumb).
// filePrefix is the un-hashed Vite asset basename, used at build time to find the
// emitted file in dist/assets for Open Graph / Twitter / JSON-LD tags.

export const SEO_COVERS = {
  msOutage: {
    filePrefix: 'cover-microsoft-outage-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Collage illustration: a vintage telephone switchboard with unplugged cords hanging from its jacks, a black rotary phone with the receiver off the hook in front of a stack of blank envelopes, and a clock with no numerals overlapping a rust-orange circle, with a cobalt circle and a rust bar on cream paper.',
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
    alt: 'Collage illustration: a large halftone fingerprint on torn paper beside a long row of black filing cabinets receding into the distance, with a cut-out police radio microphone in front, rust-colored redaction bars, and cobalt and rust circles on cream paper.',
  },
  bleuprint: {
    filePrefix: 'cover-bleuprint-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Cover collage with the headline “BLEUPRINT: The Metro Detroit Tool for Getting Found and Chosen,” a halftone portrait of a smiling woman with long dark hair and a dark sleeveless top, a laptop showing the Bleuprint site with the line “Be the one customers choose,” a Michigan map, the Detroit skyline, a “Made in Metro Detroit” badge, and a checklist reading “Get found / Get booked / Get paid.”',
  },
}

export function getSeoCover(thumbKey) {
  return (thumbKey && SEO_COVERS[thumbKey]) || null
}
