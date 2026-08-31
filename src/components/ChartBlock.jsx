import { useMemo, useState } from 'react'
import {
  GRID,
  SERIES,
  SURFACE,
  barPath,
  formatValue,
  niceTicks,
  pieParts,
  readTable,
  slicePath,
} from '../lib/chart.js'
import './ChartBlock.css'

const PAD = { top: 34, right: 18, bottom: 26, left: 44 }
const BAR_MAX = 24 // une barre ne remplit jamais sa case : le reste, c'est de l'air
const GAP = 2 // le blanc qui sépare deux marques, jamais un contour

/**
 * Graphique lu depuis un tableau du board. Modifier le tableau met le graphique à jour :
 * c'est le même document, il n'y a pas de copie à resynchroniser.
 *
 * Le rendu est du SVG écrit à la main — c'est ce qui lui permet de sortir intact dans
 * l'export PNG, qui sérialise le DOM.
 */
export default function ChartBlock({ item, table, active }) {
  const [hover, setHover] = useState(null)
  const data = useMemo(() => readTable(table?.cells), [table?.cells])
  const kind = item.chart ?? 'column'

  const width = Math.max(120, item.w)
  const height = Math.max(90, item.h)

  if (!table) {
    return (
      <div className="chart chart--empty">
        Le tableau qui alimentait ce graphique a disparu.
      </div>
    )
  }
  if (!data.series.length) {
    return (
      <div className="chart chart--empty">
        Remplissez le tableau : première ligne les noms de séries, première colonne les
        étiquettes.
      </div>
    )
  }

  const many = data.series.length > 1
  const legend = many && (
    <ul className="chart__legend">
      {data.series.map((serie, index) => (
        <li key={serie.name}>
          <span className="chart__key" style={{ background: SERIES[index % SERIES.length] }} />
          {serie.name}
        </li>
      ))}
    </ul>
  )

  const tip = hover && (
    <div className="chart__tip" style={{ left: hover.x, top: hover.y }}>
      <strong>{hover.label}</strong>
      <span>
        {hover.serie ? `${hover.serie} · ` : ''}
        {formatValue(hover.value)}
      </span>
    </div>
  )

  if (kind === 'pie') {
    const parts = pieParts(data)
    const size = Math.min(width, height - (item.title ? 24 : 8)) - 16
    const cx = width / 2
    const cy = (height + (item.title ? 16 : 0)) / 2
    const outer = Math.max(20, size / 2)

    return (
      <div className="chart" onPointerLeave={() => setHover(null)}>
        {item.title && <span className="chart__title">{item.title}</span>}
        <svg width={width} height={height} role="img" aria-label={item.title || 'Camembert'}>
          {parts.map((part, index) => (
            <path
              key={part.label}
              d={slicePath(cx, cy, outer, outer * 0.52, part.from, part.to)}
              fill={SERIES[index % SERIES.length]}
              // Le blanc entre deux parts sépare mieux qu'un contour.
              stroke={SURFACE}
              strokeWidth={GAP}
              onPointerEnter={(event) =>
                active &&
                setHover({
                  label: part.label,
                  value: part.value,
                  serie: `${Math.round(part.share * 100)} %`,
                  x: event.nativeEvent.offsetX,
                  y: event.nativeEvent.offsetY,
                })
              }
            />
          ))}
        </svg>
        <ul className="chart__legend chart__legend--pie">
          {parts.map((part, index) => (
            <li key={part.label}>
              <span className="chart__key" style={{ background: SERIES[index % SERIES.length] }} />
              {part.label} <b>{Math.round(part.share * 100)} %</b>
            </li>
          ))}
        </ul>
        {tip}
      </div>
    )
  }

  const values = data.series.flatMap((serie) => serie.values)
  const scale = niceTicks(Math.min(...values), Math.max(...values))
  const horizontal = kind === 'bar'

  const top = PAD.top - (item.title ? 0 : 16)
  const plot = {
    x: PAD.left,
    y: top,
    w: Math.max(10, width - PAD.left - PAD.right),
    h: Math.max(10, height - top - PAD.bottom - (many ? 18 : 0)),
  }
  const span = scale.max - scale.min || 1
  const atValue = (value) => (value - scale.min) / span

  const band = (horizontal ? plot.h : plot.w) / Math.max(1, data.labels.length)
  const thickness = Math.min(BAR_MAX, Math.max(3, (band - GAP * 2) / data.series.length - GAP))

  return (
    <div className="chart" onPointerLeave={() => setHover(null)}>
      {item.title && <span className="chart__title">{item.title}</span>}

      <svg width={width} height={height} role="img" aria-label={item.title || 'Graphique'}>
        {/* Grille : filet plein d'un cran au-dessus du fond, jamais pointillé. */}
        {scale.ticks.map((tick) => {
          const ratio = atValue(tick)
          return horizontal ? (
            <line
              key={tick}
              x1={plot.x + ratio * plot.w}
              x2={plot.x + ratio * plot.w}
              y1={plot.y}
              y2={plot.y + plot.h}
              stroke={GRID}
              strokeWidth="1"
            />
          ) : (
            <line
              key={tick}
              x1={plot.x}
              x2={plot.x + plot.w}
              y1={plot.y + (1 - ratio) * plot.h}
              y2={plot.y + (1 - ratio) * plot.h}
              stroke={GRID}
              strokeWidth="1"
            />
          )
        })}

        {/* Graduations : elles portent les valeurs qu'on n'étiquette pas. */}
        {scale.ticks.map((tick) => {
          const ratio = atValue(tick)
          return horizontal ? (
            <text
              key={tick}
              className="chart__tick"
              x={plot.x + ratio * plot.w}
              y={plot.y + plot.h + 14}
              textAnchor="middle"
            >
              {formatValue(tick)}
            </text>
          ) : (
            <text
              key={tick}
              className="chart__tick"
              x={plot.x - 6}
              y={plot.y + (1 - ratio) * plot.h + 3}
              textAnchor="end"
            >
              {formatValue(tick)}
            </text>
          )
        })}

        {(kind === 'column' || kind === 'bar') &&
          data.series.map((serie, s) =>
            serie.values.map((value, index) => {
              const group = index * band
              const offset =
                group + (band - thickness * data.series.length) / 2 + s * (thickness + 0)
              const ratio = atValue(value)
              const zero = atValue(Math.max(scale.min, 0))

              const d = horizontal
                ? barPath(
                    plot.x + zero * plot.w,
                    plot.y + offset,
                    Math.max(1, (ratio - zero) * plot.w),
                    Math.max(1, thickness - GAP),
                    4,
                    'right',
                  )
                : barPath(
                    plot.x + offset,
                    plot.y + (1 - ratio) * plot.h,
                    Math.max(1, thickness - GAP),
                    Math.max(1, (ratio - zero) * plot.h),
                    4,
                    'up',
                  )

              return (
                <path
                  key={`${serie.name}-${index}`}
                  d={d}
                  fill={SERIES[s % SERIES.length]}
                  onPointerEnter={(event) =>
                    active &&
                    setHover({
                      label: data.labels[index],
                      serie: many ? serie.name : null,
                      value,
                      x: event.nativeEvent.offsetX,
                      y: event.nativeEvent.offsetY,
                    })
                  }
                />
              )
            }),
          )}

        {(kind === 'line' || kind === 'area') &&
          data.series.map((serie, s) => {
            const step = plot.w / Math.max(1, serie.values.length - 1 || 1)
            const points = serie.values.map((value, index) => ({
              x: plot.x + (serie.values.length === 1 ? plot.w / 2 : index * step),
              y: plot.y + (1 - atValue(value)) * plot.h,
              value,
              label: data.labels[index],
            }))
            const line = points.map((point) => `${point.x} ${point.y}`).join(' L ')
            const color = SERIES[s % SERIES.length]
            const base = plot.y + (1 - atValue(Math.max(scale.min, 0))) * plot.h

            return (
              <g key={serie.name}>
                {kind === 'area' && (
                  // Une aire est un lavis, jamais un aplat saturé.
                  <path
                    d={`M ${points[0].x} ${base} L ${line} L ${points[points.length - 1].x} ${base} Z`}
                    fill={color}
                    opacity="0.1"
                  />
                )}
                <path
                  d={`M ${line}`}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((point) => (
                  <circle
                    key={point.x}
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill={color}
                    // Anneau à la couleur du fond : le point reste lisible sur la ligne.
                    stroke={SURFACE}
                    strokeWidth={GAP}
                    onPointerEnter={(event) =>
                      active &&
                      setHover({
                        label: point.label,
                        serie: many ? serie.name : null,
                        value: point.value,
                        x: event.nativeEvent.offsetX,
                        y: event.nativeEvent.offsetY,
                      })
                    }
                  />
                ))}
              </g>
            )
          })}

        {/* Étiquettes de catégories, une sur n quand la place manque. */}
        {data.labels.map((label, index) => {
          const every = Math.ceil(data.labels.length / (horizontal ? 12 : 8))
          if (index % every) return null
          const center = index * band + band / 2
          return horizontal ? (
            <text
              key={label + index}
              className="chart__label"
              x={plot.x - 6}
              y={plot.y + center + 3}
              textAnchor="end"
            >
              {label}
            </text>
          ) : (
            <text
              key={label + index}
              className="chart__label"
              x={plot.x + center}
              y={plot.y + plot.h + 15}
              textAnchor="middle"
            >
              {label}
            </text>
          )
        })}
      </svg>

      {legend}
      {tip}
    </div>
  )
}
