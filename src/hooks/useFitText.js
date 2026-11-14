import { useLayoutEffect, useRef } from 'react'

/**
 * Scales the font-size of `ref` so its content exactly fills its parent's width.
 * Runs on resize and after web fonts load, so the masthead never overflows.
 */
export function useFitText() {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const parent = el.parentElement
    let frame = 0
    const fit = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.style.fontSize = '100px'
        const natural = el.scrollWidth
        const avail = parent.clientWidth
        if (natural > 0) el.style.fontSize = `${Math.floor((avail / natural) * 100 * 100) / 100}px`
      })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(parent)
    document.fonts?.ready.then(fit)
    return () => { ro.disconnect(); cancelAnimationFrame(frame) }
  }, [])
  return ref
}
