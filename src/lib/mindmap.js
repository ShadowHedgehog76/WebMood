/**
 * Cartes mentales : arbre de nœuds, dispositions automatiques et progression
 * qui remonte des feuilles jusqu'au nœud principal.
 */

import { elbowDown, elbowRight, geometryBetween } from './links.js'

export const NODE_W = 230
export const NODE_H = 62
export const ROOT_W = 264
export const ROOT_H = 74

// Carte mentale bilatérale
const H_GAP = 88
const V_GAP = 18
// Organigramme
const TREE_H_GAP = 30
const TREE_V_GAP = 74
// Arborescence indentée
const INDENT = 38
const ROW_GAP = 12
// Radial
const RING = 250
const RING_STEP = 210

export const MINDMAP_LAYOUTS = [
  { key: 'mindmap', label: 'Carte mentale', hint: 'des deux côtés' },
  { key: 'tree', label: 'Organigramme', hint: 'de haut en bas' },
  { key: 'outline', label: 'Arborescence', hint: 'liste indentée' },
  { key: 'radial', label: 'Radial', hint: 'en étoile' },
]

export function childrenOf(nodes, id) {
  return nodes.filter((node) => node.parent === id)
}

/** Le nœud et toute sa descendance. */
export function subtree(nodes, id) {
  const out = []
  const walk = (current) => {
    out.push(current)
    for (const child of childrenOf(nodes, current.id)) walk(child)
  }
  const start = nodes.find((node) => node.id === id)
  if (start) walk(start)
  return out
}

export function rootOf(nodes, node) {
  let current = node
  while (current?.parent) {
    const parent = nodes.find((candidate) => candidate.id === current.parent)
    if (!parent) break
    current = parent
  }
  return current
}

/** Hauteur occupée par un nœud et sa descendance. */
function branchHeight(nodes, node) {
  const children = childrenOf(nodes, node.id)
  if (!children.length) return node.h
  const total =
    children.reduce((sum, child) => sum + branchHeight(nodes, child), 0) +
    V_GAP * (children.length - 1)
  return Math.max(node.h, total)
}

function placeSide(nodes, parent, children, side, moves) {
  if (!children.length) return
  const total =
    children.reduce((sum, child) => sum + branchHeight(nodes, child), 0) +
    V_GAP * (children.length - 1)

  let cursor = parent.y + parent.h / 2 - total / 2
  for (const child of children) {
    const height = branchHeight(nodes, child)
    const x = side === 'left' ? parent.x - H_GAP - child.w : parent.x + parent.w + H_GAP
    const y = cursor + height / 2 - child.h / 2
    moves.push({ id: child.id, x: Math.round(x), y: Math.round(y) })
    placeSide(nodes, { ...child, x, y }, childrenOf(nodes, child.id), side, moves)
    cursor += height + V_GAP
  }
}

/** Carte mentale : les enfants de la racine se répartissent de part et d'autre. */
function layoutMindmap(nodes, root) {
  const moves = []
  const children = childrenOf(nodes, root.id)
  placeSide(nodes, root, children.filter((child) => child.side !== 'left'), 'right', moves)
  placeSide(nodes, root, children.filter((child) => child.side === 'left'), 'left', moves)
  return moves
}

/** Largeur occupée par un nœud et sa descendance, en disposition verticale. */
function branchWidth(nodes, node) {
  const children = childrenOf(nodes, node.id)
  if (!children.length) return node.w
  const total =
    children.reduce((sum, child) => sum + branchWidth(nodes, child), 0) +
    TREE_H_GAP * (children.length - 1)
  return Math.max(node.w, total)
}

/** Organigramme : chaque génération sur une ligne, centrée sous son parent. */
function placeDown(nodes, parent, moves) {
  const children = childrenOf(nodes, parent.id)
  if (!children.length) return

  const total =
    children.reduce((sum, child) => sum + branchWidth(nodes, child), 0) +
    TREE_H_GAP * (children.length - 1)

  let cursor = parent.x + parent.w / 2 - total / 2
  const y = parent.y + parent.h + TREE_V_GAP

  for (const child of children) {
    const width = branchWidth(nodes, child)
    const x = cursor + width / 2 - child.w / 2
    moves.push({ id: child.id, x: Math.round(x), y: Math.round(y) })
    placeDown(nodes, { ...child, x, y }, moves)
    cursor += width + TREE_H_GAP
  }
}

/** Arborescence : une ligne par nœud, décalée d'un cran à chaque niveau. */
function placeOutline(nodes, parent, moves, cursor) {
  for (const child of childrenOf(nodes, parent.id)) {
    const x = parent.x + INDENT
    const y = cursor.y
    moves.push({ id: child.id, x: Math.round(x), y: Math.round(y) })
    cursor.y += child.h + ROW_GAP
    placeOutline(nodes, { ...child, x, y }, moves, cursor)
  }
}

/** Radial : anneaux concentriques, chaque branche gardant son secteur angulaire. */
function placeRadial(nodes, parent, center, from, to, depth, moves) {
  const children = childrenOf(nodes, parent.id)
  if (!children.length) return

  const radius = RING + (depth - 1) * RING_STEP
  const span = (to - from) / children.length

  children.forEach((child, index) => {
    const start = from + span * index
    const end = start + span
    const angle = (start + end) / 2
    const x = center.x + Math.cos(angle) * radius - child.w / 2
    const y = center.y + Math.sin(angle) * radius - child.h / 2
    moves.push({ id: child.id, x: Math.round(x), y: Math.round(y) })
    placeRadial(nodes, child, center, start, end, depth + 1, moves)
  })
}

/** Positions de tout l'arbre, selon la disposition choisie sur la racine. */
export function layoutTree(nodes, root) {
  const moves = []
  switch (root.layout) {
    case 'tree':
      placeDown(nodes, root, moves)
      return moves
    case 'outline':
      placeOutline(nodes, root, moves, { y: root.y + root.h + ROW_GAP })
      return moves
    case 'radial':
      placeRadial(
        nodes,
        root,
        { x: root.x + root.w / 2, y: root.y + root.h / 2 },
        -Math.PI / 2,
        Math.PI * 1.5,
        1,
        moves,
      )
      return moves
    default:
      return layoutMindmap(nodes, root)
  }
}

/** Progression d'un nœud : sa case pour une feuille, la moyenne de ses enfants sinon. */
export function progressOf(nodes, node) {
  const children = childrenOf(nodes, node.id)
  if (!children.length) return node.done ? 1 : 0
  const values = children.map((child) => progressOf(nodes, child))
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Toutes les branches parent → enfant, pour le tracé des fils. */
export function branches(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return nodes
    .filter((node) => node.parent && byId.has(node.parent))
    .map((node) => ({
      id: `${node.parent}->${node.id}`,
      from: byId.get(node.parent),
      to: node,
      layout: rootOf(nodes, node)?.layout ?? 'mindmap',
    }))
}

/**
 * Tracé d'une branche selon la disposition : courbe pour la carte mentale et le radial,
 * équerre pour l'organigramme et l'arborescence.
 */
export function branchPath(layout, from, to, radius = 12) {
  if (layout === 'tree') {
    return elbowDown(
      { x: from.x + from.w / 2, y: from.y + from.h },
      { x: to.x + to.w / 2, y: to.y },
      radius,
    )
  }
  if (layout === 'outline') {
    return elbowRight(
      { x: from.x + Math.min(20, from.w / 4), y: from.y + from.h },
      { x: to.x, y: to.y + to.h / 2 },
      radius,
    )
  }
  // En radial, un rayon droit de centre à centre : les blocs, opaques, masquent les extrémités.
  if (layout === 'radial') {
    return (
      `M ${from.x + from.w / 2} ${from.y + from.h / 2} ` +
      `L ${to.x + to.w / 2} ${to.y + to.h / 2}`
    )
  }

  const left = to.x + to.w / 2 < from.x + from.w / 2
  return geometryBetween(from, to, left ? 'left' : 'right', left ? 'right' : 'left').d
}
