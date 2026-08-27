import { useRef, useState } from 'react'
import { ATTRIBUTION, MAX_ZOOM, MIN_ZOOM, panned, project, tilesFor, unproject } from '../lib/geo.js'
import './MapBlock.css'

/**
 * Carte glissante. Les tuiles viennent d'OpenStreetMap : c'est la seule chose du tableau
 * qui sorte du navigateur, et rien n'y est envoyé — on ne fait que demander des images.
 * Hors édition la carte est une image comme une autre ; au double-clic elle se manipule.
 */
export default function MapBlock({ item, editing, onChange, onEdit }) {
  const [pinning, setPinning] = useState(false)
  const drag = useRef(null)

  const view = { lat: item.lat, lon: item.lon, zoom: item.zoom, w: item.w, h: item.h }
  const tiles = tilesFor(view)
  const pins = item.pins ?? []

  const zoomBy = (step) => {
    onChange(item.id, { zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, item.zoom + step)) }, true)
  }

  const onPointerDown = (event) => {
    if (!editing) return
    event.stopPropagation()

    if (pinning) {
      const box = event.currentTarget.getBoundingClientRect()
      const scale = box.width / item.w // le tableau peut être zoomé
      const point = unproject(view, {
        x: (event.clientX - box.left) / scale,
        y: (event.clientY - box.top) / scale,
      })
      onChange(item.id, { pins: [...pins, point] }, true)
      setPinning(false)
      return
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* pointeur déjà relâché */
    }
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view }
  }

  const onPointerMove = (event) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    event.stopPropagation()
    const box = event.currentTarget.getBoundingClientRect()
    const scale = box.width / item.w
    const center = panned(state.view, (event.clientX - state.x) / scale, (event.clientY - state.y) / scale)
    onChange(item.id, center, false)
  }

  const endDrag = () => {
    drag.current = null
  }

  return (
    <div
      className={`map ${editing ? 'is-editing' : ''} ${pinning ? 'is-pinning' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="map__tiles">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            loading="lazy"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
      </div>

      {pins.map((pin, index) => {
        const point = project(view, pin)
        return (
          <span
            key={index}
            className="map__pin"
            title={editing ? 'Retirer cette épingle' : `${pin.lat.toFixed(4)}, ${pin.lon.toFixed(4)}`}
            style={{ left: point.x, top: point.y }}
            onPointerDown={(event) => {
              if (!editing) return
              event.stopPropagation()
              onChange(item.id, { pins: pins.filter((_, i) => i !== index) }, true)
            }}
          />
        )
      })}

      {editing && (
        <div className="map__bar" onPointerDown={(event) => event.stopPropagation()}>
          <button onClick={() => zoomBy(-1)} disabled={item.zoom <= MIN_ZOOM} aria-label="Dézoomer la carte">
            −
          </button>
          <span>{item.zoom}</span>
          <button onClick={() => zoomBy(1)} disabled={item.zoom >= MAX_ZOOM} aria-label="Zoomer la carte">
            +
          </button>
          <button
            className={pinning ? 'is-active' : ''}
            onClick={() => setPinning((on) => !on)}
            aria-label="Poser une épingle"
          >
            ●
          </button>
          <button onClick={() => onEdit(null)} aria-label="Terminer">
            ✓
          </button>
        </div>
      )}

      <span className="map__credit">{ATTRIBUTION}</span>
    </div>
  )
}
