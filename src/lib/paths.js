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
