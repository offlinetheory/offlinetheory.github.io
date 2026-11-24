import { useEffect, useRef, useState } from 'react'
import { PageFlip } from 'page-flip'
import page1 from '../assets/about/pdf/pdf-page-1.webp'
import page2 from '../assets/about/pdf/pdf-page-2.webp'
import page3 from '../assets/about/pdf/pdf-page-3.webp'
import page4 from '../assets/about/pdf/pdf-page-4.webp'
import page5 from '../assets/about/pdf/pdf-page-5.webp'
import './PdfFlipbook.css'

// Miah's Canva PDF (Offline_Theory___3.pdf) pages 1–5. Page 3 is the
// arm-finished version (her PDF still has the arm cut off). Page 5 is her
// contact page with the corrected footer (©2026 OFFLINE THEORY).
// Spreads are (1,2) intro+principles, (3,4) masthead, (5) contact alone.
const PAGES = [page1, page2, page3, page4, page5]

export default function PdfFlipbook() {
  const bookRef = useRef(null)
  const flipRef = useRef(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (!bookRef.current || flipRef.current) return
    const flip = new PageFlip(bookRef.current, {
      width: 550,
      height: 742,
      size: 'stretch',
      minWidth: 280,
      maxWidth: 600,
      minHeight: 380,
      maxHeight: 810,
      drawShadow: true,
      flippingTime: 1000,
      usePortrait: true,
      startPage: 0,
      autoSize: true,
      maxShadowOpacity: 0.5,
      showCover: false,
      mobileScrollSupport: true,
      swipeDistance: 30,
      clickEventForward: true,
      useMouseEvents: true,
      showPageCorners: true,
      disableFlipByClick: false,
    })
    flip.loadFromImages(PAGES)
    flip.on('flip', (e) => setPage(e.data))
    setPage(flip.getCurrentPageIndex())
    flipRef.current = flip
    return () => {
      flip.destroy()
      flipRef.current = null
    }
  }, [])

  const prev = () => flipRef.current?.flipPrev()
  const next = () => flipRef.current?.flipNext()

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="pdf-flipbook">
      <div className="pdf-flipbook__book" ref={bookRef} aria-label="Offline Theory magazine" />
      <div className="pdf-flipbook__bar">
        <button type="button" onClick={prev} aria-label="Previous page">
          ‹
        </button>
        <span className="pdf-flipbook__pages">
          {page + 1} / {PAGES.length}
        </span>
        <button type="button" onClick={next} aria-label="Next page">
          ›
        </button>
      </div>
      <p className="pdf-flipbook__hint">
        Click a page corner or use the arrows to flip
      </p>
    </div>
  )
}
