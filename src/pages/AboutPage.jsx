import { useMeta } from '../hooks/useMeta.js'
import './AboutPage.css'

export default function AboutPage() {
  useMeta({
    title: 'About',
    description: 'The mission, principles and editor of Offline Theory, an independent publication on cybersecurity, technology and internet culture.',
  })
  return (
    <div className="about">
      <iframe
        className="heyzine-embed"
        allowFullScreen
        allow="autoplay; fullscreen; clipboard-write"
        scrolling="no"
        src="https://heyzine.com/flip-book/fdeff5e42f.html"
        title="Offline Theory — About magazine"
      />
    </div>
  )
}
