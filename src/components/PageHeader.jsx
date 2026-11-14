import './PageHeader.css'

export default function PageHeader({ kicker, title, description, children }) {
  return (
    <header className="page-header">
      <div className="page-header__meta label">
        <span>{kicker}</span>
        <span>Offline Theory</span>
      </div>
      <h1 className="page-header__title">{title}</h1>
      {description && <p className="page-header__desc">{description}</p>}
      {children}
    </header>
  )
}
