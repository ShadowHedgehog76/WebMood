import './GroupBlock.css'

/**
 * Zone de groupe : une bande de couleur à gauche, sans contrôle. Tout bloc posé dans la
 * zone en devient membre, où qu'il se trouve dedans.
 */
export default function GroupBlock({ item }) {
  return (
    <div className="group" style={{ '--tint': item.color }}>
      <div className="group__bar">
        <span className="group__color">{item.name}</span>
      </div>
    </div>
  )
}
