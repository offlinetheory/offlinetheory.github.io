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
import { SEO_COVERS } from './covers.js'

export const THUMBS = {
  arc: { src: arc240, srcSet: `${arc240} 240w, ${arc480} 480w`, alt: 'A thin white arc on a black field' },
  crt: { src: crt240, srcSet: `${crt240} 240w, ${crt480} 480w`, alt: 'A vintage beige CRT computer' },
  cctv: { src: cctv240, srcSet: `${cctv240} 240w, ${cctv480} 480w`, alt: 'A wall-mounted CCTV camera' },
  floppy: { src: floppy240, srcSet: `${floppy240} 240w, ${floppy480} 480w`, alt: 'A black floppy disk' },
  msOutage: { src: msOutage960, srcSet: `${msOutage480} 480w, ${msOutage960} 960w, ${msOutage1536} 1536w`, wide: true, width: SEO_COVERS.msOutage.width, height: SEO_COVERS.msOutage.height, alt: SEO_COVERS.msOutage.alt },
}
