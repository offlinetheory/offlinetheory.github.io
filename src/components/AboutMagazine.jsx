import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ABOUT_MAGAZINE_ASSETS,
  ABOUT_PORTRAIT,
  ABOUT_SPREADS,
  ABOUT_TIMING,
  MAGAZINE_LAYOUT as L,
} from '../data/about.js'
import './AboutMagazine.css'

const OPENING_SRCSET = [
  `${ABOUT_MAGAZINE_ASSETS.opening[800]} 800w`,
  `${ABOUT_MAGAZINE_ASSETS.opening[1200]} 1200w`,
  `${ABOUT_MAGAZINE_ASSETS.opening[1904]} 1904w`,
].join(', ')
const HANDS_SRCSET = [
  `${ABOUT_MAGAZINE_ASSETS.hands[800]} 800w`,
  `${ABOUT_MAGAZINE_ASSETS.hands[1200]} 1200w`,
  `${ABOUT_MAGAZINE_ASSETS.hands[1904]} 1904w`,
].join(', ')
const SIZES = '(max-width: 640px) 100vw, min(1680px, 96vw)'
const PAGES = ABOUT_MAGAZINE_ASSETS.pages
const LAST_SPREAD = ABOUT_SPREADS.length - 1

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function qaFromQuery() {
  if (typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search)
  const scene = q.get('scene')
  const spreadQ = q.get('spread')
  const tQ = q.get('t')
  const turn = q.get('turn')
  const map = {
    open: { spread: 0, t: 0, dir: 1 },
    opening: { spread: 0, t: 0, dir: 1 },
    start: { spread: 0, t: 0, dir: 1 },
    lift: { spread: 0, t: 0.1, dir: 1 },
    mid: { spread: 0, t: 0.32, dir: 1 },
    mid1: { spread: 0, t: 0.32, dir: 1 },
    mid2: { spread: 0, t: 0.52, dir: 1 },
    mid3: { spread: 0, t: 0.74, dir: 1 },
    settled: { spread: 1, t: 0, dir: 1 },
    spread1: { spread: 1, t: 0, dir: 1 },
    spread2: { spread: 2, t: 0, dir: 1 },
    spread3: { spread: 3, t: 0, dir: 1 },
    spread4: { spread: 4, t: 0, dir: 1 },
    back: { spread: 1, t: 0.52, dir: -1 },
    backlift: { spread: 1, t: 0.1, dir: -1 },
    backend: { spread: 0, t: 0, dir: 1 },
  }
  let conf = scene && map[scene] ? { ...map[scene] } : null
  if (spreadQ != null) {
    conf = conf || { spread: 0, t: 0, dir: 1 }
    conf.spread = Math.max(0, Math.min(LAST_SPREAD, Number(spreadQ)))
  }
  if (tQ != null) {
    conf = conf || { spread: 0, t: 0, dir: 1 }
    conf.t = Math.max(0, Math.min(1, Number(tQ)))
  }
  if (turn === 'back') {
    conf = conf || { spread: 1, t: 0.5, dir: -1 }
    conf.dir = -1
  }
  return conf
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => prefersReducedMotion())
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduce(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduce
}

export default function AboutMagazine() {
  const reduce = useReducedMotion()
  const stageRef = useRef(null)
  const innerRef = useRef(null)
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const turnRef = useRef(null)
  const spreadRef = useRef(0)
  const turningRef = useRef(false)
  const [spread, setSpread] = useState(0)
  // Folio label spread: updates as soon as a turn is committed (or as a
  // drag passes halfway), not only after the turn finishes.
  const [folioSpread, setFolioSpread] = useState(0)
  const [turning, setTurning] = useState(false)
  const [webgl, setWebgl] = useState(true)
  const [ready, setReady] = useState(false)
  const [focus, setFocus] = useState('right')
  const [narrow, setNarrow] = useState(false)
  const [qa] = useState(() => qaFromQuery())

  const stopTurn = useCallback(() => {
    if (turnRef.current) {
      cancelAnimationFrame(turnRef.current.raf)
      turnRef.current = null
    }
  }, [])

  const paintSpread = useCallback(async (spreadIndex, opts = {}) => {
    const engine = engineRef.current
    if (!engine) return
    const current = ABOUT_SPREADS[spreadIndex]
    const next = ABOUT_SPREADS[spreadIndex + 1]
    const prev = ABOUT_SPREADS[spreadIndex - 1]
    const dir = opts.dir ?? 1
    const progress = opts.progress ?? 0
    const turning = Boolean(opts.turning) || progress > 0.001
    const leftUrl = current.left ? PAGES[current.left] : null
    const rightUrl = PAGES[current.right]
    let frontUrl
    let backUrl
    let underRightUrl
    let underLeftUrl
    if (turning && dir > 0 && next) {
      frontUrl = rightUrl
      backUrl = PAGES[next.left]
      underRightUrl = PAGES[next.right]
      underLeftUrl = leftUrl
    } else if (turning && dir < 0 && prev) {
      frontUrl = leftUrl
      backUrl = PAGES[prev.right]
      underRightUrl = rightUrl
      underLeftUrl = prev.left ? PAGES[prev.left] : null
    } else {
      frontUrl = rightUrl
      backUrl = rightUrl
      underRightUrl = rightUrl
      underLeftUrl = leftUrl
    }
    const [front, back, ur, ul] = await Promise.all([
      engine.texture(frontUrl),
      engine.texture(backUrl),
      engine.texture(underRightUrl),
      underLeftUrl ? engine.texture(underLeftUrl) : Promise.resolve(null),
    ])
    engine.setDirection(dir)
    engine.setMaps({ front, back, underRight: ur, underLeft: ul ?? null })
    engine.setProgress(progress)
    engine.setCurlVisible(progress > 0.001 && progress < 0.999)
    engine.setUnderVisibility({ left: Boolean(ul) || (dir < 0 && underLeftUrl === null ? false : Boolean(ul)), right: true })
    if (!ul) engine.setUnderVisibility({ left: false })
    engine.render()
  }, [])

  const animateTo = useCallback((from, to, duration, onDone) => {
    stopTurn()
    const engine = engineRef.current
    if (!engine) return
    const start = performance.now()
    const tick = (now) => {
      const u = Math.min(1, (now - start) / duration)
      const p = from + (to - from) * easeInOutCubic(u)
      engine.setProgress(p)
      engine.setCurlVisible(p > 0.001 && p < 0.999)
      engine.render()
      if (u < 1) {
        turnRef.current = { raf: requestAnimationFrame(tick) }
      } else {
        turnRef.current = null
        onDone?.()
      }
    }
    turnRef.current = { raf: requestAnimationFrame(tick) }
  }, [stopTurn])

  const finishTurn = useCallback((dir) => {
    const next = spreadRef.current + (dir > 0 ? 1 : -1)
    spreadRef.current = next
    setSpread(next)
    setFolioSpread(next)
    setFocus(dir > 0 ? 'left' : 'right')
    paintSpread(next, { dir: 1, progress: 0 }).then(() => {
      turningRef.current = false
      setTurning(false)
    })
  }, [paintSpread])

  const turn = useCallback((dir) => {
    if (turningRef.current) return
    const s = spreadRef.current
    if (dir > 0 && s >= LAST_SPREAD) return
    if (dir < 0 && s <= 0) return
    turningRef.current = true
    setTurning(true)
    setFolioSpread(s + (dir > 0 ? 1 : -1))
    const engine = engineRef.current
    const reduced = prefersReducedMotion()
    if (!engine || reduced || !webgl) {
      finishTurn(dir)
      return
    }
    paintSpread(s, { dir, progress: 0, turning: true }).then(() => {
      engine.setDirection(dir)
      engine.setCurlVisible(true)
      animateTo(0, 1, ABOUT_TIMING.turnMs, () => finishTurn(dir))
    })
  }, [animateTo, finishTurn, paintSpread, webgl])

  const next = useCallback(() => {
    // On a narrow viewport, first pan to the unread right page of this spread.
    if (narrow && focus === 'left' && !turningRef.current) {
      setFocus('right')
      return
    }
    turn(1)
  }, [focus, narrow, turn])
  const prev = useCallback(() => {
    if (narrow && focus === 'right' && !turningRef.current) {
      setFocus('left')
      return
    }
    turn(-1)
  }, [focus, narrow, turn])

  // Init WebGL engine (three.js is loaded only on this route)
  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return undefined
    let cancelled = false
    let ro
    ;(async () => {
      const { createPageCurlEngine, supportsWebGL } = await import('./magazine/PageCurlEngine.js')
      if (cancelled) return
      if (!supportsWebGL()) {
        setWebgl(false)
        setReady(true)
        return
      }
      const engine = createPageCurlEngine(canvas, L)
      engineRef.current = engine
      const resize = () => {
        const el = innerRef.current || stage
        const rect = el.getBoundingClientRect()
        engine.setSize(rect.width, rect.height)
      }
      resize()
      ro = new ResizeObserver(resize)
      ro.observe(innerRef.current || stage)
      const startSpread = qa ? qa.spread : 0
      const startT = qa ? qa.t : 0
      const startDir = qa ? qa.dir : 1
      spreadRef.current = startSpread
      setSpread(startSpread)
      setFolioSpread(startSpread)
      setFocus(startSpread === 0 ? 'right' : 'left')
      await paintSpread(startSpread, { dir: startDir, progress: startT })
      if (cancelled) return
      setReady(true)
      engine.render()
    })()

    return () => {
      cancelled = true
      stopTurn()
      ro?.disconnect()
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [paintSpread, qa, stopTurn])

  // Corner-lift hint on the opening, once — never auto-completes a turn
  useEffect(() => {
    if (qa || reduce || !ready || !webgl) return undefined
    if (spread !== 0) return undefined
    let cancelled = false
    const id = setTimeout(() => {
      const engine = engineRef.current
      if (!engine || turningRef.current || cancelled) return
      const peek = ABOUT_TIMING.peekAmount
      animateTo(0, peek, ABOUT_TIMING.peekMs / 2, () => {
        if (cancelled || turningRef.current) return
        animateTo(peek, 0, ABOUT_TIMING.peekMs / 2, () => {
          engine.setCurlVisible(false)
          engine.render()
        })
      })
    }, ABOUT_TIMING.peekDelayMs)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [animateTo, qa, ready, reduce, spread, webgl])

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        prev()
      } else if (e.key === 'Home') {
        e.preventDefault()
        if (!turningRef.current) {
          spreadRef.current = 0
          setSpread(0)
          setFolioSpread(0)
          setFocus('right')
          paintSpread(0, { progress: 0 })
        }
      } else if (e.key === 'End') {
        e.preventDefault()
        if (!turningRef.current) {
          spreadRef.current = LAST_SPREAD
          setSpread(LAST_SPREAD)
          setFolioSpread(LAST_SPREAD)
          setFocus('left')
          paintSpread(LAST_SPREAD, { progress: 0 })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, paintSpread, prev])

  // Pointer: drag from a corner/edge to curl, or a click/tap to turn
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    const drag = { active: false, startX: 0, startY: 0, dir: 0, pulled: false, pointerId: null }

    const photoRect = () => (innerRef.current || stage).getBoundingClientRect()
    const localX = (e) => {
      const rect = photoRect()
      return (e.clientX - rect.left) / rect.width
    }

    const onDown = (e) => {
      if (turningRef.current) return
      drag.active = true
      drag.pulled = false
      drag.startX = e.clientX
      drag.startY = e.clientY
      drag.pointerId = e.pointerId
      const x = localX(e)
      // Right half starts a forward turn; left half a backward turn
      drag.dir = x >= L.spineX ? 1 : -1
      try { stage.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    }

    const onMove = (e) => {
      if (!drag.active) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (!drag.pulled && Math.hypot(dx, dy) < 18) return
      const s = spreadRef.current
      if (drag.dir > 0 && s >= LAST_SPREAD) return
      if (drag.dir < 0 && s <= 0) return
      const engine = engineRef.current
      if (!engine || reduce || !webgl) return
      if (!drag.pulled) {
        drag.pulled = true
        turningRef.current = true
        setTurning(true)
        stopTurn()
        paintSpread(s, { dir: drag.dir, progress: 0, turning: true }).then(() => {
          if (!drag.active) return
          engine.setDirection(drag.dir)
          engine.setCurlVisible(true)
        })
      }
      const rect = photoRect()
      const frac = Math.abs(dx) / (rect.width * L.right.width * 1.15)
      const p = Math.min(0.92, Math.max(0, frac))
      // Folio follows the drag: past halfway it shows the spread being
      // turned to, before that the spread being left.
      setFolioSpread(p >= 0.5 ? s + drag.dir : s)
      if (engine && drag.pulled) {
        engine.setProgress(p)
        engine.setCurlVisible(p > 0.001)
        engine.render()
      }
    }

    const onUp = (e) => {
      if (!drag.active) return
      drag.active = false
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const dist = Math.hypot(dx, dy)
      if (!drag.pulled && dist < 18) {
        // Click / tap: turn if it was on a page area
        const x = localX(e)
        if (x >= L.spineX) next()
        else prev()
        return
      }
      if (!drag.pulled) return
      const engine = engineRef.current
      const p = engine ? engine.progress : 0
      if (p >= 0.18) {
        const remain = Math.max(800, ABOUT_TIMING.turnMs * (1 - p))
        animateTo(p, 1, remain, () => finishTurn(drag.dir))
      } else {
        // Snapped back: the folio returns to the spread we stayed on.
        setFolioSpread(spreadRef.current)
        animateTo(p, 0, ABOUT_TIMING.snapMs, () => {
          turningRef.current = false
          setTurning(false)
          paintSpread(spreadRef.current, { progress: 0 })
        })
      }
    }

    stage.addEventListener('pointerdown', onDown)
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerup', onUp)
    stage.addEventListener('pointercancel', onUp)
    return () => {
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
    }
  }, [animateTo, finishTurn, next, paintSpread, prev, reduce, stopTurn, webgl])

  // Narrow (mobile) detection
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    const measure = () => setNarrow(stage.getBoundingClientRect().width < 640)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  const canPrev = spread > 0 && !turning
  const canNext = spread < LAST_SPREAD && !turning
  const showPortrait = spread === 0
  const fallback = !webgl

  const folioLabel = folioSpread === 0
    ? 'Opening'
    : folioSpread === 1
      ? '01–02'
      : folioSpread === 2
        ? '03–04'
        : folioSpread === 3
          ? '05–06'
          : '07–08'

  return (
    <div className="mag">
      <h1 className="mag__sr">About Offline Theory</h1>
      <div
        ref={stageRef}
        className={[
          'mag-stage',
          ready ? 'is-ready' : '',
          turning ? 'is-turning' : '',
          narrow ? 'is-narrow' : '',
          `is-focus-${focus}`,
        ].filter(Boolean).join(' ')}
        role="region"
        aria-label="Offline Theory magazine"
        tabIndex={0}
      >
        <div className="mag-stage__inner" ref={innerRef}>
        <img
          className="mag-stage__photo"
          src={ABOUT_MAGAZINE_ASSETS.opening[1904]}
          srcSet={OPENING_SRCSET}
          sizes={SIZES}
          alt=""
          draggable="false"
        />

        {showPortrait && (
          <div
            className="mag-portrait"
            style={{
              left: `${L.portrait.left * 100}%`,
              top: `${L.portrait.top * 100}%`,
              width: `${L.portrait.width * 100}%`,
              height: `${L.portrait.height * 100}%`,
            }}
          >
            <img src={ABOUT_PORTRAIT.src} alt={ABOUT_PORTRAIT.alt} draggable="false" />
          </div>
        )}

        {fallback && (
          <FallbackPages spread={spread} />
        )}

        <canvas
          ref={canvasRef}
          className="mag-stage__gl"
          aria-hidden="true"
        />

        <img
          className="mag-stage__hands"
          src={ABOUT_MAGAZINE_ASSETS.hands[1904]}
          srcSet={HANDS_SRCSET}
          sizes={SIZES}
          alt=""
          draggable="false"
        />

        <div className="mag-ui" aria-hidden={false}>
          <button
            type="button"
            className="mag-ui__hit mag-ui__hit--prev"
            onClick={prev}
            disabled={!canPrev}
            aria-label="Previous page"
          />
          <button
            type="button"
            className="mag-ui__hit mag-ui__hit--next"
            onClick={next}
            disabled={!canNext}
            aria-label="Next page"
          />
          <div className="mag-ui__folio">
            <button
              type="button"
              className="mag-ui__arrow"
              onClick={prev}
              disabled={!canPrev}
              aria-label="Previous page"
            >
              ‹
            </button>
            <span className="mag-ui__folio-text">{folioLabel}</span>
            <button
              type="button"
              className="mag-ui__arrow"
              onClick={next}
              disabled={!canNext}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>

        {spread === LAST_SPREAD && (
          <a
            className="mag-ui__mail"
            href={`mailto:offlinetheory@proton.me`}
            aria-label="Email offlinetheory@proton.me"
            // Email line sits on page 7 (left page of the contact spread),
            // ~27% down the page image, ~5% tall.
            style={{
              left: `${(L.left.left + L.left.width * 0.11) * 100}%`,
              top: `${(L.left.top + L.left.height * 0.27) * 100}%`,
              width: `${L.left.width * 0.78 * 100}%`,
              height: `${L.left.height * 0.06 * 100}%`,
            }}
          />
        )}
        </div>
      </div>
    </div>
  )
}

function FallbackPages({ spread }) {
  const current = ABOUT_SPREADS[spread]
  return (
    <>
      {current.left && (
        <img
          className="mag-fallback mag-fallback--left"
          src={PAGES[current.left]}
          alt=""
          draggable="false"
          style={{
            left: `${L.left.left * 100}%`,
            top: `${L.left.top * 100}%`,
            width: `${L.left.width * 100}%`,
            height: `${L.left.height * 100}%`,
          }}
        />
      )}
      <img
        className="mag-fallback mag-fallback--right"
        src={PAGES[current.right]}
        alt=""
        draggable="false"
        style={{
          left: `${L.right.left * 100}%`,
          top: `${L.right.top * 100}%`,
          width: `${L.right.width * 100}%`,
          height: `${L.right.height * 100}%`,
        }}
      />
    </>
  )
}
