/**
 * Position à l'écran du curseur de saisie d'un champ (`textarea` ou `input`).
 *
 * Le navigateur ne l'expose pas : on recopie le champ dans un calque invisible, on y
 * insère le texte jusqu'au curseur, et on mesure où atterrit le repère. Le champ pouvant
 * vivre dans un calque mis à l'échelle, on ramène la mesure au facteur réel.
 */

const COPIED = [
  'boxSizing',
  'width',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
  'tabSize',
]

export function caretPoint(field) {
  if (!field || typeof field.selectionEnd !== 'number') return null

  const rect = field.getBoundingClientRect()
  const style = getComputedStyle(field)
  const mirror = document.createElement('div')

  for (const property of COPIED) mirror.style[property] = style[property]
  mirror.style.position = 'absolute'
  mirror.style.top = '-9999px'
  mirror.style.left = '-9999px'
  mirror.style.visibility = 'hidden'
  mirror.style.width = `${field.offsetWidth}px`
  mirror.style.height = 'auto'
  // Un `input` n'a qu'une ligne : pas de retour à la ligne dans le calque non plus.
  if (field.tagName === 'INPUT') mirror.style.whiteSpace = 'pre'

  const value = field.value ?? ''
  mirror.textContent = value.slice(0, field.selectionEnd)

  const marker = document.createElement('span')
  marker.textContent = value.slice(field.selectionEnd) || '.'
  mirror.append(marker)
  document.body.append(mirror)

  const offsetX = marker.offsetLeft
  const offsetY = marker.offsetTop
  mirror.remove()

  // Le bloc peut être zoomé : on déduit l'échelle du champ lui-même.
  const scale = field.offsetWidth ? rect.width / field.offsetWidth : 1
  // On renvoie le bas de la ligne : c'est là que se pose la pointe du stylo.
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25

  return {
    x: rect.left + (offsetX - field.scrollLeft) * scale,
    y: rect.top + (offsetY - field.scrollTop + lineHeight) * scale,
  }
}
