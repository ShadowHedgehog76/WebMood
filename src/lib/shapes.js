/** Formes vectorielles posées sur le tableau. */

export const SHAPES = [
  { key: 'rect', label: 'Rectangle' },
  { key: 'ellipse', label: 'Ellipse' },
  { key: 'triangle', label: 'Triangle' },
  { key: 'diamond', label: 'Losange' },
  { key: 'line', label: 'Ligne' },
  { key: 'arrow', label: 'Flèche' },
]

/** Formes fermées : les seules qui acceptent un remplissage. */
export const CLOSED = new Set(['rect', 'ellipse', 'triangle', 'diamond'])

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

export function shapeItem({ id, kind, rect, color, strokeWidth = 3, filled = false }) {
  return {
    id,
    type: 'shape',
    kind,
    color,
    strokeWidth,
    filled: filled && CLOSED.has(kind),
    ...rect,
  }
}
