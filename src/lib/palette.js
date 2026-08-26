/** Palette du tableau : nuances générées en HSL, plus une rampe de gris. */

function hslToHex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const channel = (n) => {
    const k = (n + h / 30) % 12
    const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

const HUES = [354, 10, 24, 36, 48, 62, 84, 140, 165, 186, 202, 216, 232, 258, 282, 312]
const TONES = [
  { s: 72, l: 32 },
  { s: 80, l: 44 },
  { s: 84, l: 56 },
  { s: 82, l: 68 },
  { s: 80, l: 80 },
]

/** Une ligne par nuance, une colonne par teinte. */
export const COLOR_ROWS = TONES.map((tone) => HUES.map((hue) => hslToHex(hue, tone.s, tone.l)))

export const NEUTRAL_ROW = [
  '#000000', '#1c1c1e', '#3a3a40', '#55555d', '#6f6f78', '#8a8a93',
  '#a8a8b0', '#c6c6cd', '#e2e2e7', '#f2f2f5', '#ffffff',
]

/** Couleurs proposées d'emblée dans la barre d'outils. */
export const QUICK_COLORS = ['#1c1c1e', '#e5484d', '#f5a623', '#30a46c', '#3b82f6', '#8b5cf6']

export const ALL_COLORS = [...COLOR_ROWS.flat(), ...NEUTRAL_ROW]

/** Teintes attribuées aux zones de groupe, en rotation à la création. */
export const GROUP_TINTS = ['#3b82f6', '#30a46c', '#f5a623', '#8b5cf6', '#e5484d', '#0ea5b7']

/** Noir ou blanc selon le fond, pour rester lisible. */
export function readableOn(hex) {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return luminance > 0.45 ? '#1c1c1e' : '#ffffff'
}
