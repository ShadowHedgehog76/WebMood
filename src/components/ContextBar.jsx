import { useEffect, useRef, useState } from 'react'

/**
 * Barre de réglages flottante, posée au-dessus de la barre d'outils. Sa largeur suit son
 * contenu — mesuré, puis animé — pour que la barre principale ne bouge jamais.
 */
export default function ContextBar({ visible, children }) {
  const inner = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = inner.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.ceil(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={`context-bar ${visible ? 'is-visible' : ''}`}
      style={width ? { width: width + 12 } : undefined}
      aria-hidden={!visible}
    >
      <div ref={inner} className="context-bar__inner">
        {children}
      </div>
    </div>
  )
}
