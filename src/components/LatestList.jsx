import { Link } from 'react-router-dom'
import { featuredArticles } from '../data/articles.js'
import { Arrow } from './Icons.jsx'
import './LatestList.css'

export default function LatestList() {
  const items = featuredArticles()
  return (
    <section className="latest" aria-labelledby="latest-heading">
      <h2 id="latest-heading" className="label col-label">Featured</h2>
      <ol className="latest__list">
        {items.map((a, i) => (
          <li key={a.slug}>
            <Link to={`/article/${a.slug}`} className="latest__item">
              <span className="meta">{String(i + 1).padStart(2, '0')} / {a.category}</span>
              <span className="latest__title serif-head">{a.title}</span>
              <span className="meta latest__read">{a.readTime} min read <Arrow /></span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
