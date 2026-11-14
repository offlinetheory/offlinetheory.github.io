import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import { useMeta } from '../hooks/useMeta.js'

export default function NotFound() {
  useMeta({ title: 'Page not found', description: 'This page is offline.' })
  return (
    <div style={{ paddingBottom: 64 }}>
      <PageHeader kicker="Error 404" title="Offline" description="This page has been unplugged, or never existed." />
      <p style={{ marginTop: 24 }}><Link className="btn" to="/">Back to the front page</Link></p>
    </div>
  )
}
