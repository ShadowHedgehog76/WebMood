/**
 * Sélection au lasso : on entoure ce qu'on veut prendre.
 *
 * Le rectangle de sélection attrape tout ce qui croise sa boîte — sur un tableau dense,
 * c'est trop grossier. Le lasso suit le tracé, et ne retient qu'un bloc dont le centre
 * est réellement dedans.
 */

/** Le point est-il dans le polygone ? Lancer de rayon horizontal, comptage des croisements. */
export function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = a.y > point.y !== b.y > point.y
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Un point tous les quelques pixels suffit : le tracé brut d'un pointeur en compte des
 * centaines, et chacun coûte à chaque test d'appartenance.
 */
export function thin(points, step = 6) {
  if (points.length < 2) return points
  const kept = [points[0]]
  for (const point of points) {
    const last = kept[kept.length - 1]
    if (Math.hypot(point.x - last.x, point.y - last.y) >= step) kept.push(point)
  }
  const end = points[points.length - 1]
  if (kept[kept.length - 1] !== end) kept.push(end)
  return kept
}

/** Les blocs dont le centre tombe dans le lasso. Le tracé est refermé implicitement. */
export function lassoHits(items, polygon) {
  if (polygon.length < 3) return []
  return items
    .filter((item) => pointInPolygon({ x: item.x + item.w / 2, y: item.y + item.h / 2 }, polygon))
    .map((item) => item.id)
}

/** Tracé SVG du lasso en cours, refermé en pointillé jusqu'au point de départ. */
export function lassoPath(points) {
  if (points.length < 2) return ''
  return `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} Z`
}
