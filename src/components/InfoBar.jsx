import './InfoBar.css'

export default function InfoBar() {
  return (
    <div className="info-bar" role="note" aria-label="Publication information">
      <span>Est. 2026</span>
      <span className="info-bar__center">Technology <i>/</i> Security <i>/</i> Internet Culture</span>
      <span>Vol. 001</span>
    </div>
  )
}
