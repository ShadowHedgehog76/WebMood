/**
 * Détection du « secouage » de souris, comme sur macOS : plusieurs changements de sens
 * rapprochés, à bonne vitesse. Sert à faire grossir son curseur chez les autres.
 */

const WINDOW = 450 // ms observés
const MIN_FLIPS = 5 // changements de sens requis
const MIN_SPEED = 900 // px/s
const MIN_STEP = 3 // en deçà, le mouvement est du bruit

function flipsOf(signs) {
  let flips = 0
  for (let i = 1; i < signs.length; i++) {
    if (signs[i] !== signs[i - 1]) flips += 1
  }
  return flips
}

export function createShakeDetector(options = {}) {
  const { window = WINDOW, minFlips = MIN_FLIPS, minSpeed = MIN_SPEED } = options
  const points = []

  return {
    /** Renvoie true tant que le geste ressemble à un secouage. */
    push(x, y, now) {
      points.push({ x, y, t: now })
      while (points.length && now - points[0].t > window) points.shift()
      if (points.length < 6) return false

      const horizontal = []
      const vertical = []
      let distance = 0

      for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x
        const dy = points[i].y - points[i - 1].y
        distance += Math.hypot(dx, dy)
        if (Math.abs(dx) > MIN_STEP) horizontal.push(Math.sign(dx))
        if (Math.abs(dy) > MIN_STEP) vertical.push(Math.sign(dy))
      }

      const elapsed = (points.at(-1).t - points[0].t) / 1000
      if (elapsed <= 0) return false

      const speed = distance / elapsed
      const flips = Math.max(flipsOf(horizontal), flipsOf(vertical))
      return flips >= minFlips && speed >= minSpeed
    },

    reset() {
      points.length = 0
    },
  }
}
