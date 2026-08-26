/**
 * Blocs visuels : du code exécuté en direct qui produit une vue.
 * Trois modes — canvas 2D, vecteur SVG, 3D (three.js chargé à la demande).
 *
 * Le code vient du tableau de l'utilisateur : il est exécuté tel quel via `new Function`,
 * dans la page. C'est un outil local et personnel, pas un bac à sable.
 */

const TAU = Math.PI * 2
const EXPORT_SCALE = 2

export const SKETCH_MODES = {
  canvas2d: { label: '2D', hint: 'canvas 2D', directive: '2d' },
  svg: { label: 'Vecteur', hint: 'SVG', directive: 'svg' },
  three: { label: '3D', hint: 'three.js', directive: '3d' },
}

const MODE_ALIASES = {
  '2d': 'canvas2d',
  canvas: 'canvas2d',
  canvas2d: 'canvas2d',
  svg: 'svg',
  vecteur: 'svg',
  vector: 'svg',
  '3d': 'three',
  three: 'three',
  webgl: 'three',
}

/**
 * Le type d'affichage est déclaré dans le code lui-même :
 *   // @mode 3d   (ou @type svg, ou simplement @2d)
 */
/**
 * Réécrit la directive de tête pour changer de moteur sans toucher au reste du code.
 * Le code reste la source de vérité : la barre de réglages ne fait que l'éditer.
 */
export function withMode(code = '', mode = 'canvas2d') {
  const directive = SKETCH_MODES[mode]?.directive ?? '2d'
  const head = code.slice(0, 400)

  const tagged = head.match(/@(?:mode|type)\s+[\w-]+/i)
  if (tagged) return code.replace(tagged[0], `@mode ${directive}`)

  const bare = head.match(/@(?:2d|3d|svg|vecteur|vector|canvas|three|webgl)\b/i)
  if (bare) return code.replace(bare[0], `@${directive}`)

  return `// @mode ${directive}\n${code}`
}

export function parseMode(code = '', fallback = 'canvas2d') {
  const head = code.slice(0, 400)
  const tagged = head.match(/@(?:mode|type)\s+([\w-]+)/i) ?? head.match(/@(2d|3d|svg|vecteur|vector|canvas|three|webgl)\b/i)
  return MODE_ALIASES[tagged?.[1]?.toLowerCase()] ?? fallback
}

export const SKETCH_TEMPLATES = {
  canvas2d: `// @mode 2d — ctx, canvas, width, height, loop(t => …), TAU
const cx = width / 2
const cy = height / 2

ctx.fillStyle = '#0f1116'
ctx.fillRect(0, 0, width, height)

loop((t) => {
  ctx.fillStyle = 'rgba(15, 17, 22, 0.16)'
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + t * 0.5
    const r = 46 + Math.sin(t * 1.4 + i * 0.25) * 30
    ctx.fillStyle = \`hsl(\${(i * 7 + t * 50) % 360} 85% 64%)\`
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3.5, 0, TAU)
    ctx.fill()
  }
})
`,
  svg: `// @mode svg — renvoie du SVG. h(tag, attrs) construit un élément.
const parts = [h('rect', { width, height, fill: '#fdfdfe' })]

for (let i = 0; i < 28; i++) {
  const a = (i / 28) * TAU
  parts.push(h('line', {
    x1: width / 2 + Math.cos(a) * 34,
    y1: height / 2 + Math.sin(a) * 34,
    x2: width / 2 + Math.cos(a) * 92,
    y2: height / 2 + Math.sin(a) * 92,
    stroke: \`hsl(\${i * 13} 72% 58%)\`,
    'stroke-width': 4,
    'stroke-linecap': 'round',
  }))
}

parts.push(h('circle', { cx: width / 2, cy: height / 2, r: 22, fill: '#1c1c1e' }))
return parts.join('')
`,
  three: `// @mode 3d — THREE, scene, camera, renderer, loop(t => …)
const mesh = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.25, 0),
  new THREE.MeshStandardMaterial({ color: '#8b5cf6', flatShading: true, roughness: 0.4 }),
)
scene.add(mesh)

scene.add(new THREE.HemisphereLight('#ffffff', '#2a2a3a', 1.1))
const key = new THREE.DirectionalLight('#ffffff', 1.6)
key.position.set(2, 3, 4)
scene.add(key)

camera.position.set(0, 0, 4)

loop((t) => {
  mesh.rotation.x = t * 0.55
  mesh.rotation.y = t * 0.85
})
`,
}

const ATTR_ESCAPES = { '&': '&amp;', '<': '&lt;', '"': '&quot;' }

/** Petit constructeur d'éléments SVG sous forme de chaîne. */
function h(tag, attrs = {}, inner = '') {
  const serialized = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${key}="${String(value).replace(/[&<"]/g, (c) => ATTR_ESCAPES[c])}"`)
    .join(' ')
  return `<${tag}${serialized ? ` ${serialized}` : ''}>${inner}</${tag}>`
}

function svgDocument(markup, width, height) {
  const body = markup.trim().startsWith('<svg')
    ? markup
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${markup}</svg>`
  return body.includes('xmlns')
    ? body
    : body.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
}

function rasterize(markup, width, height) {
  return new Promise((resolve, reject) => {
    const source = svgDocument(markup, width, height)
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * EXPORT_SCALE)
      canvas.height = Math.round(height * EXPORT_SCALE)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve({ src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height })
    }
    image.onerror = () => reject(new Error('SVG non rasterisable'))
    image.src = url
  })
}

/**
 * Exécute un bloc visuel dans `container`.
 * Renvoie une poignée : { destroy, setPaused, capture, mode }.
 */
export async function createSketch({ container, mode, code, width, height, onError }) {
  // Chaque exécution possède sa propre racine, superposée aux autres : deux instances
  // peuvent coexister le temps qu'une nouvelle version prenne le relais (et l'ancienne
  // reste affichée si le nouveau code échoue).
  const root = document.createElement('div')
  root.className = 'sketch__root'
  container.append(root)

  const w = Math.max(1, Math.round(width))
  const hgt = Math.max(1, Math.round(height))
  const frames = []
  let raf = 0
  let paused = false
  let destroyed = false
  let start = null

  const loop = (callback) => {
    if (typeof callback === 'function') frames.push(callback)
  }

  const tick = (now) => {
    raf = requestAnimationFrame(tick)
    if (paused || destroyed) return
    if (start === null) start = now
    const t = (now - start) / 1000
    try {
      for (const frame of frames) frame(t)
      afterFrame?.()
    } catch (error) {
      cancelAnimationFrame(raf)
      raf = 0
      onError?.(error)
    }
  }

  let afterFrame = null
  let teardown = null
  let capture = async () => null

  if (mode === 'svg') {
    const host = document.createElement('div')
    host.className = 'sketch__svg'
    root.append(host)

    const fn = new Function('width', 'height', 'h', 'TAU', code)
    const markup = String(fn(w, hgt, h, TAU) ?? '')
    host.innerHTML = svgDocument(markup, w, hgt)
    capture = () => rasterize(markup, w, hgt)
  } else if (mode === 'three') {
    const THREE = await import('three')
    if (destroyed) {
      root.remove()
      return { destroy() {}, setPaused() {}, capture: async () => null, mode }
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.setPixelRatio(EXPORT_SCALE)
    renderer.setSize(w, hgt, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    root.append(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, w / hgt, 0.1, 1000)
    camera.position.z = 4

    const fn = new Function('THREE', 'scene', 'camera', 'renderer', 'width', 'height', 'loop', 'TAU', code)
    fn(THREE, scene, camera, renderer, w, hgt, loop, TAU)

    afterFrame = () => renderer.render(scene, camera)
    renderer.render(scene, camera)

    capture = async () => {
      renderer.render(scene, camera)
      const canvas = renderer.domElement
      return { src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
    }

    teardown = () => {
      renderer.dispose()
      renderer.forceContextLoss?.()
      scene.traverse((object) => {
        object.geometry?.dispose?.()
        const material = object.material
        if (Array.isArray(material)) material.forEach((m) => m.dispose?.())
        else material?.dispose?.()
      })
    }
  } else {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * EXPORT_SCALE)
    canvas.height = Math.round(hgt * EXPORT_SCALE)
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    root.append(canvas)

    const ctx = canvas.getContext('2d')
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE)

    const fn = new Function('ctx', 'canvas', 'width', 'height', 'loop', 'TAU', code)
    fn(ctx, canvas, w, hgt, loop, TAU)

    capture = async () => ({
      src: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    })
  }

  if (frames.length) raf = requestAnimationFrame(tick)

  return {
    mode,
    animated: frames.length > 0,
    setPaused(value) {
      paused = value
      if (!paused && start !== null) start = null
    },
    capture: () => capture(),
    destroy() {
      destroyed = true
      if (raf) cancelAnimationFrame(raf)
      teardown?.()
      root.remove()
    },
  }
}
