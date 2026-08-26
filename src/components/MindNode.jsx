import { useEffect, useRef } from 'react'
import { IconCheck } from './Icons.jsx'
import './MindNode.css'

/**
 * Nœud de carte mentale : case à cocher sur les feuilles, jauge de progression sur les
 * nœuds qui ont des enfants. Le clic droit ouvre le menu de création d'enfant.
 */
export default function MindNode({ item, progress, leaf, editing, canEdit, onChange, onEdit, onToggle }) {
  const inputRef = useRef(null)
  const percent = Math.round(progress * 100)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const stop = (event) => event.stopPropagation()

  return (
    <div
      className={`node ${item.parent ? '' : 'is-root'} ${percent === 100 ? 'is-done' : ''}`}
      style={{ '--tint': item.color }}
    >
      <div className="node__row">
        {leaf ? (
          <button
            className="node__check"
            disabled={!canEdit}
            onPointerDown={stop}
            onClick={() => onToggle(item.id)}
            title={item.done ? 'Décocher' : 'Marquer comme terminé'}
          >
            {item.done && <IconCheck size={13} />}
          </button>
        ) : (
          <span className="node__percent">{percent}%</span>
        )}

        {editing ? (
          <input
            ref={inputRef}
            className="node__input"
            value={item.text}
            onPointerDown={stop}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter' || event.key === 'Escape') onEdit(null)
            }}
            onBlur={() => onEdit(null)}
            onChange={(event) => onChange(item.id, { text: event.target.value }, false)}
          />
        ) : (
          <span className="node__text">{item.text}</span>
        )}
      </div>

      {!leaf && (
        <div className="node__bar">
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}
