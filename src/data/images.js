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
import bleuprint480 from '../assets/images/cover-bleuprint-480.webp'
import bleuprint960 from '../assets/images/cover-bleuprint-960.webp'
import bleuprint1536 from '../assets/images/cover-bleuprint-1536.webp'
import gph480 from '../assets/images/cover-guide-phishing-480.webp'
import gph960 from '../assets/images/cover-guide-phishing-960.webp'
import gph1536 from '../assets/images/cover-guide-phishing-1536.webp'
import gse480 from '../assets/images/cover-guide-social-engineering-480.webp'
import gse960 from '../assets/images/cover-guide-social-engineering-960.webp'
import gse1536 from '../assets/images/cover-guide-social-engineering-1536.webp'
import grw480 from '../assets/images/cover-guide-ransomware-480.webp'
import grw960 from '../assets/images/cover-guide-ransomware-960.webp'
import grw1536 from '../assets/images/cover-guide-ransomware-1536.webp'
import mcl480 from '../assets/images/cover-mclaren-480.webp'
import mcl960 from '../assets/images/cover-mclaren-960.webp'
import mcl1536 from '../assets/images/cover-mclaren-1536.webp'
import sb001_480 from '../assets/images/cover-security-briefs-ep001-480.webp'
import sb001_960 from '../assets/images/cover-security-briefs-ep001-960.webp'
import sb001_1536 from '../assets/images/cover-security-briefs-ep001-1536.webp'
import gen480 from '../assets/images/cover-genesee-480.webp'
import gen960 from '../assets/images/cover-genesee-960.webp'
import gen1536 from '../assets/images/cover-genesee-1536.webp'
import { SEO_COVERS } from './covers.js'

export const THUMBS = {
  infrastructure: { src: infrastructure240, srcSet: `${infrastructure240} 240w, ${infrastructure480} 480w`, alt: 'Halftone illustration of a telecom tower and a concrete building beneath a large red sun' },
  patch: { src: patch240, srcSet: `${patch240} 240w, ${patch480} 480w`, alt: 'Halftone illustration of a vintage CRT computer with a bandage cross on its dark screen' },
  privacy: { src: privacy240, srcSet: `${privacy240} 240w, ${privacy480} 480w`, alt: 'Halftone illustration of a person wearing headphones beside a wall-mounted CCTV camera, framed by red corner brackets' },
  surveillance: { src: surveillance240, srcSet: `${surveillance240} 240w, ${surveillance480} 480w`, alt: 'Halftone illustration of CCTV cameras mounted on a pole above a building, beneath a large red sun' },
  msOutage: { src: msOutage960, srcSet: `${msOutage480} 480w, ${msOutage960} 960w, ${msOutage1536} 1536w`, wide: true, width: SEO_COVERS.msOutage.width, height: SEO_COVERS.msOutage.height, alt: SEO_COVERS.msOutage.alt },
  genesee: { src: gen960, srcSet: `${gen480} 480w, ${gen960} 960w, ${gen1536} 1536w`, wide: true, width: SEO_COVERS.genesee.width, height: SEO_COVERS.genesee.height, alt: SEO_COVERS.genesee.alt },
  mclaren: { src: mcl960, srcSet: `${mcl480} 480w, ${mcl960} 960w, ${mcl1536} 1536w`, wide: true, width: SEO_COVERS.mclaren.width, height: SEO_COVERS.mclaren.height, alt: SEO_COVERS.mclaren.alt },
  jonathanJames: { src: jj960, srcSet: `${jj480} 480w, ${jj960} 960w, ${jj1448} 1448w`, wide: true, width: SEO_COVERS.jonathanJames.width, height: SEO_COVERS.jonathanJames.height, alt: SEO_COVERS.jonathanJames.alt },
  vendorBreach: { src: vb960, srcSet: `${vb480} 480w, ${vb960} 960w, ${vb1536} 1536w`, wide: true, width: SEO_COVERS.vendorBreach.width, height: SEO_COVERS.vendorBreach.height, alt: SEO_COVERS.vendorBreach.alt },
  fbiNcic: { src: fbi960, srcSet: `${fbi480} 480w, ${fbi960} 960w, ${fbi1536} 1536w`, wide: true, width: SEO_COVERS.fbiNcic.width, height: SEO_COVERS.fbiNcic.height, alt: SEO_COVERS.fbiNcic.alt },
  bleuprint: { src: bleuprint960, srcSet: `${bleuprint480} 480w, ${bleuprint960} 960w, ${bleuprint1536} 1536w`, wide: true, width: SEO_COVERS.bleuprint.width, height: SEO_COVERS.bleuprint.height, alt: SEO_COVERS.bleuprint.alt },
  guidePhishing: { src: gph960, srcSet: `${gph480} 480w, ${gph960} 960w, ${gph1536} 1536w`, wide: true, width: SEO_COVERS.guidePhishing.width, height: SEO_COVERS.guidePhishing.height, alt: SEO_COVERS.guidePhishing.alt },
  guideSocialEngineering: { src: gse960, srcSet: `${gse480} 480w, ${gse960} 960w, ${gse1536} 1536w`, wide: true, width: SEO_COVERS.guideSocialEngineering.width, height: SEO_COVERS.guideSocialEngineering.height, alt: SEO_COVERS.guideSocialEngineering.alt },
  securityBriefsEp001: { src: sb001_960, srcSet: `${sb001_480} 480w, ${sb001_960} 960w, ${sb001_1536} 1536w`, wide: true, width: SEO_COVERS.securityBriefsEp001.width, height: SEO_COVERS.securityBriefsEp001.height, alt: SEO_COVERS.securityBriefsEp001.alt, poster: sb001_1536 },
  guideRansomware: { src: grw960, srcSet: `${grw480} 480w, ${grw960} 960w, ${grw1536} 1536w`, wide: true, width: SEO_COVERS.guideRansomware.width, height: SEO_COVERS.guideRansomware.height, alt: SEO_COVERS.guideRansomware.alt },
}