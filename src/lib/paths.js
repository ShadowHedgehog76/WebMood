/**
 * Chemins éditables : une forme n'est plus un rectangle ou une ellipse, c'est une suite
 * de nœuds reliés par des courbes de Bézier — comme les arcs, mais avec autant de points
 * qu'on veut. Chaque nœud porte deux tangentes : `in` d'où l'on arrive, `out` où l'on va.
 *
 * Les coordonnées sont rangées en proportions de la boîte du bloc (0 → 1), comme les
 * tracés à main levée l'étaient déjà : la forme se déplace, se redimensionne et
 * s'aligne alors comme n'importe quel autre bloc, sans rien recalculer.
 */

/** Un nœud anguleux : les tangentes collent au point, la courbe y fait un angle. */
export function node(x, y, into = null, out = null) {
  return { x, y, in: into, out }
}

const KAPPA = 0.5522847498 // quart de cercle en Bézier cubique

/** Rectangle : quatre coins vifs. */
function rectNodes() {
  return [node(0, 0), node(1, 0), node(1, 1), node(0, 1)]
}

/** Ellipse : quatre quarts de cercle, tangentes horizontales et verticales. */
function ellipseNodes() {
  const k = KAPPA / 2
  return [
    { x: 0.5, y: 0, in: { x: 0.5 - k, y: 0 }, out: { x: 0.5 + k, y: 0 } },
    { x: 1, y: 0.5, in: { x: 1, y: 0.5 - k }, out: { x: 1, y: 0.5 + k } },
    { x: 0.5, y: 1, in: { x: 0.5 + k, y: 1 }, out: { x: 0.5 - k, y: 1 } },
    { x: 0, y: 0.5, in: { x: 0, y: 0.5 + k }, out: { x: 0, y: 0.5 - k } },
  ]
}

const GENERATORS = {
  rect: rectNodes,
  ellipse: ellipseNodes,
  triangle: () => [node(0.5, 0), node(1, 1), node(0, 1)],
  diamond: () => [node(0.5, 0), node(1, 0.5), node(0.5, 1), node(0, 0.5)],
}

/** Les formes fermées d'origine, celles qui se referment sur elles-mêmes. */
const CLOSED_KINDS = new Set(['rect', 'ellipse', 'triangle', 'diamond'])

/**
 * Les nœuds d'une forme. Celles d'avant — rectangles, ellipses, lignes, tracés à main
 * levée — n'en portaient pas : on les fabrique à la lecture, sans toucher au tableau
 * enregistré. La forme ne devient un vrai chemin qu'au premier déplacement de nœud.
 */
export function nodesOf(item) {
  if (item.nodes?.length) return item.nodes

  if (GENERATORS[item.kind]) return GENERATORS[item.kind]()

  if (item.kind === 'line' || item.kind === 'arrow') {
    const ends = item.ends ?? { a: { x: 0, y: 1 }, b: { x: 1, y: 0 } }
    return [node(ends.a.x, ends.a.y), node(ends.b.x, ends.b.y)]
  }

  if (item.kind === 'free' && item.points?.length > 1) return smoothNodes(item.points)

  return []
}

export function isClosed(item) {
  if (item.nodes?.length) return Boolean(item.closed)
  if (CLOSED_KINDS.has(item.kind)) return true
  return item.kind === 'free' ? Boolean(item.closed) : false
}

/**
 * Suite de points → nœuds lissés. La tangente d'un point suit la direction de ses deux
 * voisins, et sa longueur le tiers de la distance : c'est la courbe de Catmull-Rom,
 * écrite en Bézier. Un tracé à main levée devient ainsi une courbe qu'on peut reprendre.
 */
export function smoothNodes(points, closed = false) {
  const count = points.length
  if (count < 2) return points.map((point) => node(point.x, point.y))

  return points.map((point, index) => {
    const previous = points[index - 1] ?? (closed ? points.at(-1) : point)
    const next = points[index + 1] ?? (closed ? points[0] : point)

    const dx = next.x - previous.x
    const dy = next.y - previous.y
    const length = Math.hypot(dx, dy) || 1
    const direction = { x: dx / length, y: dy / length }

    const back = Math.hypot(point.x - previous.x, point.y - previous.y) / 3
    const forward = Math.hypot(next.x - point.x, next.y - point.y) / 3

    return {
      x: point.x,
      y: point.y,
      in: index === 0 && !closed ? null : { x: point.x - direction.x * back, y: point.y - direction.y * back },
      out:
        index === count - 1 && !closed
          ? null
          : { x: point.x + direction.x * forward, y: point.y + direction.y * forward },
    }
  })
}

/** Distance d'un point au segment [a, b]. */
function distanceToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0
  return Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y)
}

/**
 * Ramer–Douglas–Peucker : ne garde que les points qui font vraiment l'angle. Un tracé
 * à main levée en compte des centaines ; sans ce dégrossissage, il porterait autant de
 * poignées et deviendrait impossible à reprendre.
 */
export function simplifyPoints(points, tolerance) {
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
    ...simplifyPoints(points.slice(0, index + 1), tolerance),
    ...simplifyPoints(points.slice(index), tolerance).slice(1),
  ]
}

/** Tangente effective d'un nœud : sans tangente enregistrée, elle est sur le point. */
export const outOf = (point) => point.out ?? { x: point.x, y: point.y }
export const inOf = (point) => point.in ?? { x: point.x, y: point.y }

/**
 * Chemin SVG des nœuds, projetés dans la boîte donnée. `project` reçoit un point en
 * proportions et renvoie sa position dessinée.
 */
export function pathData(nodes, closed, project) {
  if (nodes.length < 2) return ''

  const at = (point) => {
    const projected = project(point)
    return `${projected.x} ${projected.y}`
  }

  const start = project(nodes[0])
  const parts = [`M ${start.x} ${start.y}`]

  const segments = closed ? nodes.length : nodes.length - 1
  for (let i = 0; i < segments; i++) {
    const from = nodes[i]
    const to = nodes[(i + 1) % nodes.length]
    parts.push(`C ${at(outOf(from))}, ${at(inOf(to))}, ${at(to)}`)
  }
  if (closed) parts.push('Z')

  return parts.join(' ')
}

/** Point d'une courbe de Bézier cubique, à l'abscisse `t`. */
export function pointOnCurve(a, c1, c2, b, t) {
  const u = 1 - t
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  }
}

/**
 * Coupe un segment en deux au paramètre `t` (algorithme de De Casteljau) : la courbe
 * garde exactement sa forme, elle a simplement un nœud de plus.
 */
export function splitSegment(nodes, index, t, closed) {
  const from = nodes[index]
  const to = nodes[(index + 1) % nodes.length]
  const c1 = outOf(from)
  const c2 = inOf(to)

  const lerp = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
  const a1 = lerp(from, c1)
  const a2 = lerp(c1, c2)
  const a3 = lerp(c2, to)
  const b1 = lerp(a1, a2)
  const b2 = lerp(a2, a3)
  const middle = lerp(b1, b2)

  const next = nodes.map((entry) => ({ ...entry }))
  next[index] = { ...from, out: a1 }
  next[(index + 1) % nodes.length] = { ...to, in: a3 }
  next.splice(index + 1, 0, { x: middle.x, y: middle.y, in: b1, out: b2 })
  return next
}

/** Le segment le plus proche d'un point, et l'abscisse où il en est le plus près. */
export function nearestSegment(nodes, closed, point) {
  const segments = closed ? nodes.length : nodes.length - 1
  let best = null

  for (let i = 0; i < segments; i++) {
    const from = nodes[i]
    const to = nodes[(i + 1) % nodes.length]
    const c1 = outOf(from)
    const c2 = inOf(to)
    // Vingt pas suffisent : on cherche où insérer un nœud, pas une distance exacte.
    for (let step = 0; step <= 20; step++) {
      const t = step / 20
      const on = pointOnCurve(from, c1, c2, to, t)
      const distance = Math.hypot(on.x - point.x, on.y - point.y)
      if (!best || distance < best.distance) best = { index: i, t, distance, point: on }
    }
  }

  return best
}

/** Retire un nœud. Un chemin a besoin de deux nœuds pour exister. */
export function removeNode(nodes, index) {
  if (nodes.length <= 2) return nodes
  return nodes.filter((_, i) => i !== index)
}

/** Boîte englobante des nœuds, tangentes comprises. */
export function boundsOfNodes(nodes) {
  const points = nodes.flatMap((entry) => [entry, outOf(entry), inOf(entry)])
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

/**
 * Passage entre les proportions d'un chemin (0 → 1) et les coordonnées du tableau.
 * Le rembourrage est celui du rendu : les poignées tombent exactement sur le trait.
 */
export function projector(item) {
  const pad = Math.max(1, item.strokeWidth ?? 3) / 2 + 1
  const w = Math.max(0, Math.max(1, item.w) - pad * 2)
  const h = Math.max(0, Math.max(1, item.h) - pad * 2)
  return {
    toBoard: (point) => ({ x: item.x + pad + point.x * w, y: item.y + pad + point.y * h }),
    toUnit: (point) => ({
      x: w ? (point.x - item.x - pad) / w : 0,
      y: h ? (point.y - item.y - pad) / h : 0,
    }),
  }
}

const MIN_BOX = 8

/**
 * Un nœud déplacé sort de la boîte du bloc. On recadre : la boîte épouse à nouveau le
 * chemin, et les proportions sont recalculées pour que rien ne bouge à l'écran.
 */
export function normalizePath(item, nodes) {
  const { toBoard } = projector(item)
  const board = nodes.map((entry) => ({
    ...entry,
    ...toBoard(entry),
    in: entry.in ? toBoard(entry.in) : null,
    out: entry.out ? toBoard(entry.out) : null,
  }))

  const bounds = boundsOfNodes(board)
  const pad = Math.max(1, item.strokeWidth ?? 3) / 2 + 1
  const width = Math.max(MIN_BOX, bounds.maxX - bounds.minX)
  const height = Math.max(MIN_BOX, bounds.maxY - bounds.minY)

  const unit = (point) => ({
    x: (point.x - bounds.minX) / width,
    y: (point.y - bounds.minY) / height,
  })

  return {
    nodes: board.map((entry) => ({
      ...unit(entry),
      in: entry.in ? unit(entry.in) : null,
      out: entry.out ? unit(entry.out) : null,
    })),
    x: Math.round(bounds.minX - pad),
    y: Math.round(bounds.minY - pad),
    w: Math.round(width + pad * 2),
    h: Math.round(height + pad * 2),
  }
}

/** Le nœud est-il lisse ? Ses deux tangentes sont alors dans le prolongement l'une de l'autre. */
export function isSmooth(entry) {
  if (!entry.in || !entry.out) return false
  const a = { x: entry.x - entry.in.x, y: entry.y - entry.in.y }
  const b = { x: entry.out.x - entry.x, y: entry.out.y - entry.y }
  const la = Math.hypot(a.x, a.y)
  const lb = Math.hypot(b.x, b.y)
  if (!la || !lb) return false
  // Produit vectoriel presque nul et même sens : les deux tangentes sont alignées.
  return Math.abs(a.x * b.y - a.y * b.x) / (la * lb) < 0.08 && a.x * b.x + a.y * b.y > 0
}

/**
 * Déplace une poignée. `key` vaut `point` pour le nœud lui-même, `in` ou `out` pour une
 * tangente. Un nœud lisse garde ses deux tangentes alignées, sauf si on le brise.
 */
export function moveHandle(nodes, index, key, target, breakSmooth = false) {
  const entry = nodes[index]
  const next = nodes.map((candidate) => ({ ...candidate }))

  if (key === 'point') {
    const dx = target.x - entry.x
    const dy = target.y - entry.y
    next[index] = {
      x: target.x,
      y: target.y,
      in: entry.in ? { x: entry.in.x + dx, y: entry.in.y + dy } : null,
      out: entry.out ? { x: entry.out.x + dx, y: entry.out.y + dy } : null,
    }
    return next
  }

  const smooth = !breakSmooth && isSmooth(entry)
  const other = key === 'in' ? 'out' : 'in'
  next[index] = { ...entry, [key]: target }

  if (smooth && entry[other]) {
    const length = Math.hypot(entry[other].x - entry.x, entry[other].y - entry.y)
    const dx = entry.x - target.x
    const dy = entry.y - target.y
    const reach = Math.hypot(dx, dy) || 1
    next[index][other] = {
      x: entry.x + (dx / reach) * length,
      y: entry.y + (dy / reach) * length,
    }
  }

  return next
}
