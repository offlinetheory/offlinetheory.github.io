import { Link } from 'react-router-dom'
import logoUrl from '../assets/images/logo.svg'
import './Logo.css'

/** The supplied OFFLINE THEORY wordmark (split OFFLINE, intact THEORY, cord and unplugged plug), vectorised. */
export default function Logo({ onClick }) {
  return (
    <Link to="/" className="logo" aria-label="Offline Theory, home" onClick={onClick}>
      <img src={logoUrl} alt="" width="2097" height="229" />
    </Link>
  )
}
