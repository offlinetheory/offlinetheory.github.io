import { Link } from 'react-router-dom'
import { homeNewsArticles, formatDate } from '../data/articles.js'
import { THUMBS } from '../data/images.js'
import { Arrow } from './Icons.jsx'
import './JournalList.css'

// Homepage left column ("The Digital Security Journal"): shows the latest News stories.
export default function JournalList() {
  const issues = homeNewsArticles()
  return (
    <section className="journal" aria-labelledby="journal-heading">
      <h2 id="journal-heading" className="label col-label">The Digital<br />Security Journal</h2>
      <ol className="journal__list">
        {issues.map((a) => {
          const t = THUMBS[a.thumb]
          return (
            <li key={a.slug}>
              <Link to={`/article/${a.slug}`} className="journal__item">
                <img
                  className="journal__thumb" src={t.src} srcSet={t.srcSet} sizes="80px"
                  width="80" height="62" alt={t.alt} loading="lazy" decoding="async"
                />
                <span className="journal__text">
                  <span className="meta">{a.volume || `${a.category} / ${formatDate(a.date)}`}</span>
                  <span className="journal__title serif-head">{a.title.replace(/-/g, '\u2011')}</span>
                </span>
                <Arrow className="journal__arrow" />
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
