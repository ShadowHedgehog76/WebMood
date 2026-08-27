/** Géométrie des connexions entre blocs : ancrage, courbe de Bézier, pointes de flèche. */

export const ARROW_STYLES = [
  { key: 'none', label: '—', title: 'Sans flèche' },
  { key: 'end', label: '→', title: 'Flèche à droite' },
  { key: 'start', label: '←', title: 'Flèche à gauche' },
  { key: 'both', label: '↔', title: 'Flèche des deux côtés' },
]

export const ANCHOR_SIDES = ['left', 'right', 'top', 'bottom', 'center']
const SNAP_DISTANCE = 26 // en pixels écran

const NORMALS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

function anchor(item, side) {
  switch (side) {
    case 'left':
      return { x: item.x, y: item.y + item.h / 2 }
    case 'right':
      return { x: item.x + item.w, y: item.y + item.h / 2 }
    case 'top':
      return { x: item.x + item.w / 2, y: item.y }
    default:
      return { x: item.x + item.w / 2, y: item.y + item.h }
  }
}

function center(item) {
  return { x: item.x + item.w / 2, y: item.y + item.h / 2 }
}

/** Côtés en vis-à-vis, choisis selon l'axe dominant qui sépare les deux blocs. */
function sides(from, to) {
  const a = center(from)
  const b = center(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right']
  }
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
}

function curve(start, startNormal, end, endNormal) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const pull = Math.min(180, Math.max(48, distance * 0.42))
  const c1 = { x: start.x + startNormal.x * pull, y: start.y + startNormal.y * pull }
  const c2 = { x: end.x + endNormal.x * pull, y: end.y + endNormal.y * pull }
  return {
    d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    start,
    end,
    // Tangentes aux extrémités : du point de contrôle vers l'extrémité.
    startDir: normalize(start.x - c1.x, start.y - c1.y),
    endDir: normalize(end.x - c2.x, end.y - c2.y),
  }
}

function normalize(x, y) {
  const length = Math.hypot(x, y) || 1
  return { x: x / length, y: y / length }
}

/** Courbe entre deux blocs. */
export function linkGeometry(from, to) {
  const [fromSide, toSide] = sides(from, to)
  return geometryBetween(from, to, fromSide, toSide)
}

/** Courbe entre deux blocs, avec des côtés d'ancrage imposés (branches de carte mentale). */
export function geometryBetween(from, to, fromSide, toSide) {
  return curve(anchor(from, fromSide), NORMALS[fromSide], anchor(to, toSide), NORMALS[toSide])
}

/** Courbe entre un bloc et un point libre (connexion en cours de création). */
export function pendingGeometry(from, point) {
  const a = center(from)
  const dx = point.x - a.x
  const dy = point.y - a.y
  const side =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top'
  const start = anchor(from, side)
  const normal = NORMALS[side]
  const pull = Math.min(140, Math.max(40, Math.hypot(dx, dy) * 0.4))
  const c1 = { x: start.x + normal.x * pull, y: start.y + normal.y * pull }
  return {
    d: `M ${start.x} ${start.y} Q ${c1.x} ${c1.y}, ${point.x} ${point.y}`,
    start,
    end: point,
  }
}

/** Triangle plein orienté selon `dir`, pointe posée sur `point`. */
export function arrowHead(point, dir, size = 11) {
  const angle = Math.atan2(dir.y, dir.x)
  const spread = 0.42
  const left = {
    x: point.x - Math.cos(angle - spread) * size,
    y: point.y - Math.sin(angle - spread) * size,
  }
  const right = {
    x: point.x - Math.cos(angle + spread) * size,
    y: point.y - Math.sin(angle + spread) * size,
  }
  return `M ${point.x} ${point.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`
}

/** Liaison en équerre : on descend, on se décale, on redescend (organigrammes). */
export function elbowDown(start, end, radius = 12) {
  const midY = (start.y + end.y) / 2
  const dx = end.x - start.x
  if (Math.abs(dx) < 1) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`

  const r = Math.min(radius, Math.abs(dx) / 2, Math.abs(end.y - start.y) / 2)
  const dir = Math.sign(dx)
  return (
    `M ${start.x} ${start.y} L ${start.x} ${midY - r} ` +
    `Q ${start.x} ${midY} ${start.x + dir * r} ${midY} ` +
    `L ${end.x - dir * r} ${midY} ` +
    `Q ${end.x} ${midY} ${end.x} ${midY + r} L ${end.x} ${end.y}`
  )
}

/** Liaison en L : on descend depuis le parent, puis on part vers l'enfant (arborescence). */
export function elbowRight(start, end, radius = 12) {
  const r = Math.min(radius, Math.abs(end.y - start.y), Math.abs(end.x - start.x))
  return (
    `M ${start.x} ${start.y} L ${start.x} ${end.y - r} ` +
    `Q ${start.x} ${end.y} ${start.x + r} ${end.y} L ${end.x} ${end.y}`
  )
}

/** Point d'accroche d'un bloc : ses quatre côtés et son centre. */
export function anchorPoint(item, side) {
  if (side === 'center') return { x: item.x + item.w / 2, y: item.y + item.h / 2 }
  return anchor(item, side)
}

export function anchorsOf(item) {
  return ANCHOR_SIDES.map((side) => ({ side, id: item.id, ...anchorPoint(item, side) }))
}

/** Accroche la plus proche d'un point, à portée donnée (en unités « monde »). */
export function nearestAnchor(items, point, reach) {
  let best = null
  for (const item of items) {
    for (const candidate of anchorsOf(item)) {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
      if (distance <= reach && (!best || distance < best.distance)) {
        best = { ...candidate, distance }
      }
    }
  }
  return best
}

export function snapReach(scale) {
  return SNAP_DISTANCE / scale
}

/**
 * Extrémité d'un arc : un point libre, ou une accroche sur un bloc qu'elle suit.
 * `byId` donne les blocs par identifiant.
 */
export function resolveEnd(end, byId) {
  if (!end) return null
  if (typeof end === 'string') {
    const item = byId.get(end)
    return item ? anchorPoint(item, 'center') : null
  }
  if (end.id) {
    const item = byId.get(end.id)
    return item ? anchorPoint(item, end.side ?? 'center') : null
  }
  return { x: end.x, y: end.y }
}

/** Courbe quadratique passant par son point de contrôle. */
export function arcPath(a, bend, b) {
  return `M ${a.x} ${a.y} Q ${bend.x} ${bend.y} ${b.x} ${b.y}`
}

/** Point de contrôle par défaut : le milieu, décalé perpendiculairement. */
export function defaultBend(a, b, ratio = 0.22) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return {
    x: (a.x + b.x) / 2 - dy * ratio,
    y: (a.y + b.y) / 2 + dx * ratio,
  }
}

/** Tangente à l'extrémité d'une courbe quadratique, pour poser une pointe de flèche. */
export function arcDirection(from, to) {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
}
