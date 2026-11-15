import { useLayoutEffect, useRef } from 'react'

/** Fraction of the parent width the title may fill. 0.97 leaves breathing
 * room on both sides so sub-pixel rounding can never clip a letter. */
const FIT_RATIO = 0.97

/**
 * Scales the font-size of `ref` so its content fills its parent's width
 * (up to FIT_RATIO), so the masthead fits completely within the viewport.
 * Runs on resize and re-fits after web fonts load: the fallback-font
 * measurement is narrower than the real Archivo/Bodoni, so without the
 * re-fit the letters can clip at the edges once the fonts arrive.
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
        if (natural > 0 && avail > 0) {
          el.style.fontSize = `${Math.floor((avail / natural) * 100 * FIT_RATIO * 100) / 100}px`
        }
      })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(parent)
    document.fonts?.ready.then(fit)
    document.fonts?.addEventListener?.('loadingdone', fit)
    window.addEventListener('load', fit)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
      document.fonts?.removeEventListener?.('loadingdone', fit)
      window.removeEventListener('load', fit)
    }
  }, [])
  return ref
}
