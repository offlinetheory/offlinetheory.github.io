import AboutMagazine from '../components/AboutMagazine.jsx'
import { useMeta } from '../hooks/useMeta.js'

export default function AboutPage() {
  useMeta({
    title: 'About',
    description: 'The mission, principles and editor of Offline Theory, an independent publication on cybersecurity, technology and internet culture.',
  })
  return (
    <div className="about">
      <AboutMagazine />
    </div>
  )
}
