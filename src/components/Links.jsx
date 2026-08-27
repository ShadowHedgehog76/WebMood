import { memo } from 'react'
import {
  ARROW_STYLES,
  arcDirection,
  arcPath,
  arrowHead,
  linkGeometry,
  pendingGeometry,
  resolveEnd,
} from '../lib/links.js'
import { branchPath } from '../lib/mindmap.js'
import './Links.css'

/**
 * Calque des connexions, dessiné en coordonnées écran : le SVG fait la taille de la
 * fenêtre au lieu de couvrir tout l'espace « monde », ce qui évite au navigateur de
 * gérer une surface géante à chaque déplacement de la vue.
 */
function toScreen(item, view) {
  return {
    x: item.x * view.scale + view.x,
    y: item.y * view.scale + view.y,
    w: item.w * view.scale,
    h: item.h * view.scale,
  }
}

function Links({ links, items, branches, view, selectedId, interactive, pending, arc, onSelect }) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const project = (point) => ({
    x: point.x * view.scale + view.x,
    y: point.y * view.scale + view.y,
  })

  return (
    <svg className="links">
      {/* Branches de carte mentale : dérivées de la hiérarchie, accrochées selon la disposition. */}
      {branches.map(({ id, from, to, layout }) => {
        const d = branchPath(layout, toScreen(from, view), toScreen(to, view), 12 * view.scale)
        return (
          <path
            key={id}
            className="branch"
            d={d}
            stroke={to.color || '#3b82f6'}
            strokeWidth={2 * view.scale}
          />
        )
      })}

      {links.map((link) => {
        const color = link.color || '#1c1c1e'
        const width = (link.width || 2) * view.scale
        const selected = selectedId === link.id

        // Arc : deux extrémités libres ou accrochées, et un point de courbure.
        if (link.kind === 'arc') {
          const a = resolveEnd(link.from, byId)
          const b = resolveEnd(link.to, byId)
          if (!a || !b) return null

          const start = project(a)
          const end = project(b)
          const bend = project(link.bend)
          const d = arcPath(start, bend, end)

          return (
            <g key={link.id} className={`link ${selected ? 'is-selected' : ''}`}>
              {selected && <path className="link__halo" d={d} strokeWidth={width * 4.5} />}
              <path className="link__line" d={d} stroke={color} strokeWidth={width} fill="none" />
              {(link.arrow === 'start' || link.arrow === 'both') && (
                <path d={arrowHead(start, arcDirection(bend, start), width * 5)} fill={color} />
              )}
              {(link.arrow === 'end' || link.arrow === 'both') && (
                <path d={arrowHead(end, arcDirection(bend, end), width * 5)} fill={color} />
              )}
              {interactive && (
                <path
                  className="link__hit"
                  d={d}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onSelect(link.id)
                  }}
                />
              )}
            </g>
          )
        }

        const from = byId.get(link.from)
        const to = byId.get(link.to)
        if (!from || !to) return null

        const geometry = linkGeometry(toScreen(from, view), toScreen(to, view))

        return (
          <g key={link.id} className={`link ${selected ? 'is-selected' : ''}`}>
            {selected && <path className="link__halo" d={geometry.d} strokeWidth={width * 4.5} />}
            <path
              className="link__line"
              d={geometry.d}
              stroke={color}
              strokeWidth={width}
              fill="none"
            />
            {(link.arrow === 'start' || link.arrow === 'both') && (
              <path d={arrowHead(geometry.start, geometry.startDir, width * 5)} fill={color} />
            )}
            {(link.arrow === 'end' || link.arrow === 'both') && (
              <path d={arrowHead(geometry.end, geometry.endDir, width * 5)} fill={color} />
            )}
            {interactive && (
              <path
                className="link__hit"
                d={geometry.d}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onSelect(link.id)
                }}
              />
            )}
          </g>
        )
      })}

      {arc && (
        <path
          className="link__pending"
          d={arcPath(project(arc.from), project(arc.bend), project(arc.to))}
        />
      )}

      {pending && (
        <path
          className="link__pending"
          d={
            pendingGeometry(toScreen(pending.from, view), {
              x: pending.point.x * view.scale + view.x,
              y: pending.point.y * view.scale + view.y,
            }).d
          }
        />
      )}
    </svg>
  )
}

export default memo(Links)
export { ARROW_STYLES }
