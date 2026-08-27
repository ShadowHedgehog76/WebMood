import { useRef } from 'react'
import { inOf, nodesOf, outOf, isClosed, pointOnCurve, projector } from '../lib/paths.js'
import './PathHandles.css'

/**
 * Poignées d'une forme sélectionnée : un point par nœud, ses deux tangentes, et un
 * repère au milieu de chaque segment pour y ajouter un nœud. C'est le même vocabulaire
 * que les arcs — une forme est devenue un arc à plusieurs points.
 */
export default function PathHandles({ item, snap, toWorld, onDrag, onDrop, onAdd, onRemove }) {
  const dragging = useRef(null)
  const nodes = nodesOf(item)
  if (nodes.length < 2) return null

  const closed = isClosed(item)
  const { toBoard, toUnit } = projector(item)

  const grab = (index, key) => ({
    onPointerDown: (event) => {
      event.stopPropagation()
      // Alt sur un nœud : on le retire. C'est le geste le plus court pour dégrossir
      // un tracé à main levée, qui en compte toujours trop.
      if (event.altKey && key === 'point') {
        onRemove(index)
        return
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* pointeur déjà relâché */
      }
      dragging.current = { index, key, id: event.pointerId }
    },
    onPointerMove: (event) => {
      const state = dragging.current
      if (!state || state.id !== event.pointerId) return
      onDrag(state.index, state.key, toUnit(toWorld(event.clientX, event.clientY)), event.altKey)
    },
    onPointerUp: () => {
      const state = dragging.current
      if (!state) return
      dragging.current = null
      onDrop(state.key === 'point' ? state.index : undefined)
    },
  })

  const segments = closed ? nodes.length : nodes.length - 1

  return (
    <>
      {/* Le nœud visé par la poignée en cours : il l'attend. */}
      {snap && <span className="arc-snap" style={{ left: snap.x, top: snap.y }} />}

      {/* Tiges entre chaque nœud et ses tangentes. */}
      {nodes.flatMap((entry, index) =>
        ['in', 'out']
          .filter((key) => entry[key])
          .map((key) => {
            const from = toBoard(entry)
            const to = toBoard(entry[key])
            return (
              <span
                key={`${index}-${key}-rod`}
                className="arc-rod"
                style={{
                  left: from.x,
                  top: from.y,
                  width: Math.hypot(to.x - from.x, to.y - from.y),
                  transform: `rotate(${Math.atan2(to.y - from.y, to.x - from.x)}rad)`,
                }}
              />
            )
          }),
      )}

      {/* Milieu de segment : un clic y pose un nœud sans déformer la courbe. */}
      {Array.from({ length: segments }, (_, index) => {
        const from = nodes[index]
        const to = nodes[(index + 1) % nodes.length]
        const middle = toBoard(pointOnCurve(from, outOf(from), inOf(to), to, 0.5))
        return (
          <span
            key={`add-${index}`}
            className="path-add"
            title="Ajouter un nœud"
            style={{ left: middle.x, top: middle.y }}
            onPointerDown={(event) => {
              event.stopPropagation()
              onAdd(index)
            }}
          />
        )
      })}

      {nodes.flatMap((entry, index) => {
        const point = toBoard(entry)
        const handles = [
          <span
            key={`${index}-point`}
            className="arc-handle"
            title="Glisser pour déplacer · Alt pour retirer"
            style={{ left: point.x, top: point.y }}
            {...grab(index, 'point')}
          />,
        ]

        for (const key of ['in', 'out']) {
          if (!entry[key]) continue
          const tangent = toBoard(entry[key])
          handles.push(
            <span
              key={`${index}-${key}`}
              className="arc-handle is-tangent"
              title="Tangente · Alt pour la briser"
              style={{ left: tangent.x, top: tangent.y }}
              {...grab(index, key)}
            />,
          )
        }

        return handles
      })}
    </>
  )
}
