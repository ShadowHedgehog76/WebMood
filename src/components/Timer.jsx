import { useEffect, useState } from 'react'
import './Timer.css'

const PRESETS = [1, 3, 5, 10, 15]

function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Minuteur partagé : tout le monde voit le même décompte, qui qu'il l'ait lancé.
 * Seule la date de fin circule — chacun décompte de son côté, sans message par seconde.
 */
export default function Timer({ state, onStart, onPause, onStop, onClose }) {
  const [, tick] = useState(0)

  useEffect(() => {
    if (!state || state.left !== undefined) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [state])

  if (!state) {
    return (
      <div className="timer">
        <span className="timer__title">Minuteur</span>
        {PRESETS.map((minutes) => (
          <button key={minutes} className="timer__preset" onClick={() => onStart(minutes * 60000)}>
            {minutes} min
          </button>
        ))}
        <button className="timer__close" onClick={onClose} aria-label="Fermer le minuteur">
          ✕
        </button>
      </div>
    )
  }

  const left = state.left ?? state.endsAt - Date.now()
  const done = left <= 0

  return (
    <div className={`timer ${done ? 'is-done' : ''}`}>
      <span className="timer__count">{done ? 'Temps écoulé' : clock(left)}</span>
      {!done && (
        <button
          className="timer__preset"
          onClick={onPause}
          aria-label={state.left === undefined ? 'Mettre en pause' : 'Reprendre'}
        >
          {state.left === undefined ? '❚❚' : '▶'}
        </button>
      )}
      <button className="timer__close" onClick={onStop} aria-label="Arrêter le minuteur">
        ✕
      </button>
    </div>
  )
}
