import { useEffect, useRef } from 'react'

const LIFE = 900 // ms avant qu'un point de la traînée s'éteigne
const WIDTH = 4

/**
 * Pointeur laser : une traînée lumineuse qui s'efface toute seule. Rien n'est enregistré
 * dans le document — c'est un geste, pas un trait. Les points arrivent en coordonnées
 * « monde », ils sont projetés à chaque image : la traînée reste en place si la vue bouge.
 */
export default function Laser({ trails, view }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    let frame = 0

    const resize = () => {
      const ratio = devicePixelRatio || 1
      canvas.width = innerWidth * ratio
      canvas.height = innerHeight * ratio
      canvas.style.width = `${innerWidth}px`
      canvas.style.height = `${innerHeight}px`
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    addEventListener('resize', resize)

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const now = performance.now()
      context.clearRect(0, 0, innerWidth, innerHeight)

      for (const [id, trail] of trails.current) {
        // On oublie la queue de la traînée au fur et à mesure.
        while (trail.points.length && now - trail.points[0].at > LIFE) trail.points.shift()
        if (!trail.points.length) {
          trails.current.delete(id)
          continue
        }

        const { x: ox, y: oy, scale } = view.current
        const project = (point) => ({ x: point.x * scale + ox, y: point.y * scale + oy })

        context.lineCap = 'round'
        context.lineJoin = 'round'
        for (let i = 1; i < trail.points.length; i++) {
          const previous = trail.points[i - 1]
          const point = trail.points[i]
          // Plus le point est vieux, plus il est pâle et fin : la traînée s'affine vers l'arrière.
          const age = (now - point.at) / LIFE
          const life = 1 - age
          const a = project(previous)
          const b = project(point)

          context.globalAlpha = life * 0.9
          context.strokeStyle = trail.color
          context.lineWidth = WIDTH * life + 1
          context.shadowBlur = 12 * life
          context.shadowColor = trail.color
          context.beginPath()
          context.moveTo(a.x, a.y)
          context.lineTo(b.x, b.y)
          context.stroke()
        }

        // Le point vif au bout, celui qu'on suit des yeux.
        const head = project(trail.points.at(-1))
        context.globalAlpha = 1
        context.fillStyle = '#fff'
        context.shadowBlur = 16
        context.beginPath()
        context.arc(head.x, head.y, 3.5, 0, Math.PI * 2)
        context.fill()
      }

      context.globalAlpha = 1
      context.shadowBlur = 0
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      removeEventListener('resize', resize)
    }
  }, [trails, view])

  return <canvas ref={canvasRef} className="board__canvas board__canvas--laser" />
}
