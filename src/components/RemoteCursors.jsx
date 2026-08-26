import { useEffect, useRef } from 'react'
import './RemoteCursors.css'

const EASE = 0.32

/**
 * Curseurs des autres participants. Les positions reçues alimentent une cible, et une
 * boucle d'animation rapproche le curseur affiché de cette cible : le déplacement reste
 * continu même si les messages arrivent par à-coups.
 */
export default function RemoteCursors({ peers, targets }) {
  const nodes = useRef(new Map())
  const shown = useRef(new Map())

  useEffect(() => {
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      for (const [id, node] of nodes.current) {
        const target = targets.current.get(id)
        if (!node || !target) continue

        const current = shown.current.get(id) ?? { ...target }
        // Un saut trop grand (arrivée, changement de vue) : on se place directement.
        const jump = Math.hypot(target.x - current.x, target.y - current.y) > 900
        current.x = jump ? target.x : current.x + (target.x - current.x) * EASE
        current.y = jump ? target.y : current.y + (target.y - current.y) * EASE
        shown.current.set(id, current)
        node.style.left = `${current.x}px`
        node.style.top = `${current.y}px`
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [targets])

  return peers.map((peer) => (
    <span
      key={peer.id}
      ref={(node) => {
        if (node) nodes.current.set(peer.id, node)
        else {
          nodes.current.delete(peer.id)
          shown.current.delete(peer.id)
        }
      }}
      className="peer-cursor"
      style={{ '--peer': peer.color }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          d="M2 1.5 2 14l3.3-3.2 2.1 4.7 2.2-1-2.1-4.6 4.6-.2Z"
          fill="var(--peer)"
          stroke="#fff"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span className="peer-cursor__name">{peer.name}</span>
    </span>
  ))
}
