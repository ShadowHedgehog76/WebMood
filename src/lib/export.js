/**
 * Export du tableau : image PNG (traits, fils et blocs DOM réunis) et fichier JSON.
 *
 * Les blocs sont du DOM : on les rend en image via un `foreignObject` SVG, en ayant
 * remplacé au préalable les canvas par leur bitmap et réinjecté les valeurs des champs
 * (que la sérialisation HTML ne transporte pas).
 */

import { arrowHead, geometryFor, pathWithArrows } from './links.js'
import { DOUBLE_SPREAD, dashPattern, isDouble } from './dashes.js'
import { branchPath, branches } from './mindmap.js'

const XHTML = 'http://www.w3.org/1999/xhtml'
const PADDING = 48

/**
 * Les images hébergées en ligne ne sont pas chargées pendant la rasterisation du SVG :
 * on les rapatrie en `data:` avant de sérialiser.
 */
async function inlineRemote(clone) {
  const remotes = [...clone.querySelectorAll('img')].filter((image) =>
    /^https?:/i.test(image.getAttribute('src') ?? ''),
  )
  await Promise.all(
    remotes.map(async (image) => {
      try {
        const response = await fetch(image.getAttribute('src'), { mode: 'cors' })
        const blob = await response.blob()
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        image.setAttribute('src', data)
      } catch {
        image.remove()
      }
    }),
  )
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportJson(doc, name = 'moodboard') {
  const payload = JSON.stringify({ format: 'moodboard', version: 1, name, ...doc }, null, 2)
  download(new Blob([payload], { type: 'application/json' }), `${slug(name)}.json`)
}

export async function readJson(file) {
  const data = JSON.parse(await file.text())
  return {
    name: data.name ?? file.name.replace(/\.json$/i, ''),
    strokes: Array.isArray(data.strokes) ? data.strokes : [],
    items: Array.isArray(data.items) ? data.items : [],
    links: Array.isArray(data.links) ? data.links : [],
  }
}

function slug(name) {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'moodboard'
  )
}

function boundsOf(items, strokes) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const item of items) {
    minX = Math.min(minX, item.x)
    minY = Math.min(minY, item.y)
    maxX = Math.max(maxX, item.x + item.w)
    maxY = Math.max(maxY, item.y + item.h)
  }
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }
  if (!Number.isFinite(minX)) return null

  return {
    x: minX - PADDING,
    y: minY - PADDING,
    w: maxX - minX + PADDING * 2,
    h: maxY - minY + PADDING * 2,
  }
}

function collectCss() {
  let css = ''
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) css += `${rule.cssText}\n`
    } catch {
      /* feuille inaccessible : on l'ignore */
    }
  }
  return css
}

/** Le calque des blocs, rendu en image à la taille du cadre demandé. */
async function layerToImage(layer, keep, bounds) {
  const clone = layer.cloneNode(true)
  clone.removeAttribute('style')
  clone.style.position = 'absolute'
  clone.style.left = `${-bounds.x}px`
  clone.style.top = `${-bounds.y}px`
  clone.style.width = '0'
  clone.style.height = '0'
  clone.style.transform = 'none'

  // On ne garde que les blocs demandés (et jamais l'aperçu d'un tracé en cours).
  for (const node of [...clone.children]) {
    const id = node.dataset?.id
    if (!id || (keep && !keep.has(id))) node.remove()
  }
  if (!clone.children.length) return null

  // Les canvas ne survivent pas au clonage : on les remplace par leur bitmap.
  const sources = [...layer.querySelectorAll('canvas')]
  const targets = [...clone.querySelectorAll('canvas')]
  targets.forEach((target, index) => {
    const source = sources[index]
    if (!source) return target.remove()
    const image = document.createElementNS(XHTML, 'img')
    try {
      image.setAttribute('src', source.toDataURL())
    } catch {
      return target.remove()
    }
    image.setAttribute('style', 'display:block;width:100%;height:100%')
    target.replaceWith(image)
  })

  // Idem pour le contenu des champs de saisie, qui n'est pas sérialisé.
  const inputs = [...layer.querySelectorAll('textarea, input')]
  const cloned = [...clone.querySelectorAll('textarea, input')]
  cloned.forEach((node, index) => {
    const value = inputs[index]?.value ?? ''
    if (node.tagName === 'TEXTAREA') node.textContent = value
    else node.setAttribute('value', value)
  })

  await inlineRemote(clone)

  const holder = document.createElementNS(XHTML, 'div')
  holder.setAttribute('xmlns', XHTML)
  // La police du document ne s'applique pas au foreignObject : on la répète ici.
  holder.setAttribute(
    'style',
    `position:relative;width:${bounds.w}px;height:${bounds.h}px;overflow:hidden;` +
      `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#1c1c1e`,
  )
  const style = document.createElementNS(XHTML, 'style')
  style.textContent = collectCss()
  holder.append(style, clone)

  const markup = new XMLSerializer().serializeToString(holder)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.w}" height="${bounds.h}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject></svg>`

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

function drawLinks(ctx, doc, items, background) {
  const byId = new Map(items.map((item) => [item.id, item]))

  for (const link of doc.links) {
    const from = byId.get(link.from)
    const to = byId.get(link.to)
    if (!from || !to) continue

    const geometry = geometryFor(link.style, from, to)
    const color = link.color || '#1c1c1e'
    const width = link.width || 2
    const path = new Path2D(pathWithArrows(geometry, link.arrow, width, { start: true, end: true }))
    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    if (isDouble(link.dash)) {
      // Les connexions sont posées avant tout le reste : évider le cœur avec la couleur
      // de fond revient au même qu'un masque, sans en avoir le coût.
      ctx.lineWidth = width * DOUBLE_SPREAD
      ctx.stroke(path)
      ctx.strokeStyle = background
      ctx.lineWidth = width
      ctx.stroke(path)
      ctx.strokeStyle = color
      ctx.lineWidth = width
    } else {
      ctx.setLineDash(dashPattern(link.dash, width))
      ctx.stroke(path)
      ctx.setLineDash([])
    }
    if (link.arrow === 'start' || link.arrow === 'both') {
      ctx.fill(new Path2D(arrowHead(geometry.start, geometry.startDir, width * 5)))
    }
    if (link.arrow === 'end' || link.arrow === 'both') {
      ctx.fill(new Path2D(arrowHead(geometry.end, geometry.endDir, width * 5)))
    }
    ctx.restore()
  }

  for (const branch of branches(items.filter((item) => item.type === 'node'))) {
    const d = branchPath(branch.layout, branch.from, branch.to)
    ctx.save()
    ctx.strokeStyle = branch.to.color || '#3b82f6'
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke(new Path2D(d))
    ctx.restore()
  }
}

function drawStrokes(ctx, strokes) {
  for (const stroke of strokes) {
    if (!stroke.points.length) continue
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = stroke.size
    if (stroke.dash) ctx.setLineDash(dashPattern(stroke.dash, stroke.size))
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.strokeStyle = stroke.color
    }
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y)
    if (stroke.points.length === 1) {
      ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fill()
    } else {
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** Rend le tableau (ou seulement la sélection) dans un canvas. */
export async function renderBoard({ layer, doc, only = null, scale = 2, background = '#ffffff' }) {
  const keep = only?.length ? new Set(only) : null
  const items = keep ? doc.items.filter((item) => keep.has(item.id)) : doc.items
  const strokes = keep ? [] : doc.strokes
  const bounds = boundsOf(items, strokes)
  if (!bounds) return null

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bounds.w * scale)
  canvas.height = Math.round(bounds.h * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale)

  drawLinks(ctx, { ...doc, links: keep ? [] : doc.links }, items, background)
  const image = await layerToImage(layer, keep, bounds)
  if (image) ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h)
  drawStrokes(ctx, strokes)

  return canvas
}

export async function exportPng(options, name = 'moodboard') {
  const canvas = await renderBoard(options)
  if (!canvas) return false
  await new Promise((resolve) =>
    canvas.toBlob((blob) => {
      if (blob) download(blob, `${slug(name)}.png`)
      resolve()
    }, 'image/png'),
  )
  return true
}
