import { useEffect, useRef } from 'react'
import './QuickChat.css'

/**
 * Saisie rapide : elle s'ouvre à l'endroit du curseur quand on tape sur Entrée
 * pendant une session, comme un menu contextuel.
 */
export default function QuickChat({ at, value, onChange, onSend, onClose }) {
  const input = useRef(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  return (
    <div
      className="quick"
      style={{ left: Math.min(at.x, window.innerWidth - 300), top: Math.min(at.y + 18, window.innerHeight - 70) }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        ref={input}
        value={value}
        placeholder="Message rapide…"
        maxLength={280}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            onSend()
          }
          if (event.key === 'Escape') onClose()
        }}
        onBlur={onClose}
      />
      <kbd>↵</kbd>
    </div>
  )
}
