/**
 * Pinceaux : la façon dont un trait est posé sur le tableau. Un trait garde ses points
 * bruts ; c'est le pinceau qui décide de son épaisseur, de sa matière et de sa texture.
 *
 * Tout ce qui a l'air aléatoire — le grain du crayon, les gouttes de l'aérographe — est
 * tiré d'un bruit calculé à partir de l'indice du point. Un trait redessiné à chaque
 * déplacement de la vue doit retomber exactement sur le même dessin, sinon il grouille.
 */

import { dashPattern } from './dashes.js'

export const BRUSHES = [
  { key: 'plain', label: 'Stylo', hint: 'Trait d’épaisseur constante' },
  { key: 'brush', label: 'Pinceau', hint: 'S’affine quand la main accélère' },
  { key: 'calligraphy', label: 'Calligraphie', hint: 'Plume large, tenue de biais' },
  { key: 'pencil', label: 'Crayon', hint: 'Grain sec, légèrement transparent' },
  { key: 'spray', label: 'Aérographe', hint: 'Nuage de gouttes' },
  { key: 'neon', label: 'Néon', hint: 'Cœur clair et halo coloré' },
]

/** Seul le stylo suit les motifs de trait : ailleurs, chaque segment les redémarrerait. */
export const DASHABLE_BRUSHES = new Set(['plain'])

const NIB_ANGLE = -Math.PI / 4 // inclinaison de la plume calligraphique

/** Bruit déterministe : même indice, même valeur, d'un repeint à l'autre. */
function noise(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Le trait a-t-il été posé au stylet ? Ses points portent alors une pression. */
export const hasPressure = (points) => points.some((point) => point.p !== undefined)

/**
 * Épaisseur en chaque point, pour les pinceaux qui en font varier. Au stylet, c'est la
 * pression qui commande — c'est ce qu'on attend d'une tablette. À la souris, faute de
 * mieux, c'est la vitesse : une main qui accélère pose moins de matière. Dans les deux
 * cas les bouts s'affinent, comme une plume qu'on lève.
 */
function widths(points, size) {
  const pressure = hasPressure(points)

  const speeds = points.map((point, index) => {
    const previous = points[index - 1] ?? point
    return Math.hypot(point.x - previous.x, point.y - previous.y)
  })

  return points.map((point, index) => {
    let thin
    if (pressure) {
      // Moyenne sur trois points : la pression relevée saute d'un événement à l'autre.
      const window = points.slice(Math.max(0, index - 1), index + 2)
      const force =
        window.reduce((sum, entry) => sum + (entry.p ?? 0.5), 0) / window.length
      thin = 0.25 + force * 1.3
    } else {
      // Moyenne glissante : sans elle, un point isolé ferait un renflement.
      const window = speeds.slice(Math.max(0, index - 2), index + 3)
      const speed = window.reduce((sum, value) => sum + value, 0) / window.length
      thin = Math.max(0.45, Math.min(1.25, 1.25 - speed / 34))
    }

    // Effilage des extrémités, sur les cinq premiers et derniers points.
    const fromStart = Math.min(1, (index + 1) / 5)
    const fromEnd = Math.min(1, (points.length - index) / 5)
    return Math.max(0.4, size * thin * Math.min(fromStart, fromEnd))
  })
}

/** Trait d'épaisseur constante, éventuellement en tirets. */
function paintPlain(ctx, points, stroke, width) {
  if (stroke.dash && stroke.dash !== 'solid') ctx.setLineDash(dashPattern(stroke.dash, width))
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  ctx.stroke()
}

/** Chaque segment porte sa propre épaisseur : le trait enfle et s'affine. */
function paintTapered(ctx, points, sizes) {
  for (let i = 1; i < points.length; i++) {
    ctx.lineWidth = (sizes[i - 1] + sizes[i]) / 2
    ctx.beginPath()
    ctx.moveTo(points[i - 1].x, points[i - 1].y)
    ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
  }
}

/**
 * Plume tenue de biais : chaque segment devient un quadrilatère entre les deux positions
 * du bec. L'épaisseur ne dépend plus de la vitesse mais de la direction du trait.
 */
function paintCalligraphy(ctx, points, width, angle, sizes) {
  ctx.beginPath()
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    // Au stylet, la pression élargit aussi le bec.
    const half = (sizes ? (sizes[i - 1] + sizes[i]) / 2 : width) / 2
    const nib = { x: Math.cos(angle) * half, y: Math.sin(angle) * half }
    ctx.moveTo(a.x - nib.x, a.y - nib.y)
    ctx.lineTo(a.x + nib.x, a.y + nib.y)
    ctx.lineTo(b.x + nib.x, b.y + nib.y)
    ctx.lineTo(b.x - nib.x, b.y - nib.y)
    ctx.closePath()
  }
  ctx.fill()
}

/** Crayon : plusieurs passes fines et décalées, pour un bord qui accroche. */
function paintPencil(ctx, points, width, seed) {
  ctx.globalAlpha *= 0.5
  ctx.lineWidth = Math.max(0.6, width * 0.5)

  for (let pass = 0; pass < 3; pass++) {
    ctx.beginPath()
    for (let i = 0; i < points.length; i++) {
      const wobble = width * 0.28
      const x = points[i].x + (noise(seed + i * 3 + pass * 91) - 0.5) * wobble
      const y = points[i].y + (noise(seed + i * 3 + pass * 91 + 17) - 0.5) * wobble
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

/** Aérographe : un nuage de gouttes autour du trait, dense au centre. */
function paintSpray(ctx, points, width, seed) {
  const radius = width * 1.5
  const drops = Math.max(8, Math.round(width))
  ctx.globalAlpha *= 0.5

  for (let i = 0; i < points.length; i++) {
    for (let drop = 0; drop < drops; drop++) {
      const base = seed + i * 7 + drop * 53
      const angle = noise(base) * Math.PI * 2
      // Racine du tirage : les gouttes se répartissent également sur le disque.
      const distance = Math.sqrt(noise(base + 1)) * radius
      const dot = Math.max(0.5, noise(base + 2) * width * 0.22)
      ctx.beginPath()
      ctx.arc(
        points[i].x + Math.cos(angle) * distance,
        points[i].y + Math.sin(angle) * distance,
        dot,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
  }
}

/** Néon : un halo coloré, puis un cœur clair par-dessus. */
function paintNeon(ctx, points, width, color) {
  const line = () => {
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
  }

  ctx.shadowColor = color
  ctx.shadowBlur = width * 2.2
  ctx.lineWidth = width
  line()
  line() // deux passes : le halo se renforce

  ctx.shadowBlur = 0
  ctx.globalAlpha *= 0.9
  ctx.lineWidth = Math.max(0.8, width * 0.32)
  ctx.strokeStyle = '#ffffff'
  line()
}

/**
 * Peint un trait déjà projeté à l'écran. `points` est en pixels, `width` l'épaisseur à
 * l'écran ; le contexte arrive avec sa couleur et son mode de fusion déjà réglés.
 */
export function paintBrush(ctx, stroke, points, width) {
  if (points.length === 1) {
    ctx.beginPath()
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  // Une graine par trait : deux traits identiques n'auront pas le même grain.
  const seed = (stroke.id ?? '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 7)

  switch (stroke.brush) {
    case 'brush':
      paintTapered(ctx, points, widths(points, width))
      return
    case 'calligraphy':
      // L'inclinaison du stylet à la pose tient lieu d'angle de plume.
      paintCalligraphy(
        ctx,
        points,
        width,
        stroke.tilt ?? NIB_ANGLE,
        hasPressure(points) ? widths(points, width) : null,
      )
      return
    case 'pencil':
      paintPencil(ctx, points, width, seed)
      return
    case 'spray':
      paintSpray(ctx, points, width, seed)
      return
    case 'neon':
      paintNeon(ctx, points, width, stroke.color)
      return
    default:
      paintPlain(ctx, points, stroke, width)
  }
}
