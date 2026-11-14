export function Arrow({ className = '', width = 15 }) {
  return (
    <svg className={`arrow ${className}`} width={width} height="8" viewBox="0 0 15 8" aria-hidden="true" focusable="false">
      <path d="M0 4h13.6M10.4 0.8 13.8 4l-3.4 3.2" fill="none" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  )
}

export function SearchIcon({ size = 21 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14.6 14.6 21 21" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function CloseIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M1 1l16 16M17 1 1 17" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
