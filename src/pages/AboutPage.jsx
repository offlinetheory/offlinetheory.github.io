import PageHeader from '../components/PageHeader.jsx'
import Newsletter from '../components/Newsletter.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './AboutPage.css'

const PRINCIPLES = [
  ['Plain language', 'Security writing should be readable by the people it affects. We define our terms and skip the fear.'],
  ['Independence', 'We do not publish vendor-written copy. When an article includes affiliate links, we say so next to those links. Recommendations are made on the merits, not the commission.'],
  ['Verification', 'Claims about vulnerabilities and incidents are sourced to advisories, researchers or primary documents.'],
  ['Restraint', 'We publish less, on purpose. A weekly dispatch, a quarterly journal, and nothing that exists only to fill a feed.'],
]

export default function AboutPage() {
  useMeta({ title: 'About', description: 'The mission, principles and editor of Offline Theory, an independent publication on cybersecurity, technology and internet culture.' })
  return (
    <div className="about">
      <PageHeader kicker="About / Est. 2026" title="About" />
      <div className="about__grid">
        <section className="about__mission" aria-labelledby="mission-h">
          <h2 id="mission-h" className="label col-label">Mission</h2>
          <p className="about__lead">
            Offline Theory is an independent publishing initiative exploring cybersecurity, technology, and the culture of the internet.
          </p>
          <p>
            We started from a simple observation: the systems that shape everyday life are discussed either in jargon or in panic. Offline Theory
            sits in between. We write about security the way a good magazine writes about architecture, with attention to how things are built,
            who they serve, and what they cost.
          </p>
          <p>
            The name is a reminder, not a rule. Stepping away from the network, even briefly, is often the clearest way to understand it.
          </p>
        </section>
        <section aria-labelledby="principles-h">
          <h2 id="principles-h" className="label col-label">Editorial principles</h2>
          <dl className="about__principles">
            {PRINCIPLES.map(([t, d], i) => (
              <div key={t}>
                <dt><span className="meta">{String(i + 1).padStart(2, '0')}</span> <span className="serif-head">{t}</span></dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="masthead-h">
          <h2 id="masthead-h" className="label col-label">Masthead</h2>
          <dl className="about__staff">
            <div>
              <dt className="meta">Founder & Editor</dt>
              <dd className="serif-head">Jamiah McQuiller</dd>
            </div>
          </dl>
          <p className="about__contact">
            Jamiah is a Security+ certified IT End User Computing Technician (vulnerability and patch management) and an M.S. Cybersecurity student at the University of Michigan - Flint. She is based in Flint, Michigan.
          </p>
          <h2 className="label col-label about__contact-h">Contact</h2>
          <p className="about__contact">
            Tips, corrections and letters:{' '}
            <a href="mailto:offlinetheory@proton.me">offlinetheory@proton.me</a>,{' '}
            <a href="https://www.linkedin.com/in/jamiahmcquiller" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            {' '}or{' '}
            <a href="https://jamiahmcquiller.github.io" target="_blank" rel="noopener noreferrer">jamiahmcquiller.github.io</a>.
          </p>
          <p className="about__contact">
            For sensitive tips, we recommend an end-to-end encrypted channel. A secure-drop address will be published here once it exists.
          </p>
          <p className="about__contact">
            OFFLINE THEORY may earn a commission if you buy through links we mark as sponsored. That does not change our recommendations.
          </p>
        </section>
      </div>
      <div className="section-page__newsletter"><Newsletter compact /></div>
    </div>
  )
}
