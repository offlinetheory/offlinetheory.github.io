import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchArticles } from '../data/articles.js'
import { getSection } from '../data/sections.js'
import { CloseIcon, Arrow } from './Icons.jsx'
import './SearchDialog.css'

export default function SearchDialog({ open, onClose }) {
  const ref = useRef(null)
  const inputRef = useRef(null)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const results = useMemo(() => searchArticles(q).slice(0, 6), [q])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { d.showModal(); setTimeout(() => inputRef.current?.focus(), 0) }
    if (!open && d.open) d.close()
  }, [open])

  const submit = (e) => {
    e.preventDefault()
    if (!q.trim()) return
    navigate(`/search?q=${encodeURIComponent(q.trim())}`)
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className="search-dialog"
      aria-label="Search Offline Theory"
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <div className="search-dialog__inner">
        <div className="search-dialog__top">
          <p className="label">Search the journal</p>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close search"><CloseIcon /></button>
        </div>
        <form role="search" onSubmit={submit} className="search-dialog__form">
          <label htmlFor="site-search" className="sr-only">Search articles</label>
          <input
            ref={inputRef}
            id="site-search"
            type="search"
            placeholder="Zero-day, privacy, passkeys…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <button className="btn" type="submit">Search</button>
        </form>
        {q.trim() && (
          <div className="search-dialog__results" aria-live="polite">
            <p className="meta">{results.length ? `${results.length} result${results.length > 1 ? 's' : ''}` : 'No results'}</p>
            <ul>
              {results.map((a) => (
                <li key={a.slug}>
                  <Link to={`/article/${a.slug}`} onClick={onClose}>
                    <span className="meta">{a.volume || getSection(a.section)?.name} / {a.readTime} min read</span>
                    <span className="search-dialog__title serif-head">{a.title}</span>
                    <Arrow />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </dialog>
  )
}
