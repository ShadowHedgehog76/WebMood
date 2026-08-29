/** Ce que les deux transports ont en commun : le code d'un tableau, et les couleurs. */

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function makeCode(length = 6) {
  const values = crypto.getRandomValues(new Uint32Array(length))
  return [...values].map((value) => ALPHABET[value % ALPHABET.length]).join('')
}

export const PEER_COLORS = ['#e5484d', '#f5a623', '#30a46c', '#3b82f6', '#8b5cf6', '#0ea5b7']

/** Même identifiant, même couleur, chez tout le monde. */
export function colorFor(id) {
  let sum = 0
  for (const char of id) sum += char.charCodeAt(0)
  return PEER_COLORS[sum % PEER_COLORS.length]
}
