import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Logo from './Logo.jsx'
import SearchDialog from './SearchDialog.jsx'
import { SearchIcon, CloseIcon } from './Icons.jsx'
import { NAV } from '../data/nav.js'
import './Header.css'


export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setMenuOpen(false); setSearchOpen(false) }, [location.pathname, location.search])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName || '')) {
        e.preventDefault(); setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="site-header page">
      <div className="site-header__bar">
        {/* The homepage already shows the giant logo masthead below, so the
            small header logo is hidden there to keep the wordmark on screen once. */}
        {location.pathname !== '/' && <Logo />}
        <nav className={`site-nav ${menuOpen ? 'is-open' : ''}`} id="site-nav" aria-label="Primary">
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="site-header__actions">
          <button type="button" className="icon-btn search-btn" onClick={() => setSearchOpen(true)} aria-label="Search" aria-haspopup="dialog">
            <SearchIcon />
          </button>
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <CloseIcon /> : <span className="menu-btn__lines" aria-hidden="true" />}
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </div>
      <hr className="rule" />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}
