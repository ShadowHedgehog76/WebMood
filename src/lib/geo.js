/**
 * Géographie des cartes glissantes : passage entre coordonnées terrestres et tuiles.
 * C'est la projection de Mercator, celle qu'emploient toutes les cartes du web — le
 * monde y tient dans un carré de 2^zoom tuiles de 256 pixels.
 */

export const TILE = 256
export const MIN_ZOOM = 2
export const MAX_ZOOM = 19

/** Tuiles d'OpenStreetMap : la seule adresse que le tableau appelle au dehors. */
export const TILE_URL = (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
export const ATTRIBUTION = '© OpenStreetMap'

export function lonToTile(lon, zoom) {
  return ((lon + 180) / 360) * 2 ** zoom
}

export function latToTile(lat, zoom) {
  // La latitude est bornée : au-delà, Mercator part à l'infini.
  const clamped = Math.max(-85.05, Math.min(85.05, lat))
  const radians = (clamped * Math.PI) / 180
  return (
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom
  )
}

export function tileToLon(x, zoom) {
  return (x / 2 ** zoom) * 360 - 180
}

export function tileToLat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

/**
 * Les tuiles à poser pour couvrir une fenêtre de `w` × `h` pixels centrée sur un point,
 * et leur position dans cette fenêtre.
 */
export function tilesFor({ lat, lon, zoom, w, h }) {
  const centerX = lonToTile(lon, zoom)
  const centerY = latToTile(lat, zoom)
  const count = 2 ** zoom

  const left = centerX - w / 2 / TILE
  const top = centerY - h / 2 / TILE
  const tiles = []

  for (let x = Math.floor(left); x < left + w / TILE + 1; x++) {
    for (let y = Math.floor(top); y < top + h / TILE + 1; y++) {
      // Hors du monde en hauteur : il n'y a rien à montrer.
      if (y < 0 || y >= count) continue
      // Le monde s'enroule en longitude : la tuile -1 est la dernière.
      const wrapped = ((x % count) + count) % count
      tiles.push({
        key: `${zoom}/${x}/${y}`,
        url: TILE_URL(wrapped, y, zoom),
        left: (x - left) * TILE,
        top: (y - top) * TILE,
      })
    }
  }

  return tiles
}

/** Position d'un point du globe dans la fenêtre de la carte. */
export function project({ lat, lon, zoom, w, h }, point) {
  return {
    x: (lonToTile(point.lon, zoom) - lonToTile(lon, zoom)) * TILE + w / 2,
    y: (latToTile(point.lat, zoom) - latToTile(lat, zoom)) * TILE + h / 2,
  }
}

/** L'inverse : le point du globe sous un pixel de la fenêtre. */
export function unproject({ lat, lon, zoom, w, h }, point) {
  return {
    lon: tileToLon(lonToTile(lon, zoom) + (point.x - w / 2) / TILE, zoom),
    lat: tileToLat(latToTile(lat, zoom) + (point.y - h / 2) / TILE, zoom),
  }
}

/** Déplacement de la carte, en pixels, converti en nouveau centre. */
export function panned(view, dx, dy) {
  const center = unproject(view, { x: view.w / 2 - dx, y: view.h / 2 - dy })
  return { lat: center.lat, lon: center.lon }
}
