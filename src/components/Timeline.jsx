import { useId, useRef, useState } from 'react'
import './Timeline.css'

/**
 * Interactive event timeline. Each step is a button that expands its note.
 * Arrow keys / Home / End move between steps. Pass `steps` as
 * [{ date, title, text }]; used by articles that set an optional `timeline`.
 */
export default function Timeline({ steps, label = 'Timeline', initial = 0 }) {
  const [active, setActive] = useState(Math.min(initial, steps.length - 1))
  const refs = useRef([])
  const uid = useId()
  const last = steps.length - 1
  const progress = last > 0 ? active / last : 1

  const go = (i) => {
    const next = Math.max(0, Math.min(last, i))
    setActive(next)
    refs.current[next]?.focus()
  }
  const onKey = (e, i) => {
    const map = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: last }
    if (e.key in map) { e.preventDefault(); go(map[e.key]) }
  }

  return (
    <section className="timeline" aria-label={label} style={{ '--steps': steps.length, '--progress': progress }}>
      <p className="label timeline__label">{label}</p>
      <div className="timeline__rail">
      <span className="timeline__track" aria-hidden="true"><span className="timeline__fill" /></span>
      <ol className="timeline__list">
        {steps.map((s, i) => {
          const state = i === active ? 'is-active' : i < active ? 'is-done' : ''
          const panelId = `${uid}-step-${i}`
          return (
            <li key={i} className={`timeline__step ${state}`}>
              <button
                ref={(el) => { refs.current[i] = el }}
                type="button"
                className="timeline__btn"
                aria-expanded={i === active}
                aria-controls={panelId}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <span className="timeline__dot" aria-hidden="true" />
                <span className="meta timeline__date">{s.date}</span>
                <span className="timeline__title serif-head">{s.title}</span>
              </button>
              <p id={panelId} className="timeline__text" hidden={i !== active}>{s.text}</p>
            </li>
          )
        })}
      </ol>
      </div>
      <p className="meta timeline__hint" aria-hidden="true">Select a date to read what happened</p>
    </section>
  )
}
