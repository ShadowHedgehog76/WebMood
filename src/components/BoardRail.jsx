import { useEffect, useRef, useState } from 'react'
import {
  IconBoardPlus,
  IconBraces,
  IconCheck,
  IconCopy,
  IconExportSelection,
  IconImage,
  IconHelp,
  IconSettings,
  IconShare,
  IconTrash,
  IconUpload,
} from './Icons.jsx'
import './BoardRail.css'

/** Miniature d'un tableau, dessinée depuis les rectangles stockés dans l'index. */
function Thumb({ preview }) {
  return (
    <span className="thumb">
      <span className="thumb__inner" style={{ aspectRatio: preview?.ratio || 1 }}>
        {preview?.rects?.map((rect, index) => (
          <span
            key={index}
            className={`thumb__rect thumb__rect--${rect.t}`}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${Math.max(3, rect.w * 100)}%`,
              height: `${Math.max(3, rect.h * 100)}%`,
              background: rect.c ?? undefined,
            }}
          />
        ))}
      </span>
    </span>
  )
}

/**
 * Rail de gauche : réduit, il montre les vignettes ; au survol il s'ouvre sur la liste
 * des tableaux et les actions de fichier.
 */
export default function BoardRail({
  boards,
  currentId,
  onSwitch,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onExportPng,
  onExportSelection,
  onExportJson,
  onImportJson,
  onShare,
  onTour,
  onSettings,
  live,
  hasSelection,
}) {
  const current = boards.find((board) => board.id === currentId)
  const [name, setName] = useState(current?.name ?? '')
  const [open, setOpen] = useState(false) // ouverture au doigt : le survol n'existe pas
  const fileRef = useRef(null)
  const root = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const away = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  useEffect(() => {
    setName(current?.name ?? '')
  }, [current?.name])

  return (
    <nav
      ref={root}
      className={`rail ${open ? 'is-open' : ''}`}
      aria-label="Tableaux"
      onPointerDown={(event) => {
        if (event.pointerType === 'touch') setOpen(true)
      }}
    >
      <div className="rail__inner">
        

        <div className="rail__boards">
          {boards.map((board) => (
            <button
              key={board.id}
              className={`rail__board ${board.id === currentId ? 'is-current' : ''}`}
              onClick={() => onSwitch(board.id)}
              title={board.name}
            >
              <span className="rail__slot">
                <Thumb preview={board.preview} />
              </span>
              <span className="rail__name">{board.name}</span>
              {board.id === currentId && <IconCheck size={13} />}
            </button>
          ))}
        </div>

        <button className="rail__action" onClick={onCreate}>
          <span className="rail__slot">
            <IconBoardPlus size={18} />
          </span>
          <span>Nouveau tableau</span>
        </button>

        <span className="rail__sep" />

        <input
          className="rail__rename"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => onRename(name.trim() || 'Sans titre')}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />

        <button className="rail__action" onClick={onDuplicate}>
          <span className="rail__slot">
            <IconCopy size={18} />
          </span>
          <span>Dupliquer ce tableau</span>
        </button>
        <button
          className="rail__action rail__action--danger"
          onClick={onDelete}
          disabled={boards.length < 2}
        >
          <span className="rail__slot">
            <IconTrash size={18} />
          </span>
          <span>Supprimer ce tableau</span>
        </button>

        <span className="rail__sep" />

        <button className="rail__action" onClick={onSettings}>
          <span className="rail__slot">
            <IconSettings size={18} />
          </span>
          <span>Réglages</span>
        </button>

        <button className="rail__action" onClick={onTour}>
          <span className="rail__slot">
            <IconHelp size={18} />
          </span>
          <span>Découvrir le tableau</span>
        </button>

        <button className={`rail__action ${live ? 'is-live' : ''}`} onClick={onShare}>
          <span className="rail__slot">
            <IconShare size={18} />
          </span>
          <span>{live ? 'Session en cours' : 'Partager ce tableau'}</span>
        </button>

        <span className="rail__sep" />

        <button className="rail__action" onClick={onExportPng}>
          <span className="rail__slot">
            <IconImage size={18} />
          </span>
          <span>Image PNG</span>
        </button>
        <button className="rail__action" onClick={onExportSelection} disabled={!hasSelection}>
          <span className="rail__slot">
            <IconExportSelection size={18} />
          </span>
          <span>PNG de la sélection</span>
        </button>
        <button className="rail__action" onClick={onExportJson}>
          <span className="rail__slot">
            <IconBraces size={18} />
          </span>
          <span>Exporter en JSON</span>
        </button>
        <button className="rail__action" onClick={() => fileRef.current?.click()}>
          <span className="rail__slot">
            <IconUpload size={18} />
          </span>
          <span>Importer un JSON…</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onImportJson(file)
          }}
        />
      </div>
    </nav>
  )
}
