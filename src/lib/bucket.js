/**
 * Seau de peinture : le vrai. On part du point cliqué et on s'étend tant qu'on trouve
 * du vide, exactement comme dans un logiciel de dessin. Ce qui est tracé — traits,
 * contours de formes, blocs — arrête la diffusion.
 *
 * Le remplissage se calcule sur une image de la fenêtre, mais ce qu'on en garde est un
 * contour vectoriel : la tache reste nette à tous les zooms, et elle est modifiable
 * ensuite comme n'importe quelle autre forme.
 */

const WALL = 40 // au-delà de cette opacité, le pixel est un mur

/**
 * Diffusion depuis un point. Renvoie le masque des pixels atteints, et si la tache a
 * touché le bord de la fenêtre — auquel cas la zone n'est pas fermée.
 */
export function floodFill(pixels, width, height, startX, startY) {
  const start = (startY * width + startX) * 4 + 3
  if (pixels[start] > WALL) return { mask: null, escaped: false, blocked: true }

  const mask = new Uint8Array(width * height)
  const stack = [startY * width + startX]
  let escaped = false
  let filled = 0

  while (stack.length) {
    const index = stack.pop()
    if (mask[index]) continue

    const y = Math.floor(index / width)
    // Balayage par segments horizontaux : bien plus rapide que pixel par pixel.
    let left = index
    while (left % width > 0 && !mask[left - 1] && pixels[(left - 1) * 4 + 3] <= WALL) left--
    let right = index
    while (right % width < width - 1 && !mask[right + 1] && pixels[(right + 1) * 4 + 3] <= WALL) {
      right++
    }

    if (left % width === 0 || right % width === width - 1) escaped = true

    for (let i = left; i <= right; i++) {
      mask[i] = 1
      filled++
      // Lignes du dessus et du dessous : on empile ce qui est encore libre.
      if (y === 0 || y === height - 1) escaped = true
      for (const neighbour of [i - width, i + width]) {
        if (neighbour < 0 || neighbour >= mask.length) continue
        if (!mask[neighbour] && pixels[neighbour * 4 + 3] <= WALL) stack.push(neighbour)
      }
    }
  }

  return { mask, escaped, filled, blocked: false }
}

/**
 * Étend la tache sous les traits qui l'arrêtent, et seulement sous eux : on ne gagne que
 * des pixels déjà occupés. Sans cette marge, la peinture s'arrête au premier pixel
 * atténué du contour et laisse un liseré blanc entre elle et le trait.
 */
export function dilateIntoWalls(mask, pixels, width, height, steps = 4) {
  let current = mask
  for (let pass = 0; pass < steps; pass++) {
    const next = current.slice()
    for (let index = 0; index < current.length; index++) {
      if (current[index]) continue
      // On ne déborde que dans un mur : jamais dans le vide au-delà.
      if (pixels[index * 4 + 3] <= WALL) continue
      const x = index % width
      const y = (index - x) / width
      if (
        (x > 0 && current[index - 1]) ||
        (x < width - 1 && current[index + 1]) ||
        (y > 0 && current[index - width]) ||
        (y < height - 1 && current[index + width])
      ) {
        next[index] = 1
      }
    }
    current = next
  }
  return current
}

const NEIGHBOURS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
]

/**
 * Contour extérieur d'une tache, par la marche de Moore : on longe le bord en tournant
 * toujours dans le même sens, jusqu'à revenir au point de départ.
 */
export function traceOutline(mask, width, height) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1

  // Premier pixel de la tache, en balayant de haut en bas.
  let startX = -1
  let startY = -1
  for (let i = 0; i < mask.length && startX < 0; i++) {
    if (mask[i]) {
      startX = i % width
      startY = Math.floor(i / width)
    }
  }
  if (startX < 0) return []

  const outline = [{ x: startX, y: startY }]
  let x = startX
  let y = startY
  let direction = 6 // on arrive par le haut

  for (let step = 0; step < mask.length * 4; step++) {
    let found = false
    // On repart du voisin qui suit celui d'où l'on vient, en tournant à droite.
    for (let turn = 0; turn < 8; turn++) {
      const next = (direction + 6 + turn) % 8
      const [dx, dy] = NEIGHBOURS[next]
      if (!inside(x + dx, y + dy)) continue
      x += dx
      y += dy
      direction = next
      outline.push({ x, y })
      found = true
      break
    }
    if (!found) break
    if (x === startX && y === startY) break
  }

  return outline
}
