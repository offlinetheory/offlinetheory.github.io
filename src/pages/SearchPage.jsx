import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { searchArticles } from '../data/articles.js'
import PageHeader from '../components/PageHeader.jsx'
import ArticleRow from '../components/ArticleRow.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './SearchPage.css'

const SUGGESTIONS = ['zero-day', 'privacy', 'passkeys', 'patching', 'surveillance', 'open source']

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const [draft, setDraft] = useState(q)
  useEffect(() => setDraft(q), [q])
  const results = useMemo(() => searchArticles(q), [q])
  useMeta({ title: q ? `Search: ${q}` : 'Search', description: 'Search every article in Offline Theory.' })

  const submit = (e) => { e.preventDefault(); setParams(draft.trim() ? { q: draft.trim() } : {}) }

  return (
    <div className="search-page">
      <PageHeader kicker="Index" title="Search">
        <form role="search" className="search-page__form" onSubmit={submit}>
          <label htmlFor="search-page-q" className="sr-only">Search articles</label>
          <input id="search-page-q" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search the journal" />
          <button className="btn" type="submit">Search</button>
        </form>
        <p className="search-page__suggest meta">
          Try:{' '}
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setParams({ q: s })}>{s}</button>
          ))}
        </p>
      </PageHeader>
      <section aria-live="polite" className="search-page__results">
        {q && <p className="label search-page__count">{results.length} result{results.length === 1 ? '' : 's'} for &ldquo;{q}&rdquo;</p>}
        {results.map((a) => <ArticleRow key={a.slug} article={a} headingLevel={2} />)}
        {q && !results.length && <p className="search-page__empty">Nothing matched. Try a broader term.</p>}
      </section>
    </div>
  )
}
