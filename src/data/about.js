import portraitSrc from '../assets/about/portrait.webp'
import opening800 from '../assets/about/opening-800.webp'
import opening1200 from '../assets/about/opening-1200.webp'
import opening1505 from '../assets/about/opening-1505.webp'
import hands800 from '../assets/about/hands-800.webp'
import hands1200 from '../assets/about/hands-1200.webp'
import hands1505 from '../assets/about/hands-1505.webp'
import leafMask from '../assets/about/leaf-mask.png'

// To use a new headshot, replace src/assets/about/portrait.webp
// (or point `src` at another imported file) and update `alt` if needed.
// The image is placed with object-fit: cover in the left-page well.
export const ABOUT_PORTRAIT = {
  src: portraitSrc,
  alt: 'Jamiah McQuiller, founder and editor of Offline Theory',
}

export const ABOUT_MAGAZINE_ASSETS = {
  opening: { 800: opening800, 1200: opening1200, 1505: opening1505 },
  hands: { 800: hands800, 1200: hands1200, 1505: hands1505 },
  leafMask,
}

// Fractions of the opening photograph (1505 × 1045).
export const MAGAZINE_LAYOUT = {
  photoWidth: 1505,
  photoHeight: 1045,
  aspect: 1505 / 1045,
  leaf: {
    left: 775 / 1505,
    top: 200 / 1045,
    width: (1168 - 775) / 1505,
    height: (849 - 200) / 1045,
  },
  portrait: {
    left: 382 / 1505,
    top: 229 / 1045,
    width: (763 - 382) / 1505,
    height: (821 - 229) / 1045,
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

export const ABOUT_TIMING = {
  pauseMs: 1500,
  turnMs: 1300,
  holdMs: 700,
  revealMs: 500,
}
