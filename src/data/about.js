import portraitSrc from '../assets/about/portrait.webp'
import opening800 from '../assets/about/opening-800.webp'
import opening1200 from '../assets/about/opening-1200.webp'
import opening1904 from '../assets/about/opening-1904.webp'
import hands800 from '../assets/about/hands-800.webp'
import hands1200 from '../assets/about/hands-1200.webp'
import hands1904 from '../assets/about/hands-1904.webp'
import openingRight from '../assets/about/pages/opening-right.webp'
import page1 from '../assets/about/pages/page-1.webp'
import page2 from '../assets/about/pages/page-2.webp'
import page3 from '../assets/about/pages/page-3.webp'
import page4 from '../assets/about/pages/page-4.webp'

// To use a new headshot, replace src/assets/about/portrait.webp
// (or point `src` at another imported file) and update `alt` if needed.
// The image is placed with object-fit: cover in the left-page well
// and blended into the cream paper at display time.
export const ABOUT_PORTRAIT = {
  src: portraitSrc,
  alt: 'Jamiah McQuiller, founder and editor of Offline Theory',
}

export const ABOUT_MAGAZINE_ASSETS = {
  opening: { 800: opening800, 1200: opening1200, 1904: opening1904 },
  hands: { 800: hands800, 1200: hands1200, 1904: hands1904 },
  pages: {
    'opening-right': openingRight,
    'page-1': page1,
    'page-2': page2,
    'page-3': page3,
    'page-4': page4,
  },
}

// Fractions of the opening photograph (1505 × 1045).
export const MAGAZINE_LAYOUT = {
  photoWidth: 1904,
  photoHeight: 1328,
  aspect: 1904 / 1328,
  spineX: 975 / 1904,
  right: {
    left: 975 / 1904,
    top: 243 / 1328,
    width: (1470 - 975) / 1904,
    height: (1069 - 243) / 1328,
  },
  left: {
    left: 450 / 1904,
    top: 243 / 1328,
    width: (975 - 450) / 1904,
    height: (1069 - 243) / 1328,
  },
  portrait: {
    left: 480 / 1904,
    top: 283 / 1328,
    width: (960 - 480) / 1904,
    height: (1033 - 283) / 1328,
  },
}

export const ABOUT_COPY = {
  kicker: 'About / Est. 2026',
  leftTitle: 'Offline Theory',
  leftDek: 'Offline Theory is an independent publishing initiative exploring cybersecurity, technology, and the culture of the internet.',
  leftP1: 'We started from a simple observation: the systems that shape everyday life are discussed either in jargon or in panic. Offline Theory sits in between. We write about security the way a good magazine writes about architecture, with attention to how things are built, who they serve, and what they cost.',
  leftP2: 'The name is a reminder, not a rule. Stepping away from the network, even briefly, is often the clearest way to understand it.',
  principlesTitle: 'Editorial principles',
  principles: [
    ['Plain language', 'Security writing should be readable by the people it affects. We define our terms and skip the fear.'],
    ['Independence', 'We do not publish vendor-written copy. When an article includes affiliate links, we say so next to those links. Recommendations are made on the merits, not the commission.'],
    ['Verification', 'Claims about vulnerabilities and incidents are sourced to advisories, researchers or primary documents.'],
    ['Restraint', 'We publish less, on purpose. A weekly dispatch, a quarterly journal, and nothing that exists only to fill a feed.'],
  ],
  mastheadLabel: 'Masthead',
  roleLabel: 'Founder & Editor',
  editorName: 'Jamiah McQuiller',
  bio: 'Jamiah is a Security+ certified IT End User Computing Technician (vulnerability and patch management) and an M.S. Cybersecurity student at the University of Michigan – Flint. She is based in Flint, Michigan.',
  contactLabel: 'Contact',
  contactLead: 'Tips, corrections and letters:',
  email: 'offlinetheory@proton.me',
  secureDrop: 'For sensitive tips, we recommend an end-to-end encrypted channel. A secure-drop address will be published here once it exists.',
  affiliate: 'OFFLINE THEORY may earn a commission if you buy through links we mark as sponsored. That does not change our recommendations.',
}

// Spreads inside the physical magazine.
// 0: portrait | opening ABOUT page
// 1: introduction (page 1) | editorial principles (page 2)
// 2: masthead & bio (page 3) | contact & disclosure (page 4)
export const ABOUT_SPREADS = [
  { id: 'opening', left: null, right: 'opening-right' },
  { id: 'intro', left: 'page-1', right: 'page-2' },
  { id: 'masthead', left: 'page-3', right: 'page-4' },
]

export const ABOUT_TIMING = {
  turnMs: 5200,
  snapMs: 900,
  peekDelayMs: 1400,
  peekMs: 1600,
  peekAmount: 0.07,
}
