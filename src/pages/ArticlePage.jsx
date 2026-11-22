import { Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getArticle, articlesInSection, formatDate, listedArticles } from '../data/articles.js'
import { getSection } from '../data/sections.js'
import { THUMBS } from '../data/images.js'
import { getSeoCover } from '../data/covers.js'
import { articleJsonLd, largestSrc } from '../data/seo.js'
import ArticleRow from '../components/ArticleRow.jsx'
import Timeline from '../components/Timeline.jsx'
import IncidentCard from '../components/IncidentCard.jsx'
import Newsletter from '../components/Newsletter.jsx'
import NotFound from './NotFound.jsx'
import { useMeta, siteOrigin } from '../hooks/useMeta.js'
import './ArticlePage.css'

function inlineText(text) {
  if (typeof text === 'string' || text == null) return text
  return text.map((part, i) => {
    if (typeof part === 'string') return <Fragment key={i}>{part}</Fragment>
    // Internal links (to other articles on this site) stay in the same tab.
    if (part.href.startsWith('/')) return <Link key={i} to={part.href}>{part.text}</Link>
    return (
      <a
        key={i}
        href={part.href}
        target="_blank"
        rel={part.sponsored ? 'sponsored noopener' : 'noopener noreferrer'}
        {...(part.sponsored ? { 'data-affiliate': 'TODO-AFFILIATE' } : {})}
      >
        {part.text}
      </a>
    )
  })
}

function Block({ block }) {
  switch (block.type) {
    case 'h2': return <h2>{block.text}</h2>
    case 'quote': return <blockquote><p>{block.text}</p></blockquote>
    case 'code': return <pre><code>{block.text}</code></pre>
    case 'list': return <ul>{block.items.map((item, i) => <li key={i}>{inlineText(item)}</li>)}</ul>
    case 'disclosure': return <aside className="article__disclosure">{block.text}</aside>
    case 'table': return (
      <div className="article__table-wrap">
        <table className="article__table">
          {block.caption ? <caption>{block.caption}</caption> : null}
          <thead>
            <tr>{block.headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  j === 0
                    ? <th key={j} scope="row">{inlineText(cell)}</th>
                    : <td key={j}>{inlineText(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    default: return <p>{inlineText(block.text)}</p>
  }
}

export default function ArticlePage() {
  const { slug } = useParams()
  const a = getArticle(slug)
  const cover = a?.thumb && getSeoCover(a.thumb)
  const thumb = a?.thumb && THUMBS[a.thumb]
  const shareImage = cover && thumb
    ? largestSrc(thumb.srcSet, thumb.src)
    : null
  const pageUrl = a
    ? `${siteOrigin()}/article/${a.slug}/`
    : null
  const imageAbs = shareImage
    ? (shareImage.startsWith('http') ? shareImage : siteOrigin() + shareImage)
    : null
  useMeta(a ? {
    title: a.title,
    description: a.dek,
    type: 'article',
    image: shareImage || undefined,
    imageAlt: cover?.alt,
    imageWidth: cover?.width,
    imageHeight: cover?.height,
    imageType: cover?.type,
    publishedTime: a.date,
    author: a.author,
    noindex: a.placeholder !== false,
    jsonLd: articleJsonLd({
      title: a.title,
      description: a.dek,
      url: pageUrl,
      image: imageAbs,
      date: a.date,
      author: a.author,
      section: a.section,
      category: a.category,
    }),
  } : { title: 'Not found' })
  if (!a) return <NotFound />

  const section = getSection(a.section)
  const related = [...articlesInSection(a.section), ...listedArticles()].filter((x, i, arr) => x.slug !== a.slug && arr.indexOf(x) === i).slice(0, 3)
  // Optional timeline sits just before the first section heading (or after the intro).
  const firstH2 = a.body.findIndex((b) => b.type === 'h2')
  // Optional incident card and timeline share one slot: just before the first section heading.
  const factsAt = firstH2 === -1 ? Math.min(1, a.body.length - 1) : firstH2

  return (
    <article className={`article ${thumb ? (thumb.wide ? 'article--hero' : 'article--inset') : 'article--plain'}`}>
      <div className="article__spread">
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
            <div className="article__frame" style={thumb.wide && thumb.width ? { aspectRatio: `${thumb.width} / ${thumb.height}` } : undefined}>
              <img
                src={thumb.src}
                srcSet={thumb.srcSet}
                sizes={thumb.wide ? '(max-width: 900px) 100vw, 64vw' : '(max-width: 900px) 100vw, 480px'}
                width={thumb.width || 480}
                height={thumb.height || 480}
                alt={thumb.alt}
                fetchPriority="high"
              />
            </div>
            <figcaption className="meta">{a.caption || `${a.volume} / The Digital Security Journal`}</figcaption>
          </figure>
        )}
      </div>

      <div className="article__body">
        {a.body.map((b, i) => (
          <Fragment key={i}>
            {i === factsAt && a.incident && <IncidentCard incident={a.incident} />}
            {i === factsAt && a.timeline?.length > 0 && <Timeline steps={a.timeline} label={a.timelineLabel || 'Timeline'} />}
            <Block block={b} />
          </Fragment>
        ))}
        {a.placeholder !== false && (
          <p className="article__fiction meta">Editorial placeholder: this article is sample copy for the Offline Theory site build.</p>
        )}
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
