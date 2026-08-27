import { useEffect, useMemo, useRef } from 'react'
import { renderMarkdown } from '../lib/markdown.js'
import './MarkdownBlock.css'

/**
 * Bloc markdown : le texte source au double-clic, le rendu le reste du temps.
 * Le HTML est fabriqué ici même, à partir d'un texte entièrement échappé.
 */
export default function MarkdownBlock({ item, editing, onChange, onEdit }) {
  const areaRef = useRef(null)
  const typed = useRef(false)
  const html = useMemo(() => renderMarkdown(item.text), [item.text])

  useEffect(() => {
    typed.current = false
    if (editing) areaRef.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <div className="md is-editing" style={{ '--tint': item.color }}>
        <textarea
          ref={areaRef}
          className="md__input"
          value={item.text}
          spellCheck={false}
          placeholder="# Titre&#10;&#10;Du **markdown**…"
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
      </div>
    )
  }

  return (
    <div className="md" style={{ '--tint': item.color }}>
      <div
        className={`md__body ${item.text.trim() ? '' : 'is-empty'}`}
        dangerouslySetInnerHTML={{ __html: item.text.trim() ? html : '<p>Double-cliquez pour écrire…</p>' }}
      />
    </div>
  )
}
