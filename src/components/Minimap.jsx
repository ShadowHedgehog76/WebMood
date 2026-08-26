import { useRef } from 'react'
import './Minimap.css'

const WIDTH = 190
const HEIGHT = 128
const PAD = 60

/** Vue d'ensemble : les blocs en miniature et le cadre de la vue courante. */
export default function Minimap({ items, view, viewport, onGoto }) {
  const ref = useRef(null)
  const dragging = useRef(false)

  const world = {
    x: -view.x / view.scale,
    y: -view.y / view.scale,
    w: viewport.w / view.scale,
    h: viewport.h / view.scale,
  }

  const bounds = items.reduce(
    (box, item) => ({
      minX: Math.min(box.minX, item.x),
      minY: Math.min(box.minY, item.y),
      maxX: Math.max(box.maxX, item.x + item.w),
      maxY: Math.max(box.maxY, item.y + item.h),
    }),
    { minX: world.x, minY: world.y, maxX: world.x + world.w, maxY: world.y + world.h },
  )

  const box = {
    x: bounds.minX - PAD,
    y: bounds.minY - PAD,
    w: bounds.maxX - bounds.minX + PAD * 2,
    h: bounds.maxY - bounds.minY + PAD * 2,
  }
  const scale = Math.min(WIDTH / box.w, HEIGHT / box.h)
  const project = (x, y) => ({
    left: (x - box.x) * scale + (WIDTH - box.w * scale) / 2,
    top: (y - box.y) * scale + (HEIGHT - box.h * scale) / 2,
  })

  const goto = (event) => {
    const rect = ref.current.getBoundingClientRect()
    const x = box.x + (event.clientX - rect.left - (WIDTH - box.w * scale) / 2) / scale
    const y = box.y + (event.clientY - rect.top - (HEIGHT - box.h * scale) / 2) / scale
    onGoto({ x, y })
  }

  const frame = project(world.x, world.y)

  return (
    <div
      ref={ref}
      className="minimap"
      style={{ width: WIDTH, height: HEIGHT }}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragging.current = true
        goto(event)
      }}
      onPointerMove={(event) => dragging.current && goto(event)}
      onPointerUp={() => {
        dragging.current = false
      }}
    >
      {items.map((item) => {
        const position = project(item.x, item.y)
        return (
          <span
            key={item.id}
            className={`minimap__item minimap__item--${item.type}`}
            style={{
              ...position,
              width: Math.max(2, item.w * scale),
              height: Math.max(2, item.h * scale),
              background: item.color ?? undefined,
            }}
          />
        )
      })}

      <span
        className="minimap__frame"
        style={{ ...frame, width: world.w * scale, height: world.h * scale }}
      />
    </div>
  )
}
