/** Types de trait : plein, tirets, pointillés, tiret-point, double. */

export const LINE_DASHES = [
  { key: 'solid', label: 'Trait plein' },
  { key: 'dashed', label: 'Tirets' },
  { key: 'dotted', label: 'Pointillés' },
  { key: 'dashdot', label: 'Tiret-point' },
  { key: 'double', label: 'Trait double' },
]

/** Le trait double se dessine autrement : il n'a pas de motif d'alternance. */
export const DASHABLE = LINE_DASHES.filter((style) => style.key !== 'double')

/**
 * Motif d'alternance, proportionnel à l'épaisseur : un trait épais mérite de gros
 * tirets. Les points sont des tirets de longueur nulle, arrondis par le bout du trait.
 */
export function dashPattern(style, width) {
  const w = Math.max(1, width)
  switch (style) {
    case 'dashed':
      return [w * 3.2, w * 2.2]
    case 'dotted':
      return [w * 0.05, w * 2.2]
    case 'dashdot':
      return [w * 3.2, w * 1.8, w * 0.05, w * 1.8]
    default:
      return []
  }
}

/** Même motif, écrit pour SVG. `undefined` quand le trait est plein. */
export function dashArray(style, width) {
  const pattern = dashPattern(style, width)
  return pattern.length ? pattern.join(' ') : undefined
}

export const isDouble = (style) => style === 'double'

/** Écart entre les deux traits d'un trait double, en épaisseurs. */
export const DOUBLE_SPREAD = 3
