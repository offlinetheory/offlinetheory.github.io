import hero640 from '../assets/images/hero-book-640.webp'
import hero960 from '../assets/images/hero-book-960.webp'
import hero1152 from '../assets/images/hero-book-1152.webp'
import './HeroBook.css'

/** Centerpiece: open-book photograph with the mission statement set in HTML on the pages. */
export default function HeroBook() {
  return (
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
  )
}
