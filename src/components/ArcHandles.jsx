import { useRef } from 'react'
import { resolveEnd } from '../lib/links.js'
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

  const handles = [
    { key: 'from', point: from },
    { key: 'bend', point: link.bend },
    { key: 'to', point: to },
  ]

  return (
    <>
      {snap && (
        <span className="arc-snap" style={{ left: snap.x, top: snap.y }} />
      )}

      {handles.map(({ key, point }) => (
        <span
          key={key}
          className={`arc-handle ${key === 'bend' ? 'is-bend' : ''}`}
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
      ))}
    </>
  )
}
