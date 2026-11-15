import logoUrl from '../assets/images/logo.svg'
import './Masthead.css'

/** Oversized OFFLINE THEORY masthead — the wordmark logo, edge to edge. */
export default function Masthead({ as: Tag = 'h1' }) {
  return (
    <div className="masthead">
      <Tag className="masthead__title">
        <img src={logoUrl} alt="OFFLINE THEORY" />
      </Tag>
    </div>
  )
}
