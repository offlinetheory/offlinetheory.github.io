import Newsletter from '../components/Newsletter.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './AboutPage.css'

const PRINCIPLES = [
  ['Plain language', 'Security writing should be readable by the people it affects. We define our terms and skip the fear.'],
  ['Independence', 'We do not publish vendor-written copy. When an article includes affiliate links, we say so next to those links. Recommendations are made on the merits, not the commission.'],
  ['Verification', 'Claims about vulnerabilities and incidents are sourced to advisories, researchers or primary documents.'],
  ['Restraint', 'We publish less, on purpose. A weekly dispatch, a quarterly journal, and nothing that exists only to fill a feed.'],
]

const BANNER = ['O', 'F', 'F', 'L', 'I', 'N', 'E']

export default function AboutPage() {
  useMeta({ title: 'About', description: 'The mission, principles and editor of Offline Theory, an independent publication on cybersecurity, technology and internet culture.' })
  return (
    <div className="about">
      <header className="about__kicker">
        <h1 className="about__kicker-title label">About / Est. 2026</h1>
        <p className="label">Offline Theory</p>
      </header>

      <section className="about__manifesto" aria-labelledby="mission-h">
        <div className="about__monogram" aria-hidden="true">O</div>
        <div className="about__manifesto-copy">
          <h2 id="mission-h" className="label col-label">Mission</h2>
          <blockquote className="about__pull">
            The name is a reminder, not a rule. Stepping away from the network, even briefly, is often the clearest way to understand it.
          </blockquote>
        </div>
      </section>

      <div className="about__columns">
        <p>
          Offline Theory is an <strong>independent</strong> publishing initiative exploring cybersecurity, technology, and the culture of the internet.
        </p>
        <p>
          We started from a simple observation: the systems that shape everyday life are discussed either in <strong>jargon</strong> or in <strong>panic</strong>. Offline Theory sits in between. We write about security the way a good magazine writes about <strong>architecture</strong>, with attention to how things are built, who they serve, and what they cost.
        </p>
      </div>

      <p className="about__banner" aria-hidden="true">
        {BANNER.map((letter, i) => (
          <span key={`${letter}-${i}`}>{letter}</span>
        ))}
      </p>

      <section className="about__principles-wrap" aria-labelledby="principles-h">
        <h2 id="principles-h" className="label col-label">Editorial principles</h2>
        <dl className="about__principles">
          {PRINCIPLES.map(([t, d], i) => (
            <div key={t}>
              <dt>
                <span className="meta">{String(i + 1).padStart(2, '0')}</span>
                <span className="serif-head">{t}</span>
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="about__editor" aria-labelledby="masthead-h">
        <div className="about__initials" aria-hidden="true">
          <span>J</span>
          <span>M</span>
        </div>
        <div className="about__editor-copy">
          <h2 id="masthead-h" className="label col-label">Masthead</h2>
          <p className="meta">Founder &amp; Editor</p>
          <p className="about__editor-name serif-head">Jamiah McQuiller</p>
          <p className="about__bio">
            Jamiah is a Security+ certified IT End User Computing Technician (vulnerability and patch management) and an M.S. Cybersecurity student at the University of Michigan - Flint. <strong>She is based in Flint, Michigan.</strong>
          </p>
          <h3 className="label col-label about__contact-h">Contact</h3>
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
        </div>
      </section>

      <div className="section-page__newsletter"><Newsletter compact /></div>
    </div>
  )
}
