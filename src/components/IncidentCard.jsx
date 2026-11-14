import './IncidentCard.css'

const STATUS = {
  resolved: 'resolved',
  ongoing: 'ongoing',
  investigating: 'investigating',
  monitoring: 'monitoring',
}

/**
 * At-a-glance summary for breach and outage articles. Driven by an optional
 * `incident` field: { eyebrow?, status, title, subtitle?, facts: [{ label, value }],
 * services?: [], servicesLabel?, note? }. Status: Resolved | Ongoing | Investigating | Monitoring.
 */
export default function IncidentCard({ incident }) {
  const {
    eyebrow = 'The incident', status, title, subtitle, facts = [], services = [],
    servicesLabel = 'Services affected', note,
  } = incident
  const tone = STATUS[String(status || '').toLowerCase()] || 'neutral'
  return (
    <aside className="incident" aria-label={`Incident summary: ${title}`}>
      <div className="incident__top">
        <p className="label incident__eyebrow">{eyebrow}</p>
        {status && (
          <span className={`incident__status incident__status--${tone}`}>
            <span className="sr-only">Status: </span>{status}
          </span>
        )}
      </div>
      <h2 className="incident__title">{title}</h2>
      {subtitle && <p className="incident__subtitle serif-head">{subtitle}</p>}
      {facts.length > 0 && (
        <dl className="incident__facts">
          {facts.map((f) => (
            <div key={f.label} className="incident__fact">
              <dt className="label">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {services.length > 0 && (
        <div className="incident__services">
          <h3 className="incident__services-h serif-head">{servicesLabel}</h3>
          <ul className="incident__chips">
            {services.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}
      {note && <p className="incident__note">{note}</p>}
    </aside>
  )
}
