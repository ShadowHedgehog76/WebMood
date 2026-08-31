import { useState } from 'react'
import Thumb from './Thumb.jsx'
import { IconTrash } from './Icons.jsx'
import './Library.css'

/**
 * Bibliothèque de modèles : des morceaux de tableau mis de côté pour être reposés ailleurs.
 * Un clic pose le modèle au centre de la vue ; le nom se change sur place.
 */
export default function Library({ open, stencils, onClose, onPlace, onRename, onRemove }) {
  const [editing, setEditing] = useState(null)

  if (!open) return null

  return (
    <div className="library" onPointerDown={onClose}>
      <div className="library__panel" onPointerDown={(event) => event.stopPropagation()}>
        <div className="library__head">
          <h2>Bibliothèque</h2>
          <button className="library__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        {stencils.length === 0 ? (
          <p className="library__empty">
            Rien pour l'instant. Sélectionnez un ou plusieurs blocs, puis
            <strong> Enregistrer comme modèle</strong> dans la barre de réglages : ils
            attendront ici, prêts à être reposés sur n'importe quel tableau.
          </p>
        ) : (
          <ul className="library__list">
            {stencils.map((stencil) => (
              <li key={stencil.id} className="library__entry">
                <button
                  className="library__place"
                  onClick={() => onPlace(stencil)}
                  title="Poser au centre de la vue"
                >
                  <Thumb preview={stencil.preview} />
                </button>

                {editing === stencil.id ? (
                  <input
                    className="library__name"
                    defaultValue={stencil.name}
                    autoFocus
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') setEditing(null)
                    }}
                    onBlur={(event) => {
                      onRename(stencil.id, event.target.value.trim() || stencil.name)
                      setEditing(null)
                    }}
                  />
                ) : (
                  <button className="library__label" onClick={() => setEditing(stencil.id)}>
                    <span>{stencil.name}</span>
                    <small>
                      {stencil.items.length} bloc{stencil.items.length > 1 ? 's' : ''}
                    </small>
                  </button>
                )}

                <button
                  className="library__remove"
                  onClick={() => onRemove(stencil.id)}
                  aria-label={`Retirer ${stencil.name}`}
                >
                  <IconTrash size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
