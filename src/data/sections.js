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
    kicker: 'Awareness & Training',
    // The description stays in the page's search/share metadata but is not shown on the page.
    hideDescription: true,
    description: 'Plain-language guides to the attacks that target people, from phishing to ransomware, and the habits that stop them.',
  },
  {
    slug: 'awareness-training',
    name: 'Awareness & Training',
    title: 'Cybersecurity Awareness & Training',
    kicker: 'Security Briefs',
    description: 'Short investigative video briefs and training on the attacks that target people, starting with the Offline Theory Security Briefs series.',
  },
]

export const getSection = (slug) => SECTIONS.find((s) => s.slug === slug)
