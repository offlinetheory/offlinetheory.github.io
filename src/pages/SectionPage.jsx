import { getSection } from '../data/sections.js'
import { articlesInSection, PRODUCTS } from '../data/articles.js'
import PageHeader from '../components/PageHeader.jsx'
import ArticleRow from '../components/ArticleRow.jsx'
import Newsletter from '../components/Newsletter.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './SectionPage.css'

const TOOLKIT = [
  { name: 'KeePassXC', use: 'Password manager', license: 'GPL-3.0', verdict: 'Recommended' },
  { name: 'age', use: 'File encryption', license: 'BSD-3', verdict: 'Recommended' },
  { name: 'Wireshark', use: 'Network analysis', license: 'GPL-2.0', verdict: 'Recommended' },
  { name: 'restic', use: 'Encrypted backups', license: 'BSD-2', verdict: 'Recommended' },
  { name: 'Nmap', use: 'Network discovery', license: 'NPSL', verdict: 'For your own networks' },
]

export default function SectionPage({ slug }) {
  const section = getSection(slug)
  const items = articlesInSection(slug)
  useMeta({ title: section.title, description: section.description })

  return (
    <div className={`section-page section-page--${slug}`}>
      <PageHeader kicker={`${section.kicker} / ${items.length} stories`} title={section.title} description={section.description} />

      <div className="section-page__layout">
        <div className="section-page__list">
          {items.map((a, i) => <ArticleRow key={a.slug} article={a} index={i + 1} headingLevel={2} />)}
        </div>

        <aside className="section-page__aside" aria-label={`${section.name} extras`}>
          {slug === 'tools' && (
            <section>
              <h2 className="label col-label">The working toolkit</h2>
              <table className="toolkit">
                <thead><tr><th scope="col">Tool</th><th scope="col">Use</th><th scope="col">License</th></tr></thead>
                <tbody>
                  {TOOLKIT.map((t) => (
                    <tr key={t.name}><th scope="row">{t.name}</th><td>{t.use}</td><td className="mono">{t.license}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="aside-note">Editorial picks. We take no affiliate fees.</p>
            </section>
          )}
          {slug === 'guides' && (
            <section>
              <h2 className="label col-label">Downloads</h2>
              <p className="placeholder-flag">Placeholder products: not yet available for purchase or download.</p>
              <ul className="products">
                {PRODUCTS.map((p) => (
                  <li key={p.slug}>
                    <span className="meta">{p.format}</span>
                    <h3 className="serif-head">{p.title}</h3>
                    <span className="meta products__status">{p.status} / {p.price}</span>
                    <button type="button" className="btn btn--ghost" disabled aria-disabled="true">Coming soon</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(slug === 'news' || slug === 'analysis') && (
            <section>
              <h2 className="label col-label">Editor&rsquo;s note</h2>
              <p className="aside-quote">
                {slug === 'news'
                  ? '\u201cWe report what changed, who it affects, and what to do. Nothing more.\u201d'
                  : '\u201cSlow reading for fast systems. Every essay starts from a question, not a headline.\u201d'}
              </p>
            </section>
          )}
        </aside>
      </div>

      <div className="section-page__newsletter"><Newsletter compact /></div>
    </div>
  )
}
