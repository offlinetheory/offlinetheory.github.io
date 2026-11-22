import * as THREE from 'three'

const SEG_X = 90
const SEG_Y = 70

const VERT = /* glsl */ `
uniform float uProgress;
uniform vec2 uSize;
uniform float uTilt;
uniform float uRadius;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying float vLift;
varying float vPhi;

vec3 curlPoint(vec3 p, float e, float W, float H, float tilt, float R) {
  // p.x is 0 at the spine, W at the fore-edge. p.y is 0 at the top.
  vec3 settled = vec3(-p.x, p.y, 0.0);
  if (e <= 0.0001) return p;
  if (e >= 0.999 || R < 0.35) return settled;

  float c = cos(tilt);
  float s = sin(tilt);
  // y=0 is the bottom of the page, so the bottom-right corner leads.
  float proj = p.x * c + (H - p.y) * s;
  float projMax = W * c + H * s;
  // Fold starts at the outer corner (projMax) and travels toward the spine,
  // then a little past it so the sheet can lie down on the left.
  float curlP = mix(projMax, -3.14159265 * R, e);
  // Points with proj > curlP (closer to the fore-edge) have already been reached.
  float wrap = proj - curlP;

  vec3 curled = p;
  if (wrap <= 0.0) {
    curled = p;
  } else if (wrap < 3.14159265 * R) {
    float phi = wrap / R;
    float along = R * (1.0 - cos(phi));
    // Move from the right of the fold onto the cylinder, toward the spine / left.
    float dproj = -(wrap + along);
    curled = vec3(p.x + dproj * c, p.y - dproj * s, R * sin(phi));
  } else {
    // Past a half-turn the sheet lays flat, continuing from the cylinder exit
    // at dproj = -(πR + 2R). Extra length past πR extends in the same direction.
    float dproj = -(wrap + 2.0 * R);
    curled = vec3(p.x + dproj * c, p.y - dproj * s, 0.0);
  }

  // Settle the sheet only in the last few percent of the turn: until then
  // keep a real roll, so the page never thins to a flat edge late in the turn.
  float k = smoothstep(0.94, 0.995, e);
  return mix(curled, settled, k);
}

void main() {
  vUv = uv;
  float W = uSize.x;
  float H = uSize.y;
  float e = clamp(uProgress, 0.0, 1.0);
  float R = max(uRadius, 0.0001);

  vec3 p = curlPoint(position, e, W, H, uTilt, R);
  vec3 px = curlPoint(position + vec3(0.6, 0.0, 0.0), e, W, H, uTilt, R);
  vec3 py = curlPoint(position + vec3(0.0, 0.6, 0.0), e, W, H, uTilt, R);
  vec3 n = normalize(cross(px - p, py - p));
  // Keep a consistent facing so backface detection stays stable
  if (n.z < 0.0 && e < 0.5) n = -n;

  vWorldNormal = normalize(normalMatrix * n);
  vLift = p.z;
  float c = cos(uTilt);
  float s = sin(uTilt);
  float proj = position.x * c + (H - position.y) * s;
  float curlP = mix(W * c + H * s, -3.14159265 * R, e);
  vPhi = max(0.0, proj - curlP) / R;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const FRAG = /* glsl */ `
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform float uProgress;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying float vLift;
varying float vPhi;

void main() {
  bool faceFront = gl_FrontFacing;
  vec2 uv = vUv;
  vec4 ink;
  if (faceFront) {
    ink = texture2D(uFront, uv);
  } else {
    ink = texture2D(uBack, vec2(1.0 - uv.x, uv.y));
  }

  vec3 n = normalize(vWorldNormal);
  if (!faceFront) n = -n;
  float light = 0.82 + 0.18 * clamp(dot(n, normalize(vec3(0.2, -0.4, 0.9))), -1.0, 1.0);
  // Crease / roll shade: darker where the paper bends
  float crease = smoothstep(0.15, 1.2, vPhi) * smoothstep(3.0, 1.2, vPhi);
  light *= 1.0 - crease * 0.42;
  // Slight self-shadow on the lifted sheet
  light *= 1.0 - clamp(vLift / 80.0, 0.0, 1.0) * 0.08;

  // Paper thickness: a cream edge when the normal is nearly sideways
  float edge = smoothstep(0.55, 0.15, abs(n.z));
  vec3 paperEdge = vec3(0.93, 0.91, 0.86);
  vec3 color = mix(ink.rgb * light, paperEdge, edge * 0.85);

  gl_FragColor = vec4(color, 1.0);
}
`

const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SHADOW_FRAG = /* glsl */ `
uniform float uProgress;
uniform float uDir;
uniform vec2 uPageMin;
uniform vec2 uPageMax;
uniform float uRadius;
varying vec2 vUv;

void main() {
  // vUv is 0..1 over the magazine, y-up. Convert to photo-down for page boxes.
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  float e = clamp(uProgress, 0.0, 1.0);
  if (e <= 0.001 || e >= 0.995) {
    gl_FragColor = vec4(0.0);
    return;
  }
  // Contact shadow under the lifted curl, sliding from the right (or left) toward the spine
  float spine = (uPageMin.x + (uDir > 0.0 ? 0.0 : (uPageMax.x - uPageMin.x)));
  // For a forward turn, shadow sits on the right page and then the left as the sheet crosses
  float left = uPageMin.x;
  float right = uPageMax.x;
  float top = uPageMin.y;
  float bot = uPageMax.y;
  // Fold's ground projection: stays on the spread, never in the studio.
  float band = uDir > 0.0
    ? mix(right, left, e)
    : mix(left, right, e);
  float dx = p.x - band;
  float insideY = smoothstep(top - 0.01, top + 0.01, p.y) * smoothstep(bot + 0.01, bot - 0.01, p.y);
  float insideX = smoothstep(left, left + 0.01, p.x) * smoothstep(right, right - 0.01, p.x);
  // Wider, softer as the page is higher mid-turn
  float lift = sin(e * 3.14159265);
  float sigma = mix(0.012, 0.05, lift);
  float shade = exp(-0.5 * (dx * dx) / (sigma * sigma));
  float alpha = shade * insideY * insideX * 0.38 * lift;
  gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
}
`

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        // Mipmaps + anisotropy keep the back-side type sharp while the
        // sheet is foreshortened mid-turn; plain linear minification
        // blurred it at glancing angles.
        tex.generateMipmaps = true
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.anisotropy = 8
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

export function supportsWebGL() {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function createPageCurlEngine(canvas, layout) {
  const { photoWidth: PW, photoHeight: PH } = layout
  const right = layout.right
  const left = layout.left
  const spineX = layout.spineX * PW
  const rightRect = {
    x: right.left * PW,
    y: right.top * PH,
    w: right.width * PW,
    h: right.height * PH,
  }
  const leftRect = {
    x: left.left * PW,
    y: left.top * PH,
    w: left.width * PW,
    h: left.height * PH,
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  // Y-up orthographic camera. Photo y (down) is converted with toY().
  const toY = (photoY) => PH - photoY
  const camera = new THREE.OrthographicCamera(0, PW, PH, 0, 0.1, 2000)
  camera.position.set(0, 0, 200)
  camera.rotation.set(0, 0, 0)
  camera.updateProjectionMatrix()

  const placeholder = new THREE.Texture()

  const underMat = (opts = {}) => new THREE.MeshBasicMaterial({
    map: placeholder,
    color: 0xffffff,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    ...opts,
  })

  const underLeft = new THREE.Mesh(
    new THREE.PlaneGeometry(leftRect.w, leftRect.h),
    underMat({ transparent: true, opacity: 1 }),
  )
  underLeft.position.set(leftRect.x + leftRect.w / 2, toY(leftRect.y + leftRect.h / 2), -2)
  scene.add(underLeft)

  const underRight = new THREE.Mesh(
    new THREE.PlaneGeometry(rightRect.w, rightRect.h),
    underMat(),
  )
  underRight.position.set(rightRect.x + rightRect.w / 2, toY(rightRect.y + rightRect.h / 2), -2)
  scene.add(underRight)

  const shadowMat = new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uDir: { value: 1 },
      uPageMin: { value: new THREE.Vector2(leftRect.x / PW, leftRect.y / PH) },
      uPageMax: { value: new THREE.Vector2(rightRect.x / PW + rightRect.w / PW, rightRect.y / PH + rightRect.h / PH) },
      uRadius: { value: 40 },
    },
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, PH),
    shadowMat,
  )
  shadow.position.set(PW / 2, PH / 2, -1)
  // Plane UV (0,0) is the world bottom-left = photo bottom; flip in the shader.
  scene.add(shadow)

  const geo = new THREE.PlaneGeometry(rightRect.w, rightRect.h, SEG_X, SEG_Y)
  geo.translate(rightRect.w / 2, rightRect.h / 2, 0) // x: 0..W (spine to edge), y: 0..H (bottom to top)

  const curlMat = new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uSize: { value: new THREE.Vector2(rightRect.w, rightRect.h) },
      uTilt: { value: 17 * Math.PI / 180 },
      uRadius: { value: rightRect.w * 0.16 },
      uFront: { value: placeholder },
      uBack: { value: placeholder },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
  })
  const curl = new THREE.Mesh(geo, curlMat)
  curl.position.set(spineX, toY(rightRect.y + rightRect.h), 0)
  scene.add(curl)

  const state = {
    progress: 0,
    direction: 1,
    visible: true,
  }

  function radiusFor(progress) {
    const e = Math.min(Math.max(progress, 0), 1)
    // Comfortable roll mid-turn. Keep a real roll late in the turn too:
    // the old sin curve collapsed to ~0 by e=0.97, so the sheet thinned to
    // a flat edge. The floor holds the curl until the last ~5%, then lets
    // it settle quickly onto the left page.
    const base = rightRect.w * 0.17 * Math.sin(Math.PI * Math.min(Math.max(e, 0.001), 0.999))
    const floor = rightRect.w * 0.08 * (1 - smoothstep(0.93, 0.985, e))
    return Math.max(base, floor)
  }

  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }

  function apply() {
    const e = state.progress
    const R = radiusFor(e)
    curlMat.uniforms.uProgress.value = e
    curlMat.uniforms.uRadius.value = Math.max(R, 0.15)
    curlMat.uniforms.uTilt.value = (state.direction > 0 ? 17 : -17) * Math.PI / 180
    shadowMat.uniforms.uProgress.value = e
    shadowMat.uniforms.uDir.value = state.direction
    shadowMat.uniforms.uRadius.value = R
    curl.scale.x = state.direction
    curl.position.x = spineX
    curl.position.y = toY((state.direction > 0 ? rightRect.y + rightRect.h : leftRect.y + leftRect.h))
    curl.visible = state.visible && e < 0.999
    // When nearly settled, the under-left already holds the landed texture
    if (e >= 0.999) curl.visible = false
  }

  function render() {
    apply()
    renderer.render(scene, camera)
  }

  function setSize(cssWidth, cssHeight) {
    const w = Math.max(1, Math.round(cssWidth))
    const h = Math.max(1, Math.round(cssHeight))
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w, h, false)
    render()
  }

  function setProgress(p) {
    state.progress = Math.min(Math.max(p, 0), 1)
  }

  function setDirection(dir) {
    state.direction = dir >= 0 ? 1 : -1
  }

  function setCurlVisible(v) {
    state.visible = v
  }

  function setUnderVisibility({ left: l, right: r }) {
    if (l !== undefined) underLeft.visible = l
    if (r !== undefined) underRight.visible = r
  }

  function setMaps({ front, back, underLeft: ul, underRight: ur }) {
    if (front) curlMat.uniforms.uFront.value = front
    if (back) curlMat.uniforms.uBack.value = back
    if (ul) {
      underLeft.material.map = ul
      underLeft.material.needsUpdate = true
      underLeft.visible = true
    } else if (ul === null) {
      underLeft.visible = false
    }
    if (ur) {
      underRight.material.map = ur
      underRight.material.needsUpdate = true
      underRight.visible = true
    }
  }

  const textureCache = new Map()
  async function texture(url) {
    if (!url) return null
    if (textureCache.has(url)) return textureCache.get(url)
    const tex = await loadTexture(url)
    textureCache.set(url, tex)
    return tex
  }

  function dispose() {
    geo.dispose()
    curlMat.dispose()
    shadowMat.dispose()
    underLeft.material.dispose()
    underRight.material.dispose()
    underLeft.geometry.dispose()
    underRight.geometry.dispose()
    shadow.geometry.dispose()
    textureCache.forEach((t) => t.dispose())
    textureCache.clear()
    renderer.dispose()
  }

  return {
    setSize,
    setProgress,
    setDirection,
    setCurlVisible,
    setUnderVisibility,
    setMaps,
    texture,
    render,
    dispose,
    ease: easeInOutCubic,
    get progress() { return state.progress },
  }
}

export { easeInOutCubic }
