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
}

export function getSeoCover(thumbKey) {
  return (thumbKey && SEO_COVERS[thumbKey]) || null
}
