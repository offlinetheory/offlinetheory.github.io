// Share-image metadata for articles that have a unique cover (not a reused list thumb).
// filePrefix is the un-hashed Vite asset basename, used at build time to find the
// emitted file in dist/assets for Open Graph / Twitter / JSON-LD tags.

export const SEO_COVERS = {
  msOutage: {
    filePrefix: 'cover-microsoft-outage-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Illustration: a beige retro CRT computer on a desk shows a Microsoft \u201cWe\u2019re having trouble connecting right now\u201d screen with a loading spinner, a yellow sticky note on the monitor reads \u201cAgain?\u201d, and a big red sun sets behind the Detroit skyline across the river. A Michigan map is pinned to the wall, and books labeled Cybersecurity, Technology and Internet Culture sit beside a coffee mug, a potted plant and headphones.',
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
    alt: 'Illustration: a pale grey office filing cabinet with its top drawer pulled open and index cards standing inside, as a trail of white envelopes drifts out of it and away across a large red sun and a dark, generic city skyline. On the desk in front sit a plain dark payment card with a gold chip, an unlocked padlock and a white mug.',
  },
  fbiNcic: {
    filePrefix: 'cover-fbi-ncic-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'Illustration: a tall grey server cabinet stands on the horizon with thin lines running out to small, generic buildings on either side, one link drawn as a broken red dashed line, beneath a large red sun. A plain unmarked patrol car drives along the road below. On the desk in front, a boxy computer terminal shows rows of abstract bars with one row in red, beside a stack of index cards under a magnifying glass and a white mug.',
  },
  bleuprint: {
    filePrefix: 'cover-bleuprint-1536',
    width: 1536,
    height: 1024,
    type: 'image/webp',
    alt: 'A cream, editorial photograph of a phone on a paper background, showing the Bleuprint homepage. The screen has no status bar or browser bar. It reads “Be the one customers choose,” with a photo of founder Kalena Waters-Gardner smiling in front of blue and red sculptural flowers, badges for 500K+ views and “Found → Booked → Paid,” and a button that says “Book your free audit.”',
  },
}

export function getSeoCover(thumbKey) {
  return (thumbKey && SEO_COVERS[thumbKey]) || null
}
