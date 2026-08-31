import { useRef, useState } from 'react'
import { clampCrop, cropOf, resizeCrop } from '../lib/images.js'
import './ImageCrop.css'

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/**
 * Recadrage d'une image, posé par-dessus le bloc. Pendant l'opération, l'image est montrée
 * **entière** — assombrie hors de la fenêtre retenue — pour qu'on voie ce qu'on récupère et
 * pas seulement ce qu'on garde.
 *
 * L'image entière n'a pas le rapport du bloc (qui est celui de la part déjà retenue) : elle
 * est donc affichée en `contain`, et tout ce calque travaille dans le rectangle qu'elle
 * occupe réellement, pas dans la boîte du bloc.
 */
export default function ImageCrop({ item, scale, onDone, onCancel }) {
  const [crop, setCrop] = useState(() => cropOf(item))
  const drag = useRef(null)

  // Place de l'image entière dans le bloc, en fractions de celui-ci.
  const source = item.sourceRatio ?? item.ratio ?? item.w / item.h
  const box = item.w / item.h
  const fit =
    source > box
      ? { x: 0, y: (1 - box / source) / 2, w: 1, h: box / source }
      : { x: (1 - source / box) / 2, y: 0, w: source / box, h: 1 }

  // La fenêtre retenue, ramenée dans le repère du bloc.
  const win = {
    x: fit.x + crop.x * fit.w,
    y: fit.y + crop.y * fit.h,
    w: crop.w * fit.w,
    h: crop.h * fit.h,
  }
  const pc = (value) => `${value * 100}%`

  const start = (event, handle) => {
    event.stopPropagation()
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* pointeur déjà relâché */
    }
    drag.current = { handle, x: event.clientX, y: event.clientY, crop }
  }

  const move = (event) => {
    const state = drag.current
    if (!state) return
    // Pixels écran → fraction du bloc → fraction de l'image.
    const dx = (event.clientX - state.x) / scale / item.w / fit.w
    const dy = (event.clientY - state.y) / scale / item.h / fit.h

    setCrop(
      state.handle === 'move'
        ? clampCrop({ ...state.crop, x: state.crop.x + dx, y: state.crop.y + dy })
        : resizeCrop(state.crop, state.handle, dx, dy),
    )
  }

  const end = () => {
    drag.current = null
  }

  return (
    <div
      className="crop"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onDone(crop)
      }}
    >
      {/* Quatre volets d'ombre plutôt qu'un trou : pas de mélange, pas de flou. */}
      <div className="crop__veil" style={{ left: 0, right: 0, top: 0, height: pc(win.y) }} />
      <div
        className="crop__veil"
        style={{ left: 0, right: 0, bottom: 0, height: pc(1 - win.y - win.h) }}
      />
      <div
        className="crop__veil"
        style={{ left: 0, top: pc(win.y), width: pc(win.x), height: pc(win.h) }}
      />
      <div
        className="crop__veil"
        style={{ right: 0, top: pc(win.y), width: pc(1 - win.x - win.w), height: pc(win.h) }}
      />

      <div
        className="crop__window"
        style={{
          left: pc(win.x),
          top: pc(win.y),
          width: pc(win.w),
          height: pc(win.h),
          '--inv': 1 / scale,
        }}
        onPointerDown={(event) => start(event, 'move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {HANDLES.map((handle) => (
          <span
            key={handle}
            className={`crop__grip crop__grip--${handle}`}
            onPointerDown={(event) => start(event, handle)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
      </div>

      <div className="crop__bar" style={{ '--inv': 1 / scale }}>
        <button
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}
        >
          Tout
        </button>
        <button onPointerDown={(event) => event.stopPropagation()} onClick={() => onCancel()}>
          Annuler
        </button>
        <button
          className="is-main"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onDone(crop)}
        >
          Recadrer
        </button>
      </div>
    </div>
  )
}
