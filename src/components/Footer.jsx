import { Link } from 'react-router-dom'
import { NAV } from '../data/nav.js'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="site-footer">
      <nav aria-label="Footer">
        <ul>
          {NAV.map((n) => <li key={n.to}><Link to={n.to}>{n.label}</Link></li>)}
          <li><Link to="/search">Search</Link></li>
          <li><Link to="/privacy">Privacy</Link></li>
        </ul>
      </nav>
      <p>&copy; 2026 Offline Theory. An independent publication.</p>
    </footer>
  )
}
