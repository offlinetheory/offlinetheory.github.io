import { useId, useState } from 'react'
import { subscribe, validateEmail, isDemoMode } from '../services/newsletter.js'
import './Newsletter.css'

export default function Newsletter({ compact = false }) {
  const id = useId()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [message, setMessage] = useState('')

  const onSubmit = async (e) => {
    e.preventDefault()
    if (e.currentTarget.elements.namedItem('company')?.value) return // honeypot
    const invalid = validateEmail(email)
    if (invalid) { setStatus('error'); setMessage(invalid); return }
    setStatus('loading'); setMessage('')
    try {
      const res = await subscribe(email)
      setStatus('success'); setMessage(res.message); setEmail('')
    } catch (err) {
      setStatus('error'); setMessage(err.message)
    }
  }

  return (
    <section className={`newsletter ${compact ? 'newsletter--compact' : ''}`} aria-labelledby={`${id}-h`}>
      <div className="newsletter__copy">
        <h2 id={`${id}-h`} className="newsletter__title">Stay offline, in the know.</h2>
        <p className="newsletter__dek">A weekly dispatch on security, tech, and the internet.</p>
      </div>
      <form className="newsletter__form" data-mode={isDemoMode ? 'demo' : 'live'} onSubmit={onSubmit} noValidate>
        <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
        <input
          id={`${id}-email`} type="email" name="email" inputMode="email" autoComplete="email"
          placeholder="Enter your email" value={email}
          onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle') }}
          aria-invalid={status === 'error'}
          aria-describedby={`${id}-status`}
        />
        <input type="text" name="company" tabIndex={-1} autoComplete="off" className="newsletter__hp" aria-hidden="true" />
        <button type="submit" className="btn" disabled={status === 'loading'}>
          {status === 'loading' ? 'Sending…' : 'Subscribe'}
        </button>
        <p id={`${id}-status`} className={`newsletter__status is-${status}`} role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </section>
  )
}
