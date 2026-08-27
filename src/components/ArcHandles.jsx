import { useRef } from 'react'
import { controlsOf, resolveEnd } from '../lib/links.js'
import './ArcHandles.css'

/**
 * Poignées d'un arc sélectionné : ses deux extrémités et son point de courbure.
 * Une extrémité lâchée près d'un bloc s'y accroche (côtés et centre).
 */
export default function ArcHandles({ link, items, snap, toWorld, onDrag, onDrop }) {
  const dragging = useRef(null)
  const byId = new Map(items.map((item) => [item.id, item]))

  const from = resolveEnd(link.from, byId)
  const to = resolveEnd(link.to, byId)
  if (!from || !to) return null

  const { c1, c2 } = controlsOf(link, from, to)
  const handles = [
    { key: 'from', point: from },
    { key: 'to', point: to },
    { key: 'c1', point: c1, tangent: true },
    { key: 'c2', point: c2, tangent: true },
  ]

  return (
    <>
      {snap && <span className="arc-snap" style={{ left: snap.x, top: snap.y }} />}

      {/* Les traits fins relient chaque extrémité à sa tangente. */}
      {[[from, c1], [to, c2]].map(([end, control], index) => (
        <span
          key={index}
          className="arc-rod"
          style={{
            left: end.x,
            top: end.y,
            width: Math.hypot(control.x - end.x, control.y - end.y),
            transform: `rotate(${Math.atan2(control.y - end.y, control.x - end.x)}rad)`,
          }}
        />
      ))}

      {handles.map((handle) => {
        const { key, point } = handle
        return (
        <span
          key={key}
          className={`arc-handle ${handle.tangent ? 'is-tangent' : ''}`}
          style={{ left: point.x, top: point.y }}
          onPointerDown={(event) => {
            event.stopPropagation()
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              /* pointeur déjà relâché */
            }
            dragging.current = { key, id: event.pointerId }
          }}
          onPointerMove={(event) => {
            const state = dragging.current
            if (!state || state.id !== event.pointerId) return
            onDrag(state.key, toWorld(event.clientX, event.clientY))
          }}
          onPointerUp={(event) => {
            const state = dragging.current
            dragging.current = null
            if (state) onDrop(state.key, toWorld(event.clientX, event.clientY))
          }}
          />
        )
      })}
    </>
  )
}
