import { Link, useParams } from 'react-router-dom'
import { getArticle, articlesInSection, formatDate, ARTICLES } from '../data/articles.js'
import { getSection } from '../data/sections.js'
import { THUMBS } from '../data/images.js'
import ArticleRow from '../components/ArticleRow.jsx'
import Newsletter from '../components/Newsletter.jsx'
import NotFound from './NotFound.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './ArticlePage.css'

function Block({ block }) {
  switch (block.type) {
    case 'h2': return <h2>{block.text}</h2>
    case 'quote': return <blockquote><p>{block.text}</p></blockquote>
    case 'code': return <pre><code>{block.text}</code></pre>
    case 'list': return <ul>{block.items.map((t) => <li key={t}>{t}</li>)}</ul>
    default: return <p>{block.text}</p>
  }
}

export default function ArticlePage() {
  const { slug } = useParams()
  const a = getArticle(slug)
  useMeta(a ? { title: a.title, description: a.dek, type: 'article' } : { title: 'Not found' })
  if (!a) return <NotFound />

  const section = getSection(a.section)
  const related = [...articlesInSection(a.section), ...ARTICLES].filter((x, i, arr) => x.slug !== a.slug && arr.indexOf(x) === i).slice(0, 3)
  const thumb = a.thumb && THUMBS[a.thumb]

  return (
    <article className="article">
      <header className="article__head">
        <nav className="article__crumbs label" aria-label="Breadcrumb">
          <Link to="/">Home</Link> <span aria-hidden="true">/</span>{' '}
          <Link to={`/${section.slug}`}>{section.name}</Link>
          {a.volume && <> <span aria-hidden="true">/</span> <span>{a.volume}</span></>}
        </nav>
        <p className="meta article__cat">{a.category || section.name} / {a.readTime} min read</p>
        <h1 className="article__title">{a.title}</h1>
        <p className="article__dek">{a.dek}</p>
        <div className="article__byline">
          <span className="meta">By {a.author}</span>
          <time className="meta" dateTime={a.date}>{formatDate(a.date)}</time>
        </div>
      </header>

      {thumb && (
        <figure className="article__figure">
          <img src={thumb.src} srcSet={thumb.srcSet} sizes="(max-width: 760px) 100vw, 480px" width="480" height="480" alt={thumb.alt} />
          <figcaption className="meta">{a.volume} / The Digital Security Journal</figcaption>
        </figure>
      )}

      <div className="article__body">
        {a.body.map((b, i) => <Block key={i} block={b} />)}
        <p className="article__fiction meta">Editorial placeholder: this article is sample copy for the Offline Theory site build.</p>
        <ul className="article__tags" aria-label="Tags">
          {a.tags.map((t) => <li key={t}><Link to={`/search?q=${encodeURIComponent(t)}`} className="meta">{t}</Link></li>)}
        </ul>
      </div>

      <section className="article__related" aria-labelledby="related-h">
        <h2 id="related-h" className="label col-label">Continue reading</h2>
        {related.map((r) => <ArticleRow key={r.slug} article={r} />)}
      </section>
      <div className="article__newsletter"><Newsletter compact /></div>
    </article>
  )
}
