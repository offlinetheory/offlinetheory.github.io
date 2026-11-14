import { useFitText } from '../hooks/useFitText.js'
import './Masthead.css'

/** Oversized OFFLINE THEORY masthead, auto-fitted edge to edge. */
export default function Masthead({ as: Tag = 'h1' }) {
  const ref = useFitText()
  return (
    <div className="masthead">
      <Tag className="masthead__title" ref={ref}>
        <span className="masthead__offline">OFFLINE</span>
        <span className="masthead__theory">THEORY</span>
      </Tag>
    </div>
  )
}
