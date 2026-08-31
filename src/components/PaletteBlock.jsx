import { readableOn } from '../lib/palette.js'
import './PaletteBlock.css'

/**
 * Nuancier tiré d'une image. Chaque bande donne sa couleur à l'outil courant d'un clic,
 * et affiche son code — c'est ce qu'on recopie dans une maquette.
 */
export default function PaletteBlock({ item, canEdit, onPick }) {
  const colors = item.colors ?? []

  return (
    <div className="swatches">
      {item.name && <span className="swatches__name">{item.name}</span>}
      <div className="swatches__row">
        {colors.map((color, index) => (
          <button
            key={`${color}-${index}`}
            className="swatches__chip"
            style={{ background: color, color: readableOn(color) }}
            disabled={!canEdit}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onPick?.(color)}
            title={`Prendre ${color}`}
          >
            <span>{color}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
