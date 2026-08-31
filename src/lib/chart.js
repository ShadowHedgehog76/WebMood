/**
 * Graphiques : lecture d'un tableau du board, échelles et géométrie.
 *
 * Aucune bibliothèque : le rendu est du SVG écrit à la main. C'est le choix du projet
 * (aucune dépendance de rendu), et c'est aussi ce qui permet au graphique de sortir
 * intact dans l'export PNG, qui sérialise le DOM.
 */

/**
 * Palette catégorielle, dans cet ordre — l'ordre *est* le mécanisme de sécurité pour
 * les daltonismes, pas une préférence. Vérifiée au validateur en mode clair : bande de
 * clarté, plancher de chroma, séparation ΔE 9.1 (protan) sur la pire paire voisine,
 * plancher vision normale 19.6. Trois teintes passent sous 3:1 face au fond : la règle
 * de compensation s'applique, d'où la légende et les étiquettes directes — jamais la
 * couleur seule.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']

/** Encre et surfaces : le texte ne porte jamais la couleur d'une série. */
export const INK = { primary: '#1c1c1e', secondary: '#52514e', muted: '#8a8a93' }
export const SURFACE = '#ffffff'
export const GRID = '#e8e8ec'

export const CHARTS = [
  { key: 'column', label: 'Colonnes' },
  { key: 'bar', label: 'Barres' },
  { key: 'line', label: 'Courbes' },
  { key: 'area', label: 'Aire' },
  { key: 'pie', label: 'Camembert' },
]

const MAX_SERIES = SERIES.length

/** Un nombre écrit à la française, quelle que soit son échelle. */
export function formatValue(value) {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`
  if (abs >= 1000) return value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

const toNumber = (cell) => {
  if (cell === null || cell === undefined) return null
  // Un tableur français écrit « 1 234,5 » : on accepte les deux notations.
  const cleaned = String(cell).replace(/\s| /g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  const value = Number(cleaned)
  return cleaned === '' || Number.isNaN(value) ? null : value
}

/**
 * Lit un tableau : première ligne = noms des séries, première colonne = étiquettes.
 * Au-delà de six séries, la queue est repliée dans « Autre » — jamais une teinte de
 * plus, qui serait indiscernable des précédentes.
 */
export function readTable(cells) {
  if (!Array.isArray(cells) || cells.length < 2) return { labels: [], series: [] }

  const header = cells[0] ?? []
  const rows = cells.slice(1).filter((row) => row?.some((cell) => String(cell ?? '').trim()))
  const labels = rows.map((row, index) => String(row[0] ?? '').trim() || `Ligne ${index + 1}`)

  const columns = Math.max(0, Math.max(...cells.map((row) => row.length)) - 1)
  const all = Array.from({ length: columns }, (_, index) => ({
    name: String(header[index + 1] ?? '').trim() || `Série ${index + 1}`,
    values: rows.map((row) => toNumber(row[index + 1]) ?? 0),
  })).filter((serie) => serie.values.some((value) => value !== 0))

  if (all.length <= MAX_SERIES) return { labels, series: all }

  const kept = all.slice(0, MAX_SERIES - 1)
  const rest = all.slice(MAX_SERIES - 1)
  kept.push({
    name: 'Autre',
    values: labels.map((_, row) => rest.reduce((total, serie) => total + serie.values[row], 0)),
  })
  return { labels, series: kept }
}

/** Graduations rondes : 0, 500, 1 000… plutôt que 0, 437, 874… */
export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { ticks: [0, max || 1], min: 0, max: max || 1 }
  }
  const low = Math.min(0, min)
  const raw = (max - low) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= raw)

  const start = Math.floor(low / step) * step
  const end = Math.ceil(max / step) * step
  const ticks = []
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Number(value.toFixed(10)))
  }
  return { ticks, min: start, max: end }
}

/**
 * Barre au bout arrondi : 4 px de rayon côté donnée, angle droit sur la ligne de base —
 * la barre doit visiblement partir de zéro.
 */
export function barPath(x, y, w, h, radius, direction) {
  const r = Math.max(0, Math.min(radius, w / 2, h))
  if (r === 0) return `M${x} ${y}h${w}v${h}h${-w}Z`

  if (direction === 'up') {
    return `M${x} ${y + h}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h}Z`
  }
  // Barre horizontale : le bout arrondi est à droite.
  return `M${x} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}H${x}Z`
}

/** Un arc de camembert, du centre et retour : de quoi cliquer et survoler. */
export function slicePath(cx, cy, outer, inner, from, to) {
  const point = (radius, angle) => [
    cx + radius * Math.cos(angle - Math.PI / 2),
    cy + radius * Math.sin(angle - Math.PI / 2),
  ]
  const large = to - from > Math.PI ? 1 : 0
  const [x1, y1] = point(outer, from)
  const [x2, y2] = point(outer, to)

  if (inner <= 0) {
    return `M${cx} ${cy}L${x1} ${y1}A${outer} ${outer} 0 ${large} 1 ${x2} ${y2}Z`
  }
  const [x3, y3] = point(inner, to)
  const [x4, y4] = point(inner, from)
  return (
    `M${x1} ${y1}A${outer} ${outer} 0 ${large} 1 ${x2} ${y2}` +
    `L${x3} ${y3}A${inner} ${inner} 0 ${large} 0 ${x4} ${y4}Z`
  )
}

/** Somme de la première série : ce que le camembert répartit. */
export function pieParts({ labels, series }) {
  const values = series[0]?.values ?? []
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
  if (!total) return []

  let angle = 0
  return values.map((value, index) => {
    const share = Math.max(0, value) / total
    const part = { label: labels[index], value, share, from: angle, to: angle + share * Math.PI * 2 }
    angle = part.to
    return part
  })
}
