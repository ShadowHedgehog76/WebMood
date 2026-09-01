import { IconDownload } from './Icons.jsx'
import './FileBlock.css'

/** Poids lisible : 4,2 Mo plutôt que 4404019. */
function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  const units = ['o', 'ko', 'Mo', 'Go']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: value < 10 && unit ? 1 : 0 })} ${units[unit]}`
}

/**
 * Pièce jointe : ce que le navigateur ne sait pas afficher. Plutôt que d'ignorer le
 * fichier — ce que faisait l'import jusque-là —, il est gardé dans le document et
 * ressort d'un clic. Une archive, un `.docx`, un fichier de projet gardent ainsi leur
 * place dans la planche.
 */
export default function FileBlock({ item, active }) {
  return (
    <a
      className="file"
      href={item.src}
      download={item.name}
      onPointerDown={(event) => active && event.stopPropagation()}
      onClick={(event) => !active && event.preventDefault()}
    >
      <span className="file__badge">{item.ext || 'fichier'}</span>
      <span className="file__text">
        <strong>{item.name}</strong>
        <small>
          {formatSize(item.size)}
          {item.why ? ` · ${item.why}` : ''}
        </small>
      </span>
      <span className="file__get" aria-hidden>
        <IconDownload size={16} />
      </span>
    </a>
  )
}
