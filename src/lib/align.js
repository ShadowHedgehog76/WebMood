/** Alignement d'une sélection multiple. */

export const ALIGNMENTS = [
  { key: 'left', label: 'Aligner à gauche' },
  { key: 'centerX', label: 'Centrer horizontalement' },
  { key: 'right', label: 'Aligner à droite' },
  { key: 'top', label: 'Aligner en haut' },
  { key: 'centerY', label: 'Centrer verticalement' },
  { key: 'bottom', label: 'Aligner en bas' },
]

/** Positions cibles pour les blocs choisis. */
export function alignItems(items, ids, mode) {
  const chosen = items.filter((item) => ids.includes(item.id))
  if (chosen.length < 2) return []

  const left = Math.min(...chosen.map((item) => item.x))
  const right = Math.max(...chosen.map((item) => item.x + item.w))
  const top = Math.min(...chosen.map((item) => item.y))
  const bottom = Math.max(...chosen.map((item) => item.y + item.h))

  return chosen.map((item) => {
    switch (mode) {
      case 'left':
        return { id: item.id, x: left }
      case 'right':
        return { id: item.id, x: right - item.w }
      case 'centerX':
        return { id: item.id, x: Math.round((left + right) / 2 - item.w / 2) }
      case 'top':
        return { id: item.id, y: top }
      case 'bottom':
        return { id: item.id, y: bottom - item.h }
      default:
        return { id: item.id, y: Math.round((top + bottom) / 2 - item.h / 2) }
    }
  })
}
