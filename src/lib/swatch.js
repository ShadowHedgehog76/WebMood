/**
 * Palette tirée d'une image.
 *
 * On réduit l'image à une vignette, on range les pixels dans une grille de couleurs
 * grossière, puis on garde les cases les plus peuplées en écartant celles qui se
 * ressemblent trop. C'est une quantification naïve, mais sur une photo elle donne
 * exactement ce qu'on cherche : les quelques teintes qui portent l'image.
 */

const SIDE = 72 // côté de la vignette d'analyse
const LEVELS = 6 // cases par canal : 6³ = 216 cases, assez fin sans se disperser
const MIN_DISTANCE = 60 // écart minimal entre deux teintes retenues

/** Distance euclidienne dans l'espace RVB : suffisante pour écarter les doublons. */
function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

const toHex = ([r, g, b]) =>
  `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`

/** Saturation approchée, pour départager deux cases aussi peuplées l'une que l'autre. */
function vividness([r, g, b]) {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

async function load(src) {
  const image = new Image()
  // Les images hébergées viennent d'un autre domaine : sans ça, le canvas se salit et
  // la lecture des pixels devient impossible.
  image.crossOrigin = 'anonymous'
  image.src = src
  await image.decode()
  return image
}

/**
 * Rend les `count` teintes dominantes, en hexadécimal, de la plus présente à la moins
 * présente. Lève si l'image ne peut pas être lue (domaine sans en-tête CORS).
 */
export async function paletteOf(src, count = 5) {
  const image = await load(src)
  const ratio = image.naturalWidth / image.naturalHeight || 1
  const w = Math.max(1, Math.round(ratio >= 1 ? SIDE : SIDE * ratio))
  const h = Math.max(1, Math.round(ratio >= 1 ? SIDE / ratio : SIDE))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, w, h)

  let pixels
  try {
    pixels = ctx.getImageData(0, 0, w, h).data
  } catch {
    throw new Error('Cette image ne se laisse pas analyser (elle vient d’un autre domaine).')
  }

  const cells = new Map()
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue // pixel transparent
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]]
    const key = rgb.map((value) => Math.floor((value / 256) * LEVELS)).join(',')
    const cell = cells.get(key) ?? { n: 0, sum: [0, 0, 0] }
    cell.n += 1
    cell.sum[0] += rgb[0]
    cell.sum[1] += rgb[1]
    cell.sum[2] += rgb[2]
    cells.set(key, cell)
  }
  if (!cells.size) throw new Error('Image vide : rien à analyser.')

  const ranked = [...cells.values()]
    .map((cell) => ({ n: cell.n, rgb: cell.sum.map((total) => total / cell.n) }))
    // À poids voisin, la teinte la plus franche l'emporte sur le gris.
    .sort((a, b) => b.n + vividness(b.rgb) * 4 - (a.n + vividness(a.rgb) * 4))

  const kept = []
  for (const candidate of ranked) {
    if (kept.length >= count) break
    if (kept.every((chosen) => distance(chosen, candidate.rgb) >= MIN_DISTANCE)) {
      kept.push(candidate.rgb)
    }
  }
  // Une image qui n'a que trois teintes rend trois teintes : mieux vaut un nuancier
  // court qu'un nuancier rempli de doublons.
  return kept.map(toHex)
}
