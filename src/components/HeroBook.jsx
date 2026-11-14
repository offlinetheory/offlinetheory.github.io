import hero640 from '../assets/images/hero-book-640.webp'
import hero960 from '../assets/images/hero-book-960.webp'
import hero1152 from '../assets/images/hero-book-1152.webp'
import hand206 from '../assets/images/hero-hand-206.webp'
import hand412 from '../assets/images/hero-hand-412.webp'
import './HeroBook.css'

/** Centerpiece: open-book photograph with the mission statement set in HTML on the pages. */
export default function HeroBook() {
  return (
    <div className="hero-wrap">
    <figure className="hero-book">
      <img
        className="hero-book__img"
        src={hero960}
        srcSet={`${hero640} 640w, ${hero960} 960w, ${hero1152} 1152w`}
        sizes="(max-width: 760px) 100vw, (max-width: 1100px) 58vw, 57vw"
        width="1152" height="728"
        alt="An open blank book on a beige stone surface, a hand lifting the corner of the right-hand page"
        fetchpriority="high" decoding="async"
      />
      <figcaption className="hero-book__text">
        <p>
          <span>Offline Theory is an</span>{' '}
          <span>independent publishing</span>{' '}
          <span>initiative exploring</span>{' '}
          <span>cybersecurity, technology,</span>{' '}
          <span>and the culture of the internet.</span>
        </p>
        <hr aria-hidden="true" />
      </figcaption>
    </figure>
    {/* Pop-out layer: the hand cut from the same photo (alpha mask only), sitting
        exactly over its original pixels and rising above the photo frame. */}
    <img className="hero-book__hand" src={hand206}
      srcSet={`${hand206} 206w, ${hand412} 412w`}
      sizes="(max-width: 900px) 36vw, 20.4vw"
      width="412" height="132" alt="" aria-hidden="true"
      fetchpriority="high" decoding="async" />
    </div>
  )
}
