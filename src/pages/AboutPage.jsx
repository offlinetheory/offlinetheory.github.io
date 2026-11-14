import PageHeader from '../components/PageHeader.jsx'
import Newsletter from '../components/Newsletter.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './AboutPage.css'

const PRINCIPLES = [
  ['Plain language', 'Security writing should be readable by the people it affects. We define our terms and skip the fear.'],
  ['Independence', 'No sponsored articles, no affiliate links, no vendor-written copy. Reviews are paid for by readers.'],
  ['Verification', 'Claims about vulnerabilities and incidents are sourced to advisories, researchers or primary documents.'],
  ['Restraint', 'We publish less, on purpose. A weekly dispatch, a quarterly journal, and nothing that exists only to fill a feed.'],
]

const MASTHEAD = [
  ['Editor', 'Mara Ellison'],
  ['Security Editor', 'Theo Barrow'],
  ['Privacy & Policy', 'Ines Okafor'],
  ['Art Direction', 'Offline Theory Studio'],
]

export default function AboutPage() {
  useMeta({ title: 'About', description: 'The mission, principles and masthead of Offline Theory, an independent publication on cybersecurity, technology and internet culture.' })
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
            {MASTHEAD.map(([r, n]) => <div key={r}><dt className="meta">{r}</dt><dd className="serif-head">{n}</dd></div>)}
          </dl>
          <h2 className="label col-label about__contact-h">Contact</h2>
          <p className="about__contact">
            Tips, corrections and letters: <span className="mono">editors@offlinetheory.example</span>
            <br /><span className="aside-note">Placeholder address. Replace before launch.</span>
          </p>
          <p className="about__contact">
            For sensitive tips, we recommend an end-to-end encrypted channel. A secure-drop address will be published here once it exists.
          </p>
        </section>
      </div>
      <div className="section-page__newsletter"><Newsletter compact /></div>
    </div>
  )
}
