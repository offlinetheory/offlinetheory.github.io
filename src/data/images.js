import arc240 from '../assets/images/thumb-arc-240.webp'
import arc480 from '../assets/images/thumb-arc-480.webp'
import crt240 from '../assets/images/thumb-crt-240.webp'
import crt480 from '../assets/images/thumb-crt-480.webp'
import cctv240 from '../assets/images/thumb-cctv-240.webp'
import cctv480 from '../assets/images/thumb-cctv-480.webp'
import floppy240 from '../assets/images/thumb-floppy-240.webp'
import floppy480 from '../assets/images/thumb-floppy-480.webp'
import msOutage480 from '../assets/images/cover-microsoft-outage-480.webp'
import msOutage960 from '../assets/images/cover-microsoft-outage-960.webp'
import msOutage1536 from '../assets/images/cover-microsoft-outage-1536.webp'

export const THUMBS = {
  arc: { src: arc240, srcSet: `${arc240} 240w, ${arc480} 480w`, alt: 'A thin white arc on a black field' },
  crt: { src: crt240, srcSet: `${crt240} 240w, ${crt480} 480w`, alt: 'A vintage beige CRT computer' },
  cctv: { src: cctv240, srcSet: `${cctv240} 240w, ${cctv480} 480w`, alt: 'A wall-mounted CCTV camera' },
  floppy: { src: floppy240, srcSet: `${floppy240} 240w, ${floppy480} 480w`, alt: 'A black floppy disk' },
  msOutage: { src: msOutage960, srcSet: `${msOutage480} 480w, ${msOutage960} 960w, ${msOutage1536} 1536w`, wide: true, width: 1536, height: 1024, alt: 'Illustration: a beige retro CRT computer on a desk shows a Microsoft \u201cWe\u2019re having trouble connecting right now\u201d screen with a loading spinner, a yellow sticky note on the monitor reads \u201cAgain?\u201d, and a big red sun sets behind the Detroit skyline across the river. A Michigan map is pinned to the wall, and books labeled Cybersecurity, Technology and Internet Culture sit beside a coffee mug, a potted plant and headphones.' },
}
