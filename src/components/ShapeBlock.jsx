import { CLOSED } from '../lib/shapes.js'
import { DOUBLE_SPREAD, dashArray, isDouble } from '../lib/dashes.js'
import { isClosed, nodesOf, pathData } from '../lib/paths.js'

import './ShapeBlock.css'

const HEAD = 14

/**
 * Rendu d'une forme. Rectangle, ellipse ou tracé à main levée, c'est toujours le même
 * chemin de nœuds : les anciennes formes fabriquent les leurs à la lecture. Les
 * coordonnées suivent la taille réelle du bloc, le trait garde donc son épaisseur.
 */
export default function ShapeBlock({ item }) {
  const stroke = Math.max(1, item.strokeWidth ?? 3)
  const pad = stroke / 2 + 1
  const w = Math.max(1, item.w)
  const h = Math.max(1, item.h)
  const filled = item.filled && (item.nodes ? isClosed(item) : CLOSED.has(item.kind))
  const double = isDouble(item.dash)

  const nodes = nodesOf(item)
  if (nodes.length < 2) return null

  // Les nœuds sont rangés en proportions : ils prennent ici la taille du bloc.
  const project = (point) => ({
    x: pad + point.x * Math.max(0, w - pad * 2),
    y: pad + point.y * Math.max(0, h - pad * 2),
  })
  const d = pathData(nodes, isClosed(item), project)

  const common = {
    stroke: item.color,
    strokeWidth: stroke,
    fill: 'none',
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  }

  const outline = (extra) => <path d={d} {...common} {...extra} />

  const a = project(nodes[0])
  const b = project(nodes.at(-1))

  return (
    <svg className="shape" width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
      {/* Le remplissage est posé à part : il ne doit pas suivre le motif du contour. */}
      {filled && outline({ fill: item.color, fillOpacity: 0.18, stroke: 'none' })}

      {double ? (
        <>
          {/* Trait double : on évide le cœur d'un trait large, et les deux bords
              restent parallèles quelle que soit la forme. */}
          <mask
            id={`double-${item.id}`}
            maskUnits="userSpaceOnUse"
            x={-w}
            y={-h}
            width={w * 3}
            height={h * 3}
          >
            {outline({ stroke: '#fff', strokeWidth: stroke * DOUBLE_SPREAD })}
            {outline({ stroke: '#000' })}
          </mask>
          {outline({ strokeWidth: stroke * DOUBLE_SPREAD, mask: `url(#double-${item.id})` })}
        </>
      ) : (
        outline({ strokeDasharray: dashArray(item.dash, stroke) })
      )}

      {item.kind === 'arrow' && (
        <path
          d={arrowHead(a.x, a.y, b.x, b.y, Math.max(HEAD, stroke * 3.5))}
          {...common}
          fill={item.color}
        />
      )}
    </svg>
  )
}

function arrowHead(x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const spread = 0.42
  const left = { x: x2 - Math.cos(angle - spread) * size, y: y2 - Math.sin(angle - spread) * size }
  const right = { x: x2 - Math.cos(angle + spread) * size, y: y2 - Math.sin(angle + spread) * size }
  return `M${x2} ${y2} L${left.x} ${left.y} L${right.x} ${right.y} Z`
}
