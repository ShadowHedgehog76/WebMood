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

export function shapeItem({ id, kind, rect, color, strokeWidth = 3, filled = false, points }) {
  return {
    id,
    type: 'shape',
    kind,
    color,
    strokeWidth,
    filled: filled && CLOSED.has(kind),
    ...(points ? { points } : null),
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
