import { Link } from 'react-router-dom'
import { getSection } from '../data/sections.js'
import { formatDate } from '../data/articles.js'
import { THUMBS } from '../data/images.js'
import { Arrow } from './Icons.jsx'
import './ArticleRow.css'

/** Editorial list row used on section, search and related lists. */
export default function ArticleRow({ article: a, index, headingLevel = 3 }) {
  const H = `h${headingLevel}`
  const t = a.thumb && THUMBS[a.thumb]
  return (
    <article className={`article-row ${t ? 'has-thumb' : ''}`}>
      <Link to={`/article/${a.slug}`} className="article-row__link">
        {index != null && <span className="article-row__num meta">{String(index).padStart(2, '0')}</span>}
        <span className="article-row__body">
          <span className="meta">
            {a.volume ? `${a.volume} / ` : ''}{a.category || getSection(a.section)?.name} / {formatDate(a.date)}
          </span>
          <H className="article-row__title serif-head">{a.title}</H>
          <p className="article-row__dek">{a.dek}</p>
          <span className="meta article-row__read">{a.readTime} min read <Arrow /></span>
        </span>
        {t && <img className="article-row__thumb" style={t.objectPosition ? { objectPosition: t.objectPosition } : undefined} src={t.src} srcSet={t.srcSet} sizes="160px" width="160" height="128" alt="" loading="lazy" decoding="async" />}
      </Link>
    </article>
  )
}
