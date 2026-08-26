/**
 * Vignette d'un tableau : une poignée de rectangles normalisés (0 → 1), stockés dans
 * l'index. Assez léger pour être réécrit à chaque sauvegarde, et suffisant pour
 * reconnaître un tableau d'un coup d'œil.
 */

const MAX_RECTS = 40

export function makePreview(doc) {
  const items = doc.items ?? []
  const strokes = doc.strokes ?? []
  if (!items.length && !strokes.length) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const boxes = items.map((item) => ({
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    t: item.type,
    c: item.color ?? null,
  }))

  // Les traits comptent aussi, à travers leur boîte englobante.
  for (const stroke of strokes) {
    if (!stroke.points?.length) continue
    const xs = stroke.points.map((point) => point.x)
    const ys = stroke.points.map((point) => point.y)
    boxes.push({
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
      t: 'stroke',
      c: stroke.color ?? null,
    })
  }
  if (!boxes.length) return null

  for (const box of boxes) {
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.w)
    maxY = Math.max(maxY, box.y + box.h)
  }

  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)

  return {
    ratio: width / height,
    rects: boxes.slice(-MAX_RECTS).map((box) => ({
      x: (box.x - minX) / width,
      y: (box.y - minY) / height,
      w: box.w / width,
      h: box.h / height,
      t: box.t,
      c: box.c,
    })),
  }
}
