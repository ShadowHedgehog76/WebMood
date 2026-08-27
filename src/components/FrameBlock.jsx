import { FRAME_BAR } from '../lib/frames.js'
import './FrameBlock.css'

/**
 * Cadre : une zone nommée qui délimite une scène. Il ne capture rien de ce qui est
 * posé dedans — c'est la présentation qui vient le chercher, dans l'ordre de lecture.
 */
export default function FrameBlock({ item, rank }) {
  return (
    <div className="frame">
      <span className="frame__label" style={{ top: -FRAME_BAR }}>
        {rank ? <b>{rank}</b> : null}
        {item.name}
      </span>
    </div>
  )
}
