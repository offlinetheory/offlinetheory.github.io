import arc240 from '../assets/images/thumb-arc-240.webp'
import arc480 from '../assets/images/thumb-arc-480.webp'
import crt240 from '../assets/images/thumb-crt-240.webp'
import crt480 from '../assets/images/thumb-crt-480.webp'
import cctv240 from '../assets/images/thumb-cctv-240.webp'
import cctv480 from '../assets/images/thumb-cctv-480.webp'
import floppy240 from '../assets/images/thumb-floppy-240.webp'
import floppy480 from '../assets/images/thumb-floppy-480.webp'
import deskOutage480 from '../assets/images/photo-desk-outage-480.webp'
import deskOutage960 from '../assets/images/photo-desk-outage-960.webp'
import deskOutage1280 from '../assets/images/photo-desk-outage-1280.webp'

export const THUMBS = {
  arc: { src: arc240, srcSet: `${arc240} 240w, ${arc480} 480w`, alt: 'A thin white arc on a black field' },
  crt: { src: crt240, srcSet: `${crt240} 240w, ${crt480} 480w`, alt: 'A vintage beige CRT computer' },
  cctv: { src: cctv240, srcSet: `${cctv240} 240w, ${cctv480} 480w`, alt: 'A wall-mounted CCTV camera' },
  floppy: { src: floppy240, srcSet: `${floppy240} 240w, ${floppy480} 480w`, alt: 'A black floppy disk' },
  deskOutage: { src: deskOutage960, srcSet: `${deskOutage480} 480w, ${deskOutage960} 960w, ${deskOutage1280} 1280w`, wide: true, width: 1280, height: 720, alt: 'A closed laptop on a pale wooden desk beside a mug of cold coffee and a blank notepad with a pencil, while a small white router glows faintly in the soft-focus background' },
}
