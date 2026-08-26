/**
 * Code de partage : le document complet, compressé puis encodé en texte.
 * Aucun serveur — le code se transmet comme on veut (message, mail, papier…).
 */

const PREFIX = 'MB1'

function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function squeeze(bytes, mode) {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(mode))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function expand(bytes, mode) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(mode))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Document → code partageable. */
export async function encodeBoard(doc, name = 'Tableau partagé') {
  const payload = JSON.stringify({
    v: 1,
    name,
    strokes: doc.strokes ?? [],
    items: doc.items ?? [],
    links: doc.links ?? [],
  })
  const raw = new TextEncoder().encode(payload)
  const packed = await squeeze(raw, 'deflate-raw')

  // `z` = compressé, `p` = brut (navigateur sans CompressionStream).
  return packed ? `${PREFIX}z${toBase64Url(packed)}` : `${PREFIX}p${toBase64Url(raw)}`
}

/** Code partageable → document. Lève une erreur si le code est invalide. */
export async function decodeBoard(code) {
  const clean = code.trim().replace(/\s+/g, '')
  if (!clean.startsWith(PREFIX)) throw new Error('Ce code ne vient pas de Moodboard')

  const flag = clean[PREFIX.length]
  const bytes = fromBase64Url(clean.slice(PREFIX.length + 1))
  const raw = flag === 'z' ? await expand(bytes, 'deflate-raw') : bytes
  const data = JSON.parse(new TextDecoder().decode(raw))

  return {
    name: data.name ?? 'Tableau partagé',
    strokes: Array.isArray(data.strokes) ? data.strokes : [],
    items: Array.isArray(data.items) ? data.items : [],
    links: Array.isArray(data.links) ? data.links : [],
  }
}

/** Repère lisible pour l'utilisateur : « 12 ko ». */
export function codeSize(code) {
  const bytes = new Blob([code]).size
  return bytes > 1024 ? `${Math.round(bytes / 1024)} ko` : `${bytes} o`
}
