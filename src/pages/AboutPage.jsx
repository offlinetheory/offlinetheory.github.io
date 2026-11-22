import Newsletter from '../components/Newsletter.jsx'
import AboutMagazine from '../components/AboutMagazine.jsx'
import { useMeta } from '../hooks/useMeta.js'
import { ABOUT_COPY } from '../data/about.js'
import './AboutPage.css'

export default function AboutPage() {
  useMeta({
    title: 'About',
    description: 'The mission, principles and editor of Offline Theory, an independent publication on cybersecurity, technology and internet culture.',
  })
  return (
    <div className="about">
      <header className="about__kicker">
        <h1 className="about__kicker-title label">{ABOUT_COPY.kicker}</h1>
        <p className="label">Offline Theory</p>
      </header>
      <AboutMagazine />
      <div className="section-page__newsletter"><Newsletter compact /></div>
    </div>
  )
}
