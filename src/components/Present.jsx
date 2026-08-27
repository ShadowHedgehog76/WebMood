import './Present.css'

/**
 * Barre de présentation : le numéro de la scène et de quoi avancer. Le reste de
 * l'interface s'efface, il ne reste que le cadre en cours.
 */
export default function Present({ index, total, onPrevious, onNext, onExit }) {
  return (
    <div className="present">
      <button onClick={onPrevious} disabled={index === 0} aria-label="Scène précédente">
        ‹
      </button>
      <span className="present__count">
        {index + 1} / {total}
      </span>
      <button onClick={onNext} disabled={index === total - 1} aria-label="Scène suivante">
        ›
      </button>
      <span className="present__sep" />
      <button className="present__exit" onClick={onExit}>
        Quitter
      </button>
    </div>
  )
}
