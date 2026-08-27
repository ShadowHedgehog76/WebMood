import { memo, useEffect, useMemo, useRef } from 'react'
import FrameBlock from './FrameBlock.jsx'
import GroupBlock from './GroupBlock.jsx'
import MindNode from './MindNode.jsx'
import ShapeBlock from './ShapeBlock.jsx'
import TableBlock from './TableBlock.jsx'
import TextBlock from './TextBlock.jsx'
import SketchBlock from './SketchBlock.jsx'
import { IconLock } from './Icons.jsx'
import { highlight } from '../lib/highlight.js'
import './BoardItem.css'

// Taille minimale par type : un bloc visuel garde une forme rectangulaire horizontale,
// assez large pour le code à gauche et le rendu à droite.
const MIN_SIZES = {
  sketch: { w: 460, h: 240 },
  group: { w: 320, h: 200 },
  shape: { w: 16, h: 16 },
  table: { w: 200, h: 70 },
  text: { w: 90, h: 48 },
  code: { w: 180, h: 90 },
  default: { w: 60, h: 60 },
}

function BoardItem({
  item,
  scale,
  selected,
  soloSelected,
  editing,
  interactive,
  draggable,
  locked,
  rank,
  votes,
  linkTarget,
  tween,
  toWorld,
  onSelect,
  onChange,
  onEdit,
  onDelete,
  onExport,
  onDragEnd,
  onSnap,
  onMenu,
  progress,
  leaf,
  onToggleDone,
}) {
  const drag = useRef(null)
  const textareaRef = useRef(null)
  // Une seule entrée d'historique par session d'édition, pas une par caractère.
  const typed = useRef(false)

  useEffect(() => {
    typed.current = false
    if (editing) textareaRef.current?.focus()
  }, [editing])

  const html = useMemo(
    () => (item.type === 'code' ? highlight(item.text) : ''),
    [item.type, item.text],
  )

  const startDrag = (event, mode) => {
    // Alt + clic sert à pointer : on laisse l'événement filer jusqu'au tableau.
    if (event.altKey) return

    // Clic droit sur un bloc : on garde l'événement pour son menu, pas pour naviguer.
    if (event.button === 2) {
      if (interactive) event.stopPropagation()
      return
    }
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect(item.id, event.shiftKey)
    if (editing || !draggable) return

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointeur déjà relâché : on continue sans capture.
    }
    const point = toWorld(event.clientX, event.clientY)
    drag.current = {
      mode,
      id: event.pointerId,
      point,
      offsetX: item.x - point.x,
      offsetY: item.y - point.y,
      startW: item.w,
      startH: item.h,
      startPoint: point,
      first: true,
    }
  }

  const onPointerMove = (event) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    const point = toWorld(event.clientX, event.clientY)
    state.point = point

    if (state.mode === 'move') {
      const free = {
        x: Math.round(point.x + state.offsetX),
        y: Math.round(point.y + state.offsetY),
      }
      const snapped = onSnap ? onSnap(item.id, free.x, free.y) : free
      onChange(item.id, snapped, state.first)
    } else {
      const min = MIN_SIZES[item.type] ?? MIN_SIZES.default
      const w = Math.max(min.w, Math.round(state.startW + (point.x - state.startPoint.x)))
      let h = Math.max(min.h, Math.round(state.startH + (point.y - state.startPoint.y)))
      // Les images conservent leur rapport d'aspect.
      if (item.type === 'image' && item.ratio) h = Math.round(w / item.ratio)
      onChange(item.id, { w, h }, state.first)
    }
    state.first = false
  }

  const endDrag = () => {
    const state = drag.current
    drag.current = null
    if (state?.mode === 'move') onDragEnd?.(item.id, state.point)
  }

  return (
    <div
      className={[
        'item',
        `item--${item.type}`,
        selected ? 'is-selected' : '',
        editing ? 'is-editing' : '',
        linkTarget ? 'is-link-target' : '',
        locked ? 'is-locked' : '',
        tween ? 'is-tween' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-id={item.id}
      style={{
        left: item.x,
        top: item.y,
        width: item.w,
        height: item.h,
        '--inv': 1 / scale,
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: linkTarget ? 'crosshair' : draggable ? 'move' : 'default',
      }}
      onPointerDown={(event) => startDrag(event, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(event) => {
        // Les blocs visuels ont leur éditeur toujours ouvert : rien à basculer.
        if (!draggable || !['code', 'node', 'text', 'table'].includes(item.type)) return
        event.stopPropagation()
        onEdit(editing ? null : item.id)
      }}
      onContextMenu={(event) => {
        if (!interactive || !onMenu) return
        event.preventDefault()
        event.stopPropagation()
        onSelect(item.id)
        onMenu(item, { x: event.clientX, y: event.clientY })
      }}
    >
      {locked && selected && (
        <span className="item__lock" title="Bloc verrouillé">
          <IconLock size={13} />
        </span>
      )}

      {item.type === 'image' && <img src={item.src} alt={item.name} draggable={false} />}

      {item.type === 'dot' && <span className="dot" style={{ background: item.color }} />}

      {votes > 0 && <span className="item__votes">{votes}</span>}

      {item.type === 'frame' && <FrameBlock item={item} rank={rank} />}

      {item.type === 'group' && <GroupBlock item={item} />}

      {item.type === 'shape' && <ShapeBlock item={item} />}

      {item.type === 'table' && (
        <TableBlock item={item} editing={editing} onChange={onChange} onEdit={onEdit} />
      )}

      {item.type === 'text' && (
        <TextBlock item={item} editing={editing} onChange={onChange} onEdit={onEdit} />
      )}

      {item.type === 'node' && (
        <MindNode
          item={item}
          progress={progress}
          leaf={leaf}
          editing={editing}
          canEdit={Boolean(draggable)}
          onChange={onChange}
          onEdit={onEdit}
          onToggle={onToggleDone}
        />
      )}

      {item.type === 'sketch' && (
        <SketchBlock
          item={item}
          canEdit={Boolean(draggable)}
          onChange={onChange}
          onExport={onExport}
        />
      )}

      {item.type === 'code' && (
        <div className="code">
          <div className="code__bar">
            <span className="code__name">{item.name || 'extrait'}</span>
            <span className="code__lang">{item.lang}</span>
          </div>
          {editing ? (
            <textarea
              ref={textareaRef}
              className="code__body code__input"
              value={item.text}
              spellCheck={false}
              onChange={(event) => {
                onChange(item.id, { text: event.target.value }, !typed.current)
                typed.current = true
              }}
              onBlur={() => onEdit(null)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape') onEdit(null)
              }}
              onPointerDown={(event) => event.stopPropagation()}
            />
          ) : (
            <pre className="code__body">
              <code dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
          )}
        </div>
      )}

      {soloSelected && draggable && !editing && (
        <>
          <button
            className="item__delete"
            title="Supprimer (Suppr)"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onDelete(item.id)}
          >
            ✕
          </button>
          {/* Les nœuds sont dimensionnés par la mise en page automatique. */}
          {item.type !== 'node' && (
            <span
              className="item__handle"
              onPointerDown={(event) => startDrag(event, 'resize')}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
            />
          )}
        </>
      )}
    </div>
  )
}

// Un déplacement de la vue ne change aucune de ces props : la mémoïsation évite de
// re-rendre tous les blocs (et leurs aperçus) à chaque image d'un panoramique.
export default memo(BoardItem)
