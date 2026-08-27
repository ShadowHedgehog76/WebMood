/** Géométrie des connexions entre blocs : ancrage, courbe de Bézier, pointes de flèche. */

export const ARROW_STYLES = [
  { key: 'none', label: '—', title: 'Sans flèche' },
  { key: 'end', label: '→', title: 'Flèche à droite' },
  { key: 'start', label: '←', title: 'Flèche à gauche' },
  { key: 'both', label: '↔', title: 'Flèche des deux côtés' },
]

export const LINK_STYLES = [
  { key: 'curve', title: 'Trait courbe' },
  { key: 'elbow', title: 'Trait en équerre' },
  { key: 'straight', title: 'Trait droit' },
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
    c1,
    c2,
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

/** Chemin passant par une suite de points, les angles adoucis. */
function polylinePath(points, radius = 10) {
  const parts = [`M ${points[0].x} ${points[0].y}`]
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1]
    const corner = points[i]
    const next = points[i + 1]
    const before = normalize(previous.x - corner.x, previous.y - corner.y)
    const after = normalize(next.x - corner.x, next.y - corner.y)
    const r = Math.min(
      radius,
      Math.hypot(corner.x - previous.x, corner.y - previous.y) / 2,
      Math.hypot(next.x - corner.x, next.y - corner.y) / 2,
    )
    parts.push(`L ${corner.x + before.x * r} ${corner.y + before.y * r}`)
    parts.push(`Q ${corner.x} ${corner.y} ${corner.x + after.x * r} ${corner.y + after.y * r}`)
  }
  parts.push(`L ${points.at(-1).x} ${points.at(-1).y}`)
  return parts.join(' ')
}

/** Géométrie d'une suite de points : mêmes champs qu'une courbe, tangentes comprises. */
function polyline(points, radius) {
  const start = points[0]
  const end = points.at(-1)
  return {
    points,
    radius,
    d: polylinePath(points, radius),
    start,
    end,
    startDir: normalize(start.x - points[1].x, start.y - points[1].y),
    endDir: normalize(end.x - points.at(-2).x, end.y - points.at(-2).y),
  }
}

/**
 * Liaison en équerre : on sort perpendiculairement au bloc, on fait la moitié du chemin,
 * puis on rejoint l'autre bord. C'est le tracé des schémas d'architecture.
 */
export function orthoGeometry(from, to) {
  const [fromSide, toSide] = sides(from, to)
  const start = anchor(from, fromSide)
  const end = anchor(to, toSide)
  const horizontal = fromSide === 'left' || fromSide === 'right'

  const points = horizontal
    ? [start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end]
    : [start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end]

  // Deux points confondus donneraient une tangente au hasard : on les retire.
  const kept = points.filter(
    (point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.5,
  )
  return polyline(kept.length > 1 ? kept : [start, end], 10)
}

/** Liaison droite, de bord à bord. */
export function straightGeometry(from, to) {
  const [fromSide, toSide] = sides(from, to)
  return polyline([anchor(from, fromSide), anchor(to, toSide)], 0)
}

/** Géométrie d'une connexion selon le style choisi. */
export function geometryFor(style, from, to) {
  if (style === 'elbow') return orthoGeometry(from, to)
  if (style === 'straight') return straightGeometry(from, to)
  return linkGeometry(from, to)
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

/** Courbe de Bézier cubique : une tangente par extrémité. */
export function arcPath(a, c1, c2, b) {
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`
}

/** Tangentes par défaut : au tiers et aux deux tiers, décalées perpendiculairement. */
export function defaultControls(a, b, ratio = 0.22) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return {
    c1: { x: a.x + dx / 3 - dy * ratio, y: a.y + dy / 3 + dx * ratio },
    c2: { x: a.x + (dx * 2) / 3 - dy * ratio, y: a.y + (dy * 2) / 3 + dx * ratio },
  }
}

/**
 * Tangentes d'un arc. Les premiers arcs n'avaient qu'un point de courbure (quadratique) :
 * on le convertit à la volée, la conversion étant exacte.
 */
export function controlsOf(link, a, b) {
  if (link.c1 && link.c2) return { c1: link.c1, c2: link.c2 }
  if (link.bend) {
    return {
      c1: { x: a.x + ((link.bend.x - a.x) * 2) / 3, y: a.y + ((link.bend.y - a.y) * 2) / 3 },
      c2: { x: b.x + ((link.bend.x - b.x) * 2) / 3, y: b.y + ((link.bend.y - b.y) * 2) / 3 },
    }
  }
  return defaultControls(a, b)
}

/**
 * Tangente opposée à un raccord : la sortie prolonge l'entrée, ce qui donne une jonction
 * lisse — le passage d'un arc à l'autre se fait sans cassure.
 */
export function mirrorControl(joint, control, keepLength) {
  const dx = joint.x - control.x
  const dy = joint.y - control.y
  const length = Math.hypot(dx, dy) || 1
  const reach = keepLength ?? length
  return { x: joint.x + (dx / length) * reach, y: joint.y + (dy / length) * reach }
}

/** Extrémités des autres arcs, candidates à un raccord. */
export function arcEnds(links, exceptId) {
  const ends = []
  for (const link of links) {
    if (link.kind !== 'arc' || link.id === exceptId) continue
    ends.push({ arc: link.id, end: 'from', point: link.from })
    ends.push({ arc: link.id, end: 'to', point: link.to })
  }
  return ends
}

/** Tangente à l'extrémité d'une courbe quadratique, pour poser une pointe de flèche. */
export function arcDirection(from, to) {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
}

/**
 * Chemin raccourci aux extrémités qui portent une pointe de flèche : sans cela, le trait
 * dépasse de la pointe (surtout avec un trait épais et des bouts arrondis).
 */
export function pathWithArrows(geometry, arrow, width, connected = {}) {
  // La pointe s'élargit en s'éloignant de son sommet : au-delà d'environ 1,2 × l'épaisseur
  // elle couvre déjà tout le trait. On coupe donc court — et encore moins quand
  // l'extrémité est raccrochée à quelque chose, pour ne laisser aucun jour.
  const back = (point, direction, close) => {
    const cut = width * (close ? 1.2 : 1.9)
    return { x: point.x - direction.x * cut, y: point.y - direction.y * cut }
  }

  const start =
    arrow === 'start' || arrow === 'both'
      ? back(geometry.start, geometry.startDir, connected.start)
      : geometry.start
  const end =
    arrow === 'end' || arrow === 'both'
      ? back(geometry.end, geometry.endDir, connected.end)
      : geometry.end

  // Tracé anguleux : on remplace seulement ses extrémités, les coudes ne bougent pas.
  if (geometry.points) {
    return polylinePath([start, ...geometry.points.slice(1, -1), end], geometry.radius)
  }

  return `M ${start.x} ${start.y} C ${geometry.c1.x} ${geometry.c1.y}, ${geometry.c2.x} ${geometry.c2.y}, ${end.x} ${end.y}`
}
