export const SECTIONS = [
  {
    slug: 'news',
    name: 'News',
    title: 'News',
    kicker: 'Dispatches',
    description: 'Cybersecurity news and industry developments, reported plainly and without the panic.',
  },
  {
    slug: 'analysis',
    name: 'Analysis',
    title: 'Analysis',
    kicker: 'Long-form',
    description: 'Long-form articles, research, and security commentary on the systems we build and trust.',
  },
  {
    slug: 'tools',
    name: 'Tools',
    title: 'Tools',
    kicker: 'Field-tested',
    description: 'Cybersecurity tools, software reviews, and recommendations we actually use.',
  },
  {
    slug: 'guides',
    name: 'Guides',
    title: 'Guides',
    kicker: 'Practice',
    description: 'Tutorials and educational resources for everyday security.',
  },
]

export const getSection = (slug) => SECTIONS.find((s) => s.slug === slug)
