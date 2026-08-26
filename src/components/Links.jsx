import { memo } from 'react'
import { ARROW_STYLES, arrowHead, linkGeometry, pendingGeometry } from '../lib/links.js'
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

function Links({ links, items, branches, view, selectedId, interactive, pending, onSelect }) {
  const byId = new Map(items.map((item) => [item.id, item]))

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
        const from = byId.get(link.from)
        const to = byId.get(link.to)
        if (!from || !to) return null

        const geometry = linkGeometry(toScreen(from, view), toScreen(to, view))
        const selected = selectedId === link.id
        const color = link.color || '#1c1c1e'
        const width = (link.width || 2) * view.scale

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
