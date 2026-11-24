import { useMeta } from '../hooks/useMeta.js'
import PdfFlipbook from '../components/PdfFlipbook.jsx'
import './AboutPage.css'

export default function AboutPage() {
  useMeta({
    title: 'About',
    description: 'The mission, principles and editor of Offline Theory, an independent publication on cybersecurity, technology and internet culture.',
  })
  return (
    <div className="about">
      <PdfFlipbook />
    </div>
  )
}
