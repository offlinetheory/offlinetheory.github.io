import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ABOUT_COPY,
  ABOUT_MAGAZINE_ASSETS,
  ABOUT_PORTRAIT,
  ABOUT_TIMING,
  MAGAZINE_LAYOUT as L,
} from '../data/about.js'
import './AboutMagazine.css'

const OPENING_SRCSET = [
  `${ABOUT_MAGAZINE_ASSETS.opening[800]} 800w`,
  `${ABOUT_MAGAZINE_ASSETS.opening[1200]} 1200w`,
  `${ABOUT_MAGAZINE_ASSETS.opening[1505]} 1505w`,
].join(', ')
const HANDS_SRCSET = [
  `${ABOUT_MAGAZINE_ASSETS.hands[800]} 800w`,
  `${ABOUT_MAGAZINE_ASSETS.hands[1200]} 1200w`,
  `${ABOUT_MAGAZINE_ASSETS.hands[1505]} 1505w`,
].join(', ')
const SIZES = '(max-width: 640px) 100vw, min(1120px, 92vw)'

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function sceneFromQuery() {
  if (typeof window === 'undefined') return null
  const scene = new URLSearchParams(window.location.search).get('scene')
  if (scene === 'start') return { phase: 'idle', progress: 0 }
  if (scene === 'mid') return { phase: 'turning', progress: 0.42 }
  if (scene === 'end') return { phase: 'spread', progress: 1 }
  return null
}


function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
}

function padNum(i) {
  return String(i + 1).padStart(2, '0')
}

export function AboutLeftPage({ compact = false }) {
  const cls = compact ? 'mag-page mag-page--compact' : 'mag-page mag-page--full'
  return (
    <div className={`${cls} mag-page--left`}>
      <h2 className="mag-page__title">{ABOUT_COPY.leftTitle}</h2>
      <p className="mag-page__dek">{ABOUT_COPY.leftDek}</p>
      <p>{ABOUT_COPY.leftP1}</p>
      <p>{ABOUT_COPY.leftP2}</p>
    </div>
  )
}

export function AboutRightPage({ compact = false }) {
  const cls = compact ? 'mag-page mag-page--compact' : 'mag-page mag-page--full'
  return (
    <div className={`${cls} mag-page--right`}>
      <h2 className="mag-page__section">{ABOUT_COPY.principlesTitle}</h2>
      <ol className="mag-page__principles">
        {ABOUT_COPY.principles.map(([name, body], i) => (
          <li key={name}>
            <span className="mag-page__num">{padNum(i)} — {name}</span>
            <p>{body}</p>
          </li>
        ))}
      </ol>
      <hr className="mag-page__rule" />
      <p className="mag-page__label">{ABOUT_COPY.mastheadLabel}</p>
      <p className="mag-page__label mag-page__label--sub">{ABOUT_COPY.roleLabel}</p>
      <p className="mag-page__name">{ABOUT_COPY.editorName}</p>
      <p>{ABOUT_COPY.bio}</p>
      <p className="mag-page__label">{ABOUT_COPY.contactLabel}</p>
      <p>
        {ABOUT_COPY.contactLead}{' '}
        <a href={`mailto:${ABOUT_COPY.email}`}>{ABOUT_COPY.email}</a>
      </p>
      <p>{ABOUT_COPY.secureDrop}</p>
      <hr className="mag-page__rule" />
      <p className="mag-page__affiliate">{ABOUT_COPY.affiliate}</p>
    </div>
  )
}

export function AboutSpreadPages({ compact = false }) {
  return (
    <>
      <AboutLeftPage compact={compact} />
      <AboutRightPage compact={compact} />
    </>
  )
}

function TurningLeaf({ progress, openingUrl }) {
  const eased = easeInOutCubic(progress)
  const angle = -180 * eased
  const curl = Math.sin(eased * Math.PI)
  const shade = Math.sin(eased * Math.PI) * 0.45
  const leaf = L.leaf

  return (
    <div
      className="mag-leaf"
      style={{
        left: `${leaf.left * 100}%`,
        top: `${leaf.top * 100}%`,
        width: `${leaf.width * 100}%`,
        height: `${leaf.height * 100}%`,
        transform: `rotateY(${angle}deg) rotateZ(${curl * -1.8}deg)`,
      }}
      aria-hidden="true"
    >
      <div
        className="mag-leaf__front"
        style={{
          WebkitMaskImage: `url(${ABOUT_MAGAZINE_ASSETS.leafMask})`,
          maskImage: `url(${ABOUT_MAGAZINE_ASSETS.leafMask})`,
        }}
      >
        <img
          className="mag-leaf__photo"
          src={openingUrl}
          alt=""
          style={{
            width: `${(1 / leaf.width) * 100}%`,
            height: `${(1 / leaf.height) * 100}%`,
            left: `${-(leaf.left / leaf.width) * 100}%`,
            top: `${-(leaf.top / leaf.height) * 100}%`,
          }}
        />
        <div
          className="mag-leaf__shade"
          style={{
            opacity: shade,
            background: `linear-gradient(90deg, rgba(0,0,0,${0.22 + curl * 0.1}) 0%, rgba(0,0,0,0.03) ${20 + curl * 15}%, rgba(0,0,0,0) 52%, rgba(0,0,0,${0.16 + curl * 0.2}) 100%)`,
          }}
        />
        <div
          className="mag-leaf__edge"
          style={{
            opacity: 0.2 + curl * 0.65,
            boxShadow: `${8 + curl * 36}px 0 ${20 + curl * 40}px rgba(0,0,0,${0.18 + curl * 0.3})`,
          }}
        />
      </div>
      <div className="mag-leaf__back">
        <AboutLeftPage compact />
      </div>
    </div>
  )
}

export default function AboutMagazine() {
  const reduced = useRef(prefersReducedMotion())
  const [reduceMotion, setReduceMotion] = useState(() => prefersReducedMotion())
  const [phase, setPhase] = useState(() => {
    const scene = sceneFromQuery()
    if (scene) return scene.phase
    return prefersReducedMotion() ? 'spread' : 'idle'
  })
  const [progress, setProgress] = useState(() => {
    const scene = sceneFromQuery()
    if (scene) return scene.progress
    return prefersReducedMotion() ? 1 : 0
  })
  const [openingUrl, setOpeningUrl] = useState(ABOUT_MAGAZINE_ASSETS.opening[1505])
  const timers = useRef([])
  const raf = useRef(0)
  const stageRef = useRef(null)
  const touchStartX = useRef(null)

  const clearTimers = () => {
    timers.current.forEach((id) => clearTimeout(id))
    timers.current = []
    if (raf.current) cancelAnimationFrame(raf.current)
  }

  const runTurn = useCallback(() => {
    clearTimers()
    setPhase('turning')
    const start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - start) / ABOUT_TIMING.turnMs)
      setProgress(t)
      if (t < 1) {
        raf.current = requestAnimationFrame(step)
      } else {
        setPhase('holding')
        const hold = setTimeout(() => {
          setPhase('fading')
          const fade = setTimeout(() => setPhase('spread'), ABOUT_TIMING.revealMs)
          timers.current.push(fade)
        }, ABOUT_TIMING.holdMs)
        timers.current.push(hold)
      }
    }
    raf.current = requestAnimationFrame(step)
  }, [])

  const play = useCallback(() => {
    if (reduced.current) {
      setPhase('spread')
      setProgress(1)
      return
    }
    clearTimers()
    setProgress(0)
    setPhase('idle')
    const pause = setTimeout(runTurn, ABOUT_TIMING.pauseMs)
    timers.current.push(pause)
  }, [runTurn])

  const skip = useCallback(() => {
    clearTimers()
    setProgress(1)
    setPhase('spread')
  }, [])

  const tryTurn = useCallback(() => {
    if (phase === 'idle') runTurn()
  }, [phase, runTurn])

  useEffect(() => {
    if (!sceneFromQuery()) play()
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => {
      reduced.current = mq.matches
      setReduceMotion(mq.matches)
      if (mq.matches) skip()
    }
    mq.addEventListener('change', onChange)
    return () => {
      clearTimers()
      mq.removeEventListener('change', onChange)
    }
  }, [play, skip])

  useEffect(() => {
    const img = stageRef.current?.querySelector('.mag-stage__photo')
    if (!img) return
    const sync = () => {
      if (img.currentSrc) setOpeningUrl(img.currentSrc)
    }
    sync()
    img.addEventListener('load', sync)
    return () => img.removeEventListener('load', sync)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (phase === 'idle') {
          e.preventDefault()
          runTurn()
        } else if (phase === 'spread' && (e.key === 'Enter' || e.key === ' ')) {
          // let buttons handle their own keys
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, runTurn])

  const onTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].clientX
  }
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (dx < -40) tryTurn()
  }

  const showBook = phase !== 'spread'
  const exiting = phase === 'fading'
  const showSpread = phase === 'fading' || phase === 'spread'

  return (
    <section className={`mag ${showSpread ? 'mag--revealed' : ''}`} aria-label="About Offline Theory">
      <a className="mag__skip" href="#about-spread" onClick={(e) => { e.preventDefault(); skip() }}>
        Skip animation
      </a>

      <div className="mag-frame">
      <div
        ref={stageRef}
        className={`mag-stage${showBook ? ' is-active' : ' is-gone'}${exiting ? ' is-exiting' : ''}`}
        role="img"
        aria-label="An open magazine held by two hands. The left page is a portrait; the right page reads About. The right-hand page turns to reveal the Offline Theory About spread."
        tabIndex={0}
        onClick={tryTurn}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="mag-stage__scene">
          <img
            className="mag-stage__photo"
            src={ABOUT_MAGAZINE_ASSETS.opening[1200]}
            srcSet={OPENING_SRCSET}
            sizes={SIZES}
            alt=""
            draggable="false"
          />
          <div
            className="mag-portrait"
            style={{
              left: `${L.portrait.left * 100}%`,
              top: `${L.portrait.top * 100}%`,
              width: `${L.portrait.width * 100}%`,
              height: `${L.portrait.height * 100}%`,
            }}
          >
            <img
              src={ABOUT_PORTRAIT.src}
              alt={ABOUT_PORTRAIT.alt}
              width={381}
              height={592}
            />
          </div>
          <div
            className="mag-under"
            style={{
              left: `${L.leaf.left * 100}%`,
              top: `${L.leaf.top * 100}%`,
              width: `${L.leaf.width * 100}%`,
              height: `${L.leaf.height * 100}%`,
            }}
          >
            <div className="mag-under__inner">
              <AboutRightPage compact />
            </div>
          </div>
          {phase !== 'spread' && <TurningLeaf progress={progress} openingUrl={openingUrl} />}
          <img
            className="mag-stage__hands"
            src={ABOUT_MAGAZINE_ASSETS.hands[1200]}
            srcSet={HANDS_SRCSET}
            sizes={SIZES}
            alt=""
            draggable="false"
          />
        </div>
      </div>

      <div
        id="about-spread"
        className={`mag-spread ${showSpread ? 'is-visible' : ''}`}
        aria-hidden={!showSpread}
      >
        <div className="mag-spread__book">
          <AboutSpreadPages />
        </div>
      </div>

      </div>

      <div className="mag-controls">
        {phase !== 'spread' && (
          <button type="button" className="mag-controls__btn" onClick={skip}>Skip animation</button>
        )}
        {phase === 'spread' && !reduceMotion && (
          <button type="button" className="mag-controls__btn" onClick={play}>Replay</button>
        )}
      </div>
    </section>
  )
}
