import infrastructure240 from '../assets/images/thumb-infrastructure-240.webp'
import infrastructure480 from '../assets/images/thumb-infrastructure-480.webp'
import patch240 from '../assets/images/thumb-patch-240.webp'
import patch480 from '../assets/images/thumb-patch-480.webp'
import privacy240 from '../assets/images/thumb-privacy-240.webp'
import privacy480 from '../assets/images/thumb-privacy-480.webp'
import surveillance240 from '../assets/images/thumb-surveillance-240.webp'
import surveillance480 from '../assets/images/thumb-surveillance-480.webp'
import msOutage480 from '../assets/images/cover-microsoft-outage-480.webp'
import msOutage960 from '../assets/images/cover-microsoft-outage-960.webp'
import msOutage1536 from '../assets/images/cover-microsoft-outage-1536.webp'
import jj480 from '../assets/images/cover-jonathan-james-480.webp'
import jj960 from '../assets/images/cover-jonathan-james-960.webp'
import jj1448 from '../assets/images/cover-jonathan-james-1448.webp'
import vb480 from '../assets/images/cover-vendor-breach-480.webp'
import vb960 from '../assets/images/cover-vendor-breach-960.webp'
import vb1536 from '../assets/images/cover-vendor-breach-1536.webp'
import fbi480 from '../assets/images/cover-fbi-ncic-480.webp'
import fbi960 from '../assets/images/cover-fbi-ncic-960.webp'
import fbi1536 from '../assets/images/cover-fbi-ncic-1536.webp'
import { SEO_COVERS } from './covers.js'

export const THUMBS = {
  infrastructure: { src: infrastructure240, srcSet: `${infrastructure240} 240w, ${infrastructure480} 480w`, alt: 'Halftone illustration of a telecom tower and a concrete building beneath a large red sun' },
  patch: { src: patch240, srcSet: `${patch240} 240w, ${patch480} 480w`, alt: 'Halftone illustration of a vintage CRT computer with a bandage cross on its dark screen' },
  privacy: { src: privacy240, srcSet: `${privacy240} 240w, ${privacy480} 480w`, alt: 'Halftone illustration of a person wearing headphones beside a wall-mounted CCTV camera, framed by red corner brackets' },
  surveillance: { src: surveillance240, srcSet: `${surveillance240} 240w, ${surveillance480} 480w`, alt: 'Halftone illustration of CCTV cameras mounted on a pole above a building, beneath a large red sun' },
  msOutage: { src: msOutage960, srcSet: `${msOutage480} 480w, ${msOutage960} 960w, ${msOutage1536} 1536w`, wide: true, width: SEO_COVERS.msOutage.width, height: SEO_COVERS.msOutage.height, alt: SEO_COVERS.msOutage.alt },
  jonathanJames: { src: jj960, srcSet: `${jj480} 480w, ${jj960} 960w, ${jj1448} 1448w`, wide: true, width: SEO_COVERS.jonathanJames.width, height: SEO_COVERS.jonathanJames.height, alt: SEO_COVERS.jonathanJames.alt },
  vendorBreach: { src: vb960, srcSet: `${vb480} 480w, ${vb960} 960w, ${vb1536} 1536w`, wide: true, width: SEO_COVERS.vendorBreach.width, height: SEO_COVERS.vendorBreach.height, alt: SEO_COVERS.vendorBreach.alt },
  fbiNcic: { src: fbi960, srcSet: `${fbi480} 480w, ${fbi960} 960w, ${fbi1536} 1536w`, wide: true, width: SEO_COVERS.fbiNcic.width, height: SEO_COVERS.fbiNcic.height, alt: SEO_COVERS.fbiNcic.alt },
}
