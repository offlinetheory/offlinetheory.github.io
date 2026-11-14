import arc240 from '../assets/images/thumb-arc-240.webp'
import arc480 from '../assets/images/thumb-arc-480.webp'
import crt240 from '../assets/images/thumb-crt-240.webp'
import crt480 from '../assets/images/thumb-crt-480.webp'
import cctv240 from '../assets/images/thumb-cctv-240.webp'
import cctv480 from '../assets/images/thumb-cctv-480.webp'
import floppy240 from '../assets/images/thumb-floppy-240.webp'
import floppy480 from '../assets/images/thumb-floppy-480.webp'
import cloudOutage240 from '../assets/images/thumb-cloud-outage-240.webp'
import cloudOutage480 from '../assets/images/thumb-cloud-outage-480.webp'

export const THUMBS = {
  arc: { src: arc240, srcSet: `${arc240} 240w, ${arc480} 480w`, alt: 'A thin white arc on a black field' },
  crt: { src: crt240, srcSet: `${crt240} 240w, ${crt480} 480w`, alt: 'A vintage beige CRT computer' },
  cctv: { src: cctv240, srcSet: `${cctv240} 240w, ${cctv480} 480w`, alt: 'A wall-mounted CCTV camera' },
  floppy: { src: floppy240, srcSet: `${floppy240} 240w, ${floppy480} 480w`, alt: 'A black floppy disk' },
  cloudOutage: { src: cloudOutage240, srcSet: `${cloudOutage240} 240w, ${cloudOutage480} 480w`, alt: 'Illustration: a giant navy and yellow cloud cracked down the middle, its power plug dangling loose, as warning triangles, a broken link and a crossed-out envelope rain down on a row of people slumped at blank laptops, one writing on paper' },
}
