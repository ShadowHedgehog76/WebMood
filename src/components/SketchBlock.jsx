import { useEffect, useRef, useState } from 'react'
import { IconDownload, IconPause, IconPlay } from './Icons.jsx'
import { SKETCH_MODES, createSketch, parseMode } from '../lib/sketch.js'
import './SketchBlock.css'

const MIN_SPLIT = 0.2
const MAX_SPLIT = 0.8

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function SketchBlock({ item, canEdit, onChange, onExport }) {
  const hostRef = useRef(null)
  const handleRef = useRef(null)
  const typed = useRef(false)
  const dragSplit = useRef(null)

  const [error, setError] = useState(null)
  const [paused, setPaused] = useState(false)
  const [animated, setAnimated] = useState(false)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [onScreen, setOnScreen] = useState(true)

  const split = item.split ?? 0.46
  const code = useDebounced(item.code, 400)
  const width = useDebounced(size.w, 200)
  const height = useDebounced(size.h, 200)
  const mode = parseMode(code, item.mode)

  // La zone d'affichage se mesure elle-même : le rendu suit le partage et la taille du bloc.
  // Une animation invisible consomme quand même chaque image : on met en pause les
  // blocs sortis de l'écran (fréquent une fois dézoomé, où ils sont nombreux).
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: '150px' },
    )
    observer.observe(hostRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      setSize({ w: Math.round(w), h: Math.round(h) })
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  // Le rendu en place n'est remplacé qu'une fois le nouveau prêt : tant que le code est
  // invalide (c'est le cas à chaque frappe), l'image précédente reste à l'écran.
  useEffect(() => {
    if (!width || !height) return undefined
    let cancelled = false

    createSketch({
      container: hostRef.current,
      mode,
      code,
      width,
      height,
      onError: (err) => setError(err?.message ?? String(err)),
    })
      .then((next) => {
        if (cancelled) {
          next.destroy()
          return
        }
        handleRef.current?.destroy() // l'ancienne version cède la place, pas avant
        handleRef.current = next
        setAnimated(next.animated)
        setError(null)
        next.setPaused(paused || !onScreen)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? String(err))
      })

    // Pas de destruction ici : au changement de code, le rendu courant reste affiché
    // jusqu'à ce que le suivant aboutisse. Le nettoyage se fait au démontage.
    return () => {
      cancelled = true
    }
    // `paused` / `onScreen` sont appliqués par l'effet suivant : les relancer ici
    // réinitialiserait le rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, code, width, height])

  useEffect(() => {
    handleRef.current?.setPaused(paused || !onScreen)
  }, [paused, onScreen])

  useEffect(
    () => () => {
      handleRef.current?.destroy()
      handleRef.current = null
    },
    [],
  )

  const exportImage = async () => {
    try {
      const shot = await handleRef.current?.capture()
      if (shot) onExport(item, shot)
    } catch (err) {
      setError(err?.message ?? String(err))
    }
  }

  const stop = (event) => event.stopPropagation()

  const startSplit = (event) => {
    if (!canEdit) return
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointeur déjà relâché : on continue sans capture.
    }
    dragSplit.current = { id: event.pointerId, first: true }
  }

  const moveSplit = (event) => {
    const state = dragSplit.current
    if (!state || state.id !== event.pointerId) return
    const rect = event.currentTarget.parentElement.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    onChange(
      item.id,
      { split: Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, Number(ratio.toFixed(3)))) },
      state.first,
    )
    state.first = false
  }

  return (
    <div className="sketch">
      {/* La barre reste attrapable pour déplacer le bloc : seuls les boutons
          interceptent le pointeur. */}
      <div className="sketch__bar">
        <span className="sketch__badge">{SKETCH_MODES[mode].label}</span>
        <span className="sketch__name">{item.name}</span>
        <div className="sketch__actions">
          {animated && (
            <button
              disabled={!canEdit}
              onPointerDown={stop}
              onClick={() => setPaused((p) => !p)}
              title={paused ? 'Lancer' : 'Pause'}
            >
              {paused ? <IconPlay size={13} /> : <IconPause size={13} />}
            </button>
          )}
          <button
            disabled={!canEdit}
            onPointerDown={stop}
            onClick={exportImage}
            title="Convertir en image sur le tableau"
          >
            <IconDownload size={13} />
            image
          </button>
        </div>
      </div>

      <div className="sketch__split">
        <textarea
          className="sketch__code"
          style={{ flexBasis: `${split * 100}%` }}
          value={item.code}
          spellCheck={false}
          readOnly={!canEdit}
          onPointerDown={stop}
          onKeyDown={stop}
          onChange={(event) => {
            onChange(item.id, { code: event.target.value }, !typed.current)
            typed.current = true
          }}
          onBlur={() => {
            typed.current = false
          }}
        />

        <div
          className="sketch__divider"
          onPointerDown={startSplit}
          onPointerMove={moveSplit}
          onPointerUp={() => {
            dragSplit.current = null
          }}
        />

        <div className="sketch__view">
          <div ref={hostRef} className="sketch__host" />
          {error && <p className="sketch__error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
