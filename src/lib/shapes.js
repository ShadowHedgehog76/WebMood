/** Formes vectorielles posées sur le tableau. */

export const SHAPES = [
  { key: 'rect', label: 'Rectangle' },
  { key: 'ellipse', label: 'Ellipse' },
  { key: 'triangle', label: 'Triangle' },
  { key: 'diamond', label: 'Losange' },
  { key: 'line', label: 'Ligne' },
  { key: 'arrow', label: 'Flèche' },
  { key: 'free', label: 'Main levée' },
  { key: 'arc', label: 'Arc' },
]

/** Formes fermées : les seules qui acceptent un remplissage. */
export const CLOSED = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'free'])

/** Formes tracées d'un geste continu plutôt qu'en étirant un cadre. */
export const DRAWN = new Set(['free'])

export const DEFAULT_SHAPE_SIZE = { w: 180, h: 130 }
const MIN_DRAWN = 12

/** Normalise un rectangle tracé (les deux coins peuvent arriver dans n'importe quel ordre). */
export function normalizeRect(a, b) {
  return {
    x: Math.round(Math.min(a.x, b.x)),
    y: Math.round(Math.min(a.y, b.y)),
    w: Math.round(Math.abs(b.x - a.x)),
    h: Math.round(Math.abs(b.y - a.y)),
  }
}

export function isTooSmall(rect) {
  return rect.w < MIN_DRAWN && rect.h < MIN_DRAWN
}

/** Formes dont le sens compte : une ligne tracée vers le bas ne se lit pas comme vers le haut. */
export const ORIENTED = new Set(['line', 'arrow'])

/**
 * Coins de départ et d'arrivée ramenés à la boîte (0 → 1). Sans eux, la normalisation
 * du rectangle perdrait le sens du tracé et toutes les lignes pencheraient pareil.
 */
export function endsFrom(from, to) {
  return {
    a: { x: from.x <= to.x ? 0 : 1, y: from.y <= to.y ? 0 : 1 },
    b: { x: from.x <= to.x ? 1 : 0, y: from.y <= to.y ? 1 : 0 },
  }
}

export function shapeItem({
  id,
  kind,
  rect,
  color,
  strokeWidth = 3,
  filled = false,
  points,
  ends,
}) {
  return {
    id,
    type: 'shape',
    kind,
    color,
    strokeWidth,
    filled: filled && CLOSED.has(kind),
    ...(points ? { points } : null),
    ...(ends && ORIENTED.has(kind) ? { ends } : null),
    ...rect,
  }
}

const CLOSE_RATIO = 0.12 // fin de tracé proche du départ : la forme se referme

/**
 * Tracé à main levée → forme vectorielle. Les points sont rangés en proportions du
 * cadre (0 → 1) : la forme se redimensionne ensuite comme n'importe quelle autre.
 */
export function freeShape({ id, points, color, strokeWidth = 3, filled = false }) {
  if (points.length < 2) return null

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(1, Math.max(...xs) - minX)
  const h = Math.max(1, Math.max(...ys) - minY)

  const first = points[0]
  const last = points.at(-1)
  const closed =
    Math.hypot(last.x - first.x, last.y - first.y) < Math.hypot(w, h) * CLOSE_RATIO

  return {
    id,
    type: 'shape',
    kind: 'free',
    color,
    strokeWidth,
    filled: filled && closed,
    closed,
    points: points.map((point) => ({
      x: Math.round(((point.x - minX) / w) * 1000) / 1000,
      y: Math.round(((point.y - minY) / h) * 1000) / 1000,
    })),
    x: Math.round(minX),
    y: Math.round(minY),
    w: Math.round(w),
    h: Math.round(h),
  }
}

const ANGLE_STEP = Math.PI / 12 // 15°

/**
 * Tracé contraint (touche ⇧) : carré ou cercle parfait pour les formes fermées,
 * angle par pas de 15° pour les lignes et les flèches.
 */
export function constrain(from, to, kind) {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (kind === 'line' || kind === 'arrow' || kind === 'arc') {
    const length = Math.hypot(dx, dy)
    const angle = Math.round(Math.atan2(dy, dx) / ANGLE_STEP) * ANGLE_STEP
    return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
  }

  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side }
}

/* ---------- redressement d'un tracé à main levée ---------- */

/** Distance d'un point au segment [a, b]. */
function distanceToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0
  return Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y)
}

/** Ramer–Douglas–Peucker : ne garde que les points qui font vraiment l'angle. */
function simplify(points, tolerance) {
  if (points.length < 3) return points
  let worst = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToSegment(points[i], points[0], points.at(-1))
    if (distance > worst) {
      worst = distance
      index = i
    }
  }
  if (worst <= tolerance) return [points[0], points.at(-1)]
  return [
    ...simplify(points.slice(0, index + 1), tolerance),
    ...simplify(points.slice(index), tolerance).slice(1),
  ]
}

/** Aire d'un polygone (formule du lacet), en valeur absolue. */
function polygonArea(points) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/** Le sommet tombe-t-il près d'un coin de la boîte ? */
function nearCorner(point, tolerance) {
  return (
    (point.x < tolerance || point.x > 1 - tolerance) &&
    (point.y < tolerance || point.y > 1 - tolerance)
  )
}

const STRAIGHTEN_TOLERANCE = 0.09

/**
 * Reconnaît la forme derrière un tracé à main levée et renvoie le correctif à appliquer.
 * On compte les sommets une fois le tracé simplifié, puis on tranche à l'aire : un
 * quadrilatère qui remplit sa boîte est un rectangle, sinon c'est un losange ; un
 * contour arrondi couvre environ π/4 de sa boîte, c'est une ellipse.
 */
export function straighten(shape) {
  const points = shape.points
  if (!points || points.length < 2) return null

  const corners = simplify(points, STRAIGHTEN_TOLERANCE)

  if (!shape.closed) {
    // Deux sommets seulement : le tracé est droit, il devient une ligne.
    if (corners.length > 2) return null
    return { kind: 'line', ends: { a: points[0], b: points.at(-1) }, points: null, closed: null }
  }

  // Le retour au point de départ compte deux fois dans la liste des sommets.
  const outline = corners.slice(0, -1)
  const ratio = polygonArea(outline)

  if (outline.length === 3) return { kind: 'triangle', points: null, closed: null }

  if (outline.length === 4) {
    const kind = outline.every((point) => nearCorner(point, 0.25)) ? 'rect' : 'diamond'
    return { kind, points: null, closed: null }
  }

  return { kind: ratio > 0.88 ? 'rect' : 'ellipse', points: null, closed: null }
}
