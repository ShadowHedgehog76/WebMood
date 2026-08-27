import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './Tour.css'

const CARD = { width: 330, gap: 18 }

/**
 * Visite guidée du tableau. Chaque étape éclaire un élément de l'interface et peut
 * préparer le décor (choisir un outil, par exemple) pour que l'élément soit bien visible.
 */
export const STEPS = [
  {
    title: 'Bienvenue',
    text: "Un tableau blanc sans limites : on y dessine, on y pose des images, du texte, du code, des cartes mentales. Tout reste dans votre navigateur, rien n'est envoyé ailleurs.",
  },
  {
    target: '.toolbar',
    title: 'La barre d’outils',
    text: 'Le crayon et la gomme pour dessiner, les formes, la connexion pour relier deux blocs, les zones de groupe, et la main pour se déplacer. Chaque outil a sa touche : survolez-le pour la découvrir.',
    place: 'top',
  },
  {
    target: '.context-bar',
    title: 'Les réglages du moment',
    text: "Juste au-dessus, cette barre change selon ce que vous faites : couleur et épaisseur pour le crayon, formes et remplissage, styles de flèche, alignement d'une sélection…",
    place: 'top',
    prepare: (actions) => actions.setTool('pen'),
  },
  {
    target: '.toolbar__group:nth-of-type(2)',
    title: 'Poser du contenu',
    text: 'Images et fichiers, notes, texte, blocs de code, cartes mentales, et blocs visuels dont le code produit l’image. On peut aussi glisser un fichier ou coller directement sur le tableau.',
    place: 'top',
  },
  {
    target: '.zoom',
    title: 'Se déplacer',
    text: 'Molette ou deux doigts pour faire glisser le tableau, ⌘ + molette ou pincement pour zoomer, barre d’espace + glisser pour attraper la vue. Le pourcentage remet tout à plat.',
    place: 'top',
  },
  {
    target: '.rail',
    title: 'Vos tableaux',
    text: 'La barre de gauche s’ouvre au survol : elle garde vos tableaux avec leur aperçu, et permet d’exporter en image ou en JSON, d’importer, et de partager.',
    place: 'right',
  },
  {
    title: 'À plusieurs',
    text: 'Depuis cette même barre, « Partager » donne un code à transmettre — ou ouvre une session où l’on voit les curseurs, les modifications et un tchat en direct.',
  },
  {
    title: 'À vous de jouer',
    text: '⌘Z annule, ⌘D duplique, ⇧ + clic ajoute à la sélection, Suppr efface. Ce guide se rejoue à tout moment depuis la barre de gauche.',
  },
]

export default function Tour({ step, onStep, onClose, actions }) {
  const [hole, setHole] = useState(null)
  const current = STEPS[step]

  // Les actions viennent d'un objet recréé à chaque rendu du tableau : on les fige, sinon
  // préparer l'étape déclencherait un rendu, qui relancerait la préparation, sans fin.
  const handlers = useRef(actions)
  handlers.current = actions

  useEffect(() => {
    STEPS[step]?.prepare?.(handlers.current)
  }, [step])

  useLayoutEffect(() => {
    const measure = () => {
      if (!current?.target) {
        setHole(null)
        return
      }
      const node = document.querySelector(current.target)
      if (!node) {
        setHole(null)
        return
      }
      const rect = node.getBoundingClientRect()
      setHole({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    }
    // Laisse à l'interface le temps de réagir à `prepare` avant de mesurer.
    const timer = setTimeout(measure, 60)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', measure)
    }
  }, [current])

  useEffect(() => {
    const onKey = (event) => {
      event.stopPropagation()
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' || event.key === 'Enter') onStep(step + 1)
      if (event.key === 'ArrowLeft') onStep(step - 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [step, onStep, onClose])

  if (!current) return null

  const card = placeCard(hole, current.place)
  const last = step === STEPS.length - 1

  return (
    <div className="tour">
      <div className="tour__veil" onPointerDown={onClose} />

      {hole && (
        <span
          className="tour__hole"
          style={{
            left: hole.x - 8,
            top: hole.y - 8,
            width: hole.width + 16,
            height: hole.height + 16,
          }}
        />
      )}

      <div className="tour__card" style={card}>
        <p className="tour__count">
          Étape {step + 1} sur {STEPS.length}
        </p>
        <h2>{current.title}</h2>
        <p className="tour__text">{current.text}</p>

        <div className="tour__foot">
          <div className="tour__dots">
            {STEPS.map((entry, index) => (
              <span key={entry.title} className={index === step ? 'is-current' : ''} />
            ))}
          </div>
          <div className="tour__buttons">
            {step > 0 && (
              <button className="tour__btn" onClick={() => onStep(step - 1)}>
                Précédent
              </button>
            )}
            <button className="tour__btn tour__btn--main" onClick={() => onStep(step + 1)}>
              {last ? 'C’est parti' : 'Suivant'}
            </button>
          </div>
        </div>

        {!last && (
          <button className="tour__skip" onClick={onClose}>
            Passer
          </button>
        )}
      </div>
    </div>
  )
}

/** Place la carte à côté de la zone éclairée, sans sortir de l'écran. */
function placeCard(hole, place) {
  if (!hole) {
    return {
      left: Math.round(window.innerWidth / 2 - CARD.width / 2),
      top: Math.round(window.innerHeight / 2 - 150),
    }
  }

  const clampX = (value) =>
    Math.max(16, Math.min(value, window.innerWidth - CARD.width - 16))

  if (place === 'right') {
    return {
      left: clampX(hole.x + hole.width + CARD.gap),
      top: Math.max(16, Math.min(hole.y, window.innerHeight - 260)),
    }
  }

  const above = place === 'top' || hole.y > window.innerHeight / 2
  return {
    left: clampX(hole.x + hole.width / 2 - CARD.width / 2),
    top: above ? Math.max(16, hole.y - CARD.gap - 236) : hole.y + hole.height + CARD.gap,
  }
}
