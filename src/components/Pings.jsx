import './Pings.css'

/** Ondes lancées d'un clic dans le vide, pour pointer un endroit du tableau. */
export default function Pings({ pings }) {
  return pings.map((ping) => (
    <span key={ping.id} className="ping" style={{ left: ping.x, top: ping.y, '--peer': ping.color }}>
      <span />
      <span />
      {ping.name && <em>{ping.name}</em>}
    </span>
  ))
}
