/** Zones de groupe : appartenance et tri automatique. */

export const GROUP_BAR = 44
const PADDING = 24
const GAP = 24

export function contains(rect, point) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  )
}

/**
 * Le groupe auquel appartient un bloc : celui dont la zone couvre son centre, où qu'il
 * soit posé dedans. En cas de zones imbriquées, la plus petite l'emporte.
 */
export function groupFor(groups, item) {
  const center = { x: item.x + item.w / 2, y: item.y + item.h / 2 }
  const containing = groups.filter((group) => contains(group, center))
  if (!containing.length) return null
  return containing.reduce((best, group) => (group.w * group.h < best.w * best.h ? group : best))
}

/**
 * Range les membres en grille sous la barre, de gauche à droite puis à la ligne.
 * Renvoie les positions à appliquer et la hauteur nécessaire au groupe.
 */
export function autoLayout(group, members) {
  const startX = group.x + PADDING
  const startY = group.y + GROUP_BAR + PADDING
  const limit = group.x + group.w - PADDING

  let x = startX
  let y = startY
  let rowHeight = 0
  const moves = []

  for (const member of members) {
    if (x !== startX && x + member.w > limit) {
      x = startX
      y += rowHeight + GAP
      rowHeight = 0
    }
    moves.push({ id: member.id, x: Math.round(x), y: Math.round(y) })
    x += member.w + GAP
    rowHeight = Math.max(rowHeight, member.h)
  }

  return { moves, height: Math.max(group.h, Math.round(y + rowHeight + PADDING - group.y)) }
}
