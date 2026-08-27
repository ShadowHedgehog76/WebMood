import './TableBlock.css'

/**
 * Tableau : une grille de cellules, la première ligne en en-tête. Comme les autres blocs
 * de texte, il se remplit au double-clic — sinon le moindre clic dans une cellule
 * empêcherait de saisir le tableau pour le déplacer.
 */
export default function TableBlock({ item, editing, onChange, onEdit }) {
  const cells = item.cells ?? [['']]

  const write = (row, column, value) => {
    const next = cells.map((line, y) =>
      y === row ? line.map((cell, x) => (x === column ? value : cell)) : line,
    )
    // Une seule entrée d'historique par cellule remplie, pas une par caractère.
    onChange(item.id, { cells: next }, !cells[row][column])
  }

  return (
    <div className={`table ${editing ? 'is-editing' : ''}`} style={{ '--tint': item.color }}>
      {cells.map((line, row) => (
        <div className="table__row" key={row}>
          {line.map((cell, column) => (
            <input
              key={column}
              className={`table__cell ${row === 0 ? 'table__cell--head' : ''}`}
              value={cell}
              readOnly={!editing}
              spellCheck={false}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape') onEdit(null)
              }}
              onChange={(event) => write(row, column, event.target.value)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
