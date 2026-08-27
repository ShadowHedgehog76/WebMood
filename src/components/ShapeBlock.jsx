import { CLOSED } from '../lib/shapes.js'
import './ShapeBlock.css'

const HEAD = 14

/**
 * Rendu SVG d'une forme dans la boîte de l'élément. Les coordonnées suivent la taille
 * réelle du bloc : le trait garde donc son épaisseur quel que soit le redimensionnement.
 */
export default function ShapeBlock({ item }) {
  const stroke = Math.max(1, item.strokeWidth ?? 3)
  const pad = stroke / 2 + 1
  const w = Math.max(1, item.w)
  const h = Math.max(1, item.h)
  const right = w - pad
  const bottom = h - pad
  const fill = item.filled && CLOSED.has(item.kind) ? item.color : 'none'

  const common = {
    stroke: item.color,
    strokeWidth: stroke,
    fill,
    fillOpacity: item.filled ? 0.18 : 1,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  }

  return (
    <svg className="shape" width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
      {item.kind === 'rect' && (
        <rect
          x={pad}
          y={pad}
          width={Math.max(0, right - pad)}
          height={Math.max(0, bottom - pad)}
          rx={Math.min(14, w / 6, h / 6)}
          {...common}
        />
      )}

      {item.kind === 'ellipse' && (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={Math.max(0, w / 2 - pad)}
          ry={Math.max(0, h / 2 - pad)}
          {...common}
        />
      )}

      {item.kind === 'triangle' && (
        <path d={`M${w / 2} ${pad} L${right} ${bottom} L${pad} ${bottom} Z`} {...common} />
      )}

      {item.kind === 'diamond' && (
        <path
          d={`M${w / 2} ${pad} L${right} ${h / 2} L${w / 2} ${bottom} L${pad} ${h / 2} Z`}
          {...common}
        />
      )}

      {item.kind === 'free' && item.points?.length > 1 && (
        <path
          d={freePath(item.points, pad, w - pad * 2, h - pad * 2, item.closed)}
          {...common}
        />
      )}

      {(item.kind === 'line' || item.kind === 'arrow') &&
        (() => {
          // Sans repères enregistrés, on garde le tracé historique : bas-gauche vers haut-droite.
          const ends = item.ends ?? { a: { x: 0, y: 1 }, b: { x: 1, y: 0 } }
          const at = (point) => ({
            x: pad + point.x * Math.max(0, w - pad * 2),
            y: pad + point.y * Math.max(0, h - pad * 2),
          })
          const a = at(ends.a)
          const b = at(ends.b)
          return (
            <>
              <path d={`M${a.x} ${a.y} L${b.x} ${b.y}`} {...common} fill="none" />
              {item.kind === 'arrow' && (
                <path
                  d={arrowHead(a.x, a.y, b.x, b.y, Math.max(HEAD, stroke * 3.5))}
                  {...common}
                  fill={item.color}
                  fillOpacity="1"
                />
              )}
            </>
          )
        })()}
    </svg>
  )
}

/** Chemin d'une forme à main levée : les proportions reprennent la taille du bloc. */
function freePath(points, pad, width, height, closed) {
  const at = (point) => `${pad + point.x * width} ${pad + point.y * height}`
  const path = [`M${at(points[0])}`, ...points.slice(1).map((point) => `L${at(point)}`)]
  if (closed) path.push('Z')
  return path.join(' ')
}

function arrowHead(x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const spread = 0.42
  const left = { x: x2 - Math.cos(angle - spread) * size, y: y2 - Math.sin(angle - spread) * size }
  const right = { x: x2 - Math.cos(angle + spread) * size, y: y2 - Math.sin(angle + spread) * size }
  return `M${x2} ${y2} L${left.x} ${left.y} L${right.x} ${right.y} Z`
}
