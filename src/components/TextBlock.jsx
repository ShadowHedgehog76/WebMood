import { useEffect, useRef } from 'react'
import { readableOn } from '../lib/palette.js'
import './TextBlock.css'

/** Note (fond coloré) ou texte simple, éditable au double-clic. */
export default function TextBlock({ item, editing, onChange, onEdit }) {
  const areaRef = useRef(null)
  const typed = useRef(false)
  const note = item.variant === 'note'

  useEffect(() => {
    typed.current = false
    if (editing) areaRef.current?.focus()
  }, [editing])

  const style = {
    '--tint': item.color,
    color: note ? readableOn(item.color) : item.color,
    fontSize: item.size ?? 16,
  }

  return (
    <div className={`text ${note ? 'text--note' : 'text--plain'}`} style={style}>
      {editing ? (
        <textarea
          ref={areaRef}
          className="text__body text__input"
          value={item.text}
          spellCheck={false}
          placeholder="Écrivez…"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') onEdit(null)
          }}
          onBlur={() => onEdit(null)}
          onChange={(event) => {
            onChange(item.id, { text: event.target.value }, !typed.current)
            typed.current = true
          }}
        />
      ) : (
        <p className={`text__body ${item.text ? '' : 'is-empty'}`}>{item.text || 'Écrivez…'}</p>
      )}
    </div>
  )
}
