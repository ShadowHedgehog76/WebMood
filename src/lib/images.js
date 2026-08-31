/**
 * Recadrage et masques d'image.
 *
 * Le recadrage est une fenêtre normalisée (0 → 1) sur la source : on ne touche jamais aux
 * pixels, ce qui le rend réversible à tout moment et gratuit à enregistrer. Le masque est
 * un `clip-path` en pourcentages, qui suit donc le bloc quand on le redimensionne.
 */

export const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 }

export const cropOf = (item) => item.crop ?? FULL_CROP

export const isCropped = (item) => {
  const crop = cropOf(item)
  return crop.x > 0.001 || crop.y > 0.001 || crop.w < 0.999 || crop.h < 0.999
}

export const MASKS = [
  { key: 'none', label: 'Aucun masque', clip: null },
  { key: 'circle', label: 'Ellipse', clip: 'ellipse(50% 50% at 50% 50%)' },
  { key: 'rounded', label: 'Coins arrondis', clip: 'inset(0 round 14%)' },
  { key: 'diamond', label: 'Losange', clip: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' },
  { key: 'triangle', label: 'Triangle', clip: 'polygon(50% 0, 100% 100%, 0 100%)' },
  {
    key: 'hexagon',
    label: 'Hexagone',
    clip: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
  },
  {
    key: 'arch',
    label: 'Arche',
    clip: 'polygon(0 100%, 0 45%, 15% 15%, 50% 3%, 85% 15%, 100% 45%, 100% 100%)',
  },
]

export const clipOf = (key) => MASKS.find((mask) => mask.key === key)?.clip ?? null

/**
 * Le style de l'image sous sa fenêtre de recadrage : on l'agrandit et on la décale pour
 * que seule la part retenue occupe le bloc. Le bloc, lui, garde `overflow: hidden`.
 */
export function cropStyle(item) {
  const crop = cropOf(item)
  return {
    width: `${100 / crop.w}%`,
    height: `${100 / crop.h}%`,
    marginLeft: `${(-crop.x / crop.w) * 100}%`,
    marginTop: `${(-crop.y / crop.h) * 100}%`,
  }
}

/** Rapport largeur/hauteur de la part retenue, à partir de celui de la source. */
export function croppedRatio(sourceRatio, crop) {
  if (!sourceRatio) return null
  return (sourceRatio * crop.w) / crop.h
}

/** Fenêtre valide : bornée au cadre de la source, et jamais dégénérée. */
export function clampCrop(crop) {
  const w = Math.min(1, Math.max(0.05, crop.w))
  const h = Math.min(1, Math.max(0.05, crop.h))
  return {
    x: Math.min(1 - w, Math.max(0, crop.x)),
    y: Math.min(1 - h, Math.max(0, crop.y)),
    w,
    h,
  }
}

/** Une poignée tirée : le coin ou le bord opposé reste en place. */
export function resizeCrop(crop, handle, dx, dy) {
  let { x, y, w, h } = crop
  if (handle.includes('w')) {
    const left = Math.min(x + w - 0.05, Math.max(0, x + dx))
    w += x - left
    x = left
  }
  if (handle.includes('n')) {
    const top = Math.min(y + h - 0.05, Math.max(0, y + dy))
    h += y - top
    y = top
  }
  if (handle.includes('e')) w = Math.min(1 - x, Math.max(0.05, w + dx))
  if (handle.includes('s')) h = Math.min(1 - y, Math.max(0.05, h + dy))
  return clampCrop({ x, y, w, h })
}
