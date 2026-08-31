import { guessLang, langFromName } from './highlight.js'
import { NODE_H, NODE_W, ROOT_H, ROOT_W } from './mindmap.js'
import { SKETCH_TEMPLATES } from './sketch.js'

const MAX_IMAGE_DIM = 1800 // au-delà, on rééchantillonne avant de stocker
// Un média voyage en `data:` dans le document : au-delà, on refuse plutôt que d'alourdir
// l'enregistrement, la synchronisation et l'envoi en ligne.
const MAX_MEDIA_BYTES = 40 * 1024 * 1024
const MEDIA_WIDTH = 480
const DEFAULT_IMAGE_WIDTH = 420
const CODE_WIDTH = 460
const CODE_LINE_HEIGHT = 20

const TEXT_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h',
  'cpp', 'cc', 'cs', 'php', 'swift', 'css', 'scss', 'less', 'html', 'htm', 'xml', 'json',
  'yml', 'yaml', 'toml', 'ini', 'env', 'md', 'txt', 'sh', 'bash', 'zsh', 'sql', 'csv', 'log',
])

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 11)}`
}

export function isTextFile(file) {
  if (file.type.startsWith('text/')) return true
  if (file.type === 'application/json') return true
  const ext = file.name?.split('.').pop()?.toLowerCase()
  return Boolean(ext && TEXT_EXTENSIONS.has(ext))
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image illisible'))
    image.src = src
  })
}

/** Rééchantillonne les très grandes images pour garder un document raisonnable. */
async function normalizeImage(dataUrl, type) {
  const image = await loadImage(dataUrl)
  const { naturalWidth: w, naturalHeight: h } = image
  const animated = type === 'image/gif' || type === 'image/svg+xml'

  if (animated || Math.max(w, h) <= MAX_IMAGE_DIM) {
    return { src: dataUrl, width: w, height: h }
  }

  const ratio = MAX_IMAGE_DIM / Math.max(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * ratio)
  canvas.height = Math.round(h * ratio)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const keepsAlpha = type === 'image/png' || type === 'image/webp'
  const out = canvas.toDataURL(keepsAlpha ? 'image/png' : 'image/jpeg', 0.92)
  return { src: out, width: canvas.width, height: canvas.height }
}

export async function imageItem(file, at) {
  const raw = await readAsDataUrl(file)
  const { src, width, height } = await normalizeImage(raw, file.type)
  const w = Math.min(DEFAULT_IMAGE_WIDTH, width)
  const h = Math.round((height / width) * w) || w

  return {
    id: newId(),
    type: 'image',
    name: file.name || 'image',
    src,
    ratio: width / height,
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w,
    h,
  }
}

/** Vidéo, son ou PDF : trois façons de lire, un seul type de bloc. */
export function mediaKind(file) {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type === 'application/pdf') return 'pdf'
  return null
}

const MEDIA_SHAPE = {
  video: { w: MEDIA_WIDTH, h: Math.round(MEDIA_WIDTH / (16 / 9)) },
  audio: { w: 360, h: 92 },
  pdf: { w: 420, h: 560 },
}

export async function mediaItem(file, at) {
  const kind = mediaKind(file)
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error(`${file.name} dépasse 40 Mo : trop lourd pour le document.`)
  }
  const src = await readAsDataUrl(file)
  const { w, h } = MEDIA_SHAPE[kind]

  return {
    id: newId(),
    type: 'media',
    kind,
    name: file.name || kind,
    src,
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w,
    h,
  }
}

export function codeItem(text, { name = '', at, lang } = {}) {
  // L'extension prime ; à défaut (extrait collé), on devine d'après le contenu.
  const byName = name ? langFromName(name) : 'texte'
  const lines = text.split('\n').length
  const h = Math.max(96, Math.min(520, lines * CODE_LINE_HEIGHT + 52))

  return {
    id: newId(),
    type: 'code',
    name,
    lang: lang || (byName !== 'texte' ? byName : guessLang(text)),
    text,
    x: Math.round((at?.x ?? 0) - CODE_WIDTH / 2),
    y: Math.round((at?.y ?? 0) - h / 2),
    w: CODE_WIDTH,
    h,
  }
}

const SKETCH_SIZE = { w: 620, h: 320 }

/** Bloc visuel : du code exécuté en direct (2D, vecteur, 3D). */
export function sketchItem(mode = 'canvas2d', at = { x: 0, y: 0 }) {
  return {
    id: newId(),
    type: 'sketch',
    name: 'visuel',
    mode,
    code: SKETCH_TEMPLATES[mode],
    x: Math.round(at.x - SKETCH_SIZE.w / 2),
    y: Math.round(at.y - SKETCH_SIZE.h / 2),
    ...SKETCH_SIZE,
  }
}

/** Note de texte : « note » (fond coloré) ou « plain » (texte seul). */
export function textItem({ at = { x: 0, y: 0 }, color = '#f5a623', variant = 'note', text = '' } = {}) {
  const w = variant === 'note' ? 250 : 320
  const h = variant === 'note' ? 180 : 96
  return {
    id: newId(),
    type: 'text',
    variant,
    text,
    color,
    size: 16,
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w,
    h,
  }
}

const MAP_SIZE = { w: 420, h: 300 }

/** Bloc carte : une fenêtre sur le monde, centrée quelque part. */
export function mapItem({ at = { x: 0, y: 0 }, lat = 48.8566, lon = 2.3522, zoom = 12 } = {}) {
  return {
    id: newId(),
    type: 'map',
    lat,
    lon,
    zoom,
    pins: [],
    x: Math.round(at.x - MAP_SIZE.w / 2),
    y: Math.round(at.y - MAP_SIZE.h / 2),
    ...MAP_SIZE,
  }
}

const MARKDOWN_SIZE = { w: 380, h: 260 }

/** Bloc markdown : le texte source, rendu à la volée. */
export function markdownItem({ at = { x: 0, y: 0 }, color = '#3b82f6', text = '' } = {}) {
  return {
    id: newId(),
    type: 'markdown',
    text,
    color,
    x: Math.round(at.x - MARKDOWN_SIZE.w / 2),
    y: Math.round(at.y - MARKDOWN_SIZE.h / 2),
    ...MARKDOWN_SIZE,
  }
}

const TABLE_SIZE = { w: 460, h: 200 }

/** Tableau : une grille de cellules, la première ligne servant d'en-tête. */
export function tableItem({ at = { x: 0, y: 0 }, columns = 3, rows = 3, color = '#3b82f6' } = {}) {
  return {
    id: newId(),
    type: 'table',
    color,
    cells: Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => (row === 0 ? `Colonne ${column + 1}` : '')),
    ),
    x: Math.round(at.x - TABLE_SIZE.w / 2),
    y: Math.round(at.y - TABLE_SIZE.h / 2),
    ...TABLE_SIZE,
  }
}

const CHART_SIZE = { w: 420, h: 280 }

/** Graphique lié à un tableau du board : il n'a pas de données à lui. */
export function chartItem({ source, at = { x: 0, y: 0 }, chart = 'column', title = '' } = {}) {
  return {
    id: newId(),
    type: 'chart',
    chart,
    source,
    title,
    x: Math.round(at.x - CHART_SIZE.w / 2),
    y: Math.round(at.y - CHART_SIZE.h / 2),
    ...CHART_SIZE,
  }
}

/**
 * Un CSV devient un tableau — modifiable, et prêt à porter un graphique. Le séparateur
 * est deviné : le point-virgule est la norme des tableurs français.
 */
export function csvTable(text, at) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const separator = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const cells = lines
    .slice(0, 200)
    .map((line) => line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, '')))

  const columns = Math.max(...cells.map((row) => row.length))
  const w = Math.max(TABLE_SIZE.w, Math.min(900, columns * 120))
  const h = Math.max(TABLE_SIZE.h, Math.min(600, cells.length * 30 + 12))

  return {
    id: newId(),
    type: 'table',
    color: '#3b82f6',
    cells: cells.map((row) => [...row, ...Array(columns - row.length).fill('')]),
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w,
    h,
  }
}

/** Nœud de carte mentale. Sans parent, c'est le nœud principal. */
export function nodeItem({
  at = { x: 0, y: 0 },
  parent = null,
  side = 'right',
  color = '#3b82f6',
  layout = 'mindmap',
  text,
}) {
  const root = !parent
  const w = root ? ROOT_W : NODE_W
  const h = root ? ROOT_H : NODE_H
  return {
    id: newId(),
    type: 'node',
    text: text ?? (root ? 'Sujet' : 'Idée'),
    parent,
    side,
    color,
    // La disposition est portée par la racine et vaut pour tout l'arbre.
    ...(root ? { layout } : null),
    done: false,
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w,
    h,
  }
}

/** Zone de groupe : bande de couleur + zone de dépôt, les blocs posés dedans la suivent. */
export function groupItem(at = { x: 0, y: 0 }, color = '#3b82f6') {
  const w = 780
  const h = 460
  return {
    id: newId(),
    type: 'group',
    name: 'Groupe',
    color,
    autoSort: false,
    members: [],
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w,
    h,
  }
}

/** Image issue de la capture d'un bloc visuel : même taille que l'aperçu à l'écran. */
export function imageItemFromShot(source, shot) {
  const w = Math.min(720, Math.max(240, Math.round(shot.width / 2)))
  return {
    id: newId(),
    type: 'image',
    name: `${source.name || 'visuel'}.png`,
    src: shot.src,
    ratio: shot.width / shot.height,
    x: Math.round(source.x + source.w + 36),
    y: source.y,
    w,
    h: Math.round((shot.height / shot.width) * w),
  }
}

/** Convertit une liste de fichiers (drop, presse-papiers, sélecteur) en éléments. */
export async function itemsFromFiles(files, at) {
  const items = []
  let index = 0

  for (const file of files) {
    const offset = { x: at.x + index * 24, y: at.y + index * 24 }
    try {
      if (file.type.startsWith('image/')) {
        items.push(await imageItem(file, offset))
      } else if (mediaKind(file)) {
        items.push(await mediaItem(file, offset))
      } else if (/\.csv$/i.test(file.name ?? '')) {
        items.push(csvTable(await readAsText(file), offset))
      } else if (isTextFile(file)) {
        items.push(codeItem(await readAsText(file), { name: file.name, at: offset }))
      } else {
        continue
      }
      index += 1
    } catch (error) {
      console.warn(`Import impossible : ${file.name}`, error)
    }
  }
  return items
}
