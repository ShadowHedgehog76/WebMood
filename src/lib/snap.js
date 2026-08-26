/** Aimantation aux bords et aux centres des autres blocs, avec repères. */

const THRESHOLD = 8 // en pixels écran

function lines(item) {
  return {
    x: [item.x, item.x + item.w / 2, item.x + item.w],
    y: [item.y, item.y + item.h / 2, item.y + item.h],
  }
}

/**
 * Renvoie la position aimantée et les repères à afficher.
 * `moved` est le bloc à sa position libre, `others` les blocs de référence.
 */
export function snapPosition(moved, others, scale) {
  const tolerance = THRESHOLD / scale
  const self = lines(moved)
  const result = { x: moved.x, y: moved.y, guides: [] }

  for (const axis of ['x', 'y']) {
    let best = null
    for (const other of others) {
      const target = lines(other)[axis]
      for (const [index, value] of self[axis].entries()) {
        for (const candidate of target) {
          const distance = Math.abs(candidate - value)
          if (distance <= tolerance && (!best || distance < best.distance)) {
            best = { distance, delta: candidate - value, at: candidate, other, index }
          }
        }
      }
    }
    if (!best) continue

    result[axis] = Math.round(moved[axis] + best.delta)
    const span = axis === 'x' ? 'y' : 'x'
    const size = axis === 'x' ? 'h' : 'w'
    result.guides.push({
      axis,
      at: best.at,
      from: Math.min(moved[span], best.other[span]),
      to: Math.max(moved[span] + moved[size], best.other[span] + best.other[size]),
    })
  }

  return result
}
