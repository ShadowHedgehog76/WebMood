import { guessLang, langFromName } from './highlight.js'
import { putMedia } from './storage.js'
import { NODE_H, NODE_W, ROOT_H, ROOT_W } from './mindmap.js'
import { SKETCH_TEMPLATES } from './sketch.js'

const MAX_IMAGE_DIM = 1800 // au-delà, on rééchantillonne avant de stocker
/**
 * En deçà de cette taille, un média voyage **dans** le document (`data:`) : il part avec
 * l'export, le partage et la synchronisation. Au-delà, il est rangé à part en `Blob` et
 * le document n'en garde que la clé — c'est ce qui permet d'accueillir un film entier
 * sans faire enfler l'enregistrement à chaque frappe.
 */
const INLINE_BYTES = 8 * 1024 * 1024
/** Plafond absolu : au-delà, même IndexedDB devient déraisonnable. */
const MAX_MEDIA_BYTES = 4 * 1024 * 1024 * 1024
const MEDIA_WIDTH = 480

/** Range le fichier là où son poids l'impose, et rend de quoi le retrouver. */
async function keepFile(file) {
  if (file.size <= INLINE_BYTES) return { src: await readAsDataUrl(file) }
  const key = `blob-${newId()}`
  await putMedia(key, file)
  return { blobKey: key, mime: file.type || 'application/octet-stream', size: file.size }
}
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

/**
 * Interroge un média avant de le poser : ses vraies proportions, sa durée, et pour une
 * vidéo une image de son début.
 *
 * C'est aussi le seul test honnête de lisibilité. `canPlayType` ne connaît que le
 * conteneur et répond « peut-être » à un `.mkv` ou à un `.mov` dont le codec n'est en
 * fait pas décodé — ce qui donne un rectangle noir. Ici on ouvre vraiment le fichier :
 * s'il ne s'ouvre pas, on le sait.
 */
function probeMedia(src, kind) {
  return new Promise((resolve) => {
    const media = document.createElement(kind)
    media.preload = 'metadata'
    media.muted = true
    if (kind === 'video') media.playsInline = true

    const giveUp = setTimeout(() => resolve(null), 5000)
    const done = (value) => {
      clearTimeout(giveUp)
      // On détache la source avant de rendre la main : sans ça, le chargement en cours
      // se poursuit dans le vide et le navigateur signale une erreur réseau à la
      // libération de l'adresse.
      media.removeAttribute('src')
      media.load()
      resolve(value)
    }

    media.onerror = () => done(null)
    media.onloadedmetadata = () => {
      const shape = {
        width: media.videoWidth || 0,
        height: media.videoHeight || 0,
        duration: Number.isFinite(media.duration) ? media.duration : null,
        poster: null,
      }
      // Une piste sonore n'a pas d'image, et une vidéo sans dimensions n'est pas décodée.
      if (kind === 'audio') return done(shape)
      if (!shape.width || !shape.height) return done(null)

      // Une image prise juste après le début : le tout premier cadre est souvent noir.
      media.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = Math.min(640, shape.width)
          canvas.height = Math.round((shape.height / shape.width) * canvas.width)
          canvas.getContext('2d').drawImage(media, 0, 0, canvas.width, canvas.height)
          shape.poster = canvas.toDataURL('image/jpeg', 0.72)
        } catch {
          /* image protégée : on s'en passe */
        }
        done(shape)
      }
      media.onerror = () => done(shape) // les dimensions sont acquises, l'image non
      media.currentTime = Math.min(0.4, (media.duration || 1) / 10)
    }
    media.src = src
  })
}

/** Signale un média que le navigateur n'ouvre pas : l'import en fera une pièce jointe. */
export class Unplayable extends Error {}

/** Durée écrite comme sur un lecteur : 1:04, ou 12:03:40 pour un long métrage. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null
  const total = Math.round(seconds)
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
  return (parts[0] ? parts : parts.slice(1))
    .map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, '0')))
    .join(':')
}

export async function mediaItem(file, at) {
  const kind = mediaKind(file)
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error(`${file.name} dépasse 40 Mo : trop lourd pour le document.`)
  }
  let { w, h } = MEDIA_SHAPE[kind]
  let extra = null

  // On interroge le fichier lui-même, par une adresse d'objet : lire un film de 2 Go
  // en base64 pour découvrir qu'il est illisible serait absurde.
  if (kind !== 'pdf') {
    const probeUrl = URL.createObjectURL(file)
    try {
      const shape = await probeMedia(probeUrl, kind)
      if (!shape) throw new Unplayable(file.name)
      extra = { duration: shape.duration }
      if (kind === 'video') {
        const ratio = shape.width / shape.height
        w = MEDIA_WIDTH
        h = Math.round(MEDIA_WIDTH / ratio)
        extra = { ...extra, ratio, poster: shape.poster }
      }
    } finally {
      URL.revokeObjectURL(probeUrl)
    }
  }

  return {
    id: newId(),
    type: 'media',
    kind,
    name: file.name || kind,
    ...(await keepFile(file)),
    ...extra,
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
 * Un CSV ou un TSV devient un tableau — modifiable, et prêt à porter un graphique. Le
 * séparateur est deviné en comptant : le point-virgule est la norme des tableurs
 * français, la tabulation celle des copier-coller depuis un tableur.
 */
export function sheetTable(text, at) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  const counts = [
    ['\t', (lines[0].match(/\t/g) ?? []).length],
    [';', (lines[0].match(/;/g) ?? []).length],
    [',', (lines[0].match(/,/g) ?? []).length],
  ]
  const separator = counts.sort((a, b) => b[1] - a[1])[0][1] ? counts[0][0] : ','
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

const FONT_SIZE = { w: 400, h: 220 }
const FILE_SIZE = { w: 320, h: 76 }

const extensionOf = (file) => (file.name?.split('.').pop() ?? '').toLowerCase()

/**
 * Spécimen de police. Les fontes sont petites : on les garde entières dans le document,
 * et le bloc les charge dans la page pour les écrire pour de vrai.
 */
export async function fontItem(file, at) {
  return {
    id: newId(),
    type: 'font',
    name: file.name,
    src: await readAsDataUrl(file),
    x: Math.round(at.x - FONT_SIZE.w / 2),
    y: Math.round(at.y - FONT_SIZE.h / 2),
    ...FONT_SIZE,
  }
}

/**
 * Pièce jointe : le dernier recours, pour tout ce que le navigateur ne sait pas montrer.
 * Le fichier reste dans le document et se retélécharge d'un clic — c'est mieux que
 * l'ignorer en silence, ce que faisait l'import jusqu'ici.
 */
export async function fileItem(file, at, why = null) {
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error(`${file.name} dépasse 4 Go : c'est au-delà de ce qu'un navigateur garde.`)
  }
  return {
    id: newId(),
    type: 'file',
    name: file.name || 'fichier',
    ext: extensionOf(file),
    size: file.size,
    why,
    ...(await keepFile(file)),
    x: Math.round(at.x - FILE_SIZE.w / 2),
    y: Math.round(at.y - FILE_SIZE.h / 2),
    ...FILE_SIZE,
  }
}

const FONT_EXTENSIONS = new Set(['ttf', 'otf', 'woff', 'woff2'])
const SHEET_EXTENSIONS = new Set(['csv', 'tsv'])
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])

/**
 * Convertit une liste de fichiers (drop, presse-papiers, sélecteur) en éléments.
 *
 * L'ordre des essais va du plus spécifique au plus général, et se termine par la pièce
 * jointe : plus rien n'est refusé en silence.
 */
export async function itemsFromFiles(files, at) {
  const items = []
  const refused = []
  let index = 0

  for (const file of files) {
    const offset = { x: at.x + index * 24, y: at.y + index * 24 }
    const ext = extensionOf(file)
    try {
      if (file.type.startsWith('image/')) {
        // Certains formats d'image sont annoncés mais pas décodés (le HEIC des iPhone,
        // par exemple) : le fichier reste alors joint plutôt que perdu.
        items.push(
          await imageItem(file, offset).catch(() =>
            fileItem(file, offset, 'image non décodée par le navigateur'),
          ),
        )
      } else if (FONT_EXTENSIONS.has(ext) || file.type.startsWith('font/')) {
        items.push(await fontItem(file, offset))
      } else if (mediaKind(file)) {
        // Un conteneur familier ne dit rien du codec : si le fichier ne s'ouvre pas,
        // mieux vaut une pièce jointe honnête qu'un rectangle noir.
        items.push(
          await mediaItem(file, offset).catch((error) => {
            if (!(error instanceof Unplayable)) throw error
            return fileItem(file, offset, 'codec non lu par le navigateur')
          }),
        )
      } else if (SHEET_EXTENSIONS.has(ext)) {
        items.push(sheetTable(await readAsText(file), offset))
      } else if (MARKDOWN_EXTENSIONS.has(ext)) {
        items.push(markdownItem({ at: offset, text: await readAsText(file) }))
      } else if (isTextFile(file)) {
        items.push(codeItem(await readAsText(file), { name: file.name, at: offset }))
      } else {
        items.push(await fileItem(file, offset))
      }
      index += 1
    } catch (error) {
      refused.push(error.message ?? `${file.name} : import impossible`)
    }
  }
  return { items, refused }
}
