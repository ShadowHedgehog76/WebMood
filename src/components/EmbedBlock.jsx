import { IconLink } from './Icons.jsx'
import './EmbedBlock.css'

/**
 * Lien posé sur le tableau : un cadre intégré chez les services qui l'acceptent, une carte
 * cliquable partout ailleurs.
 *
 * Le cadre n'écoute le pointeur que si le bloc est sélectionné : sinon on ne pourrait plus
 * ni le déplacer ni l'attraper, la page intégrée avalant tout.
 */
export default function EmbedBlock({ item, active }) {
  if (item.kind === 'embed') {
    return (
      <div className="embed">
        <iframe
          src={item.src}
          title={item.label}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          style={{ pointerEvents: active ? 'auto' : 'none' }}
        />
        {!active && <span className="embed__hint">{item.label}</span>}
      </div>
    )
  }

  return (
    <a
      className="embed embed__card"
      href={item.href}
      target="_blank"
      rel="noreferrer noopener"
      onPointerDown={(event) => active && event.stopPropagation()}
    >
      {item.icon ? (
        <img className="embed__icon" src={item.icon} alt="" />
      ) : (
        <span className="embed__icon embed__icon--fallback">
          <IconLink size={18} />
        </span>
      )}
      <span className="embed__text">
        <strong>{item.title || item.domain}</strong>
        <small>{item.href}</small>
      </span>
    </a>
  )
}
