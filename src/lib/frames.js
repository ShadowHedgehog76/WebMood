/** Cadres : des scènes posées sur le tableau, que la présentation parcourt dans l'ordre. */

export const FRAME_SIZE = { w: 1280, h: 720 } // 16/9, comme une diapositive
export const FRAME_BAR = 34 // hauteur de l'étiquette, au-dessus du cadre

export function frameItem(at, index) {
  return {
    id: `frame-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'frame',
    name: `Cadre ${index + 1}`,
    x: Math.round(at.x - FRAME_SIZE.w / 2),
    y: Math.round(at.y - FRAME_SIZE.h / 2),
    ...FRAME_SIZE,
  }
}

/** Les cadres se suivent de gauche à droite, puis de haut en bas : l'ordre de lecture. */
export function orderFrames(items) {
  return items
    .filter((item) => item.type === 'frame')
    .sort((a, b) => (Math.abs(a.y - b.y) > 80 ? a.y - b.y : a.x - b.x))
}

/**
 * Vue qui cadre exactement une zone dans la fenêtre, avec un peu d'air autour.
 * Le facteur d'échelle est le même dans les deux sens : rien n'est déformé.
 */
export function fitView(rect, viewport, padding = 40) {
  const scale = Math.min(
    (viewport.w - padding * 2) / rect.w,
    (viewport.h - padding * 2) / rect.h,
  )
  return {
    scale,
    x: viewport.w / 2 - (rect.x + rect.w / 2) * scale,
    y: viewport.h / 2 - (rect.y + rect.h / 2) * scale,
  }
}
