import { useEffect, useState } from 'react'
import { getMedia } from './storage.js'

/**
 * D'où vient le contenu d'un bloc média ?
 *
 * Deux régimes, selon le poids. Un petit fichier voyage **dans le document**, en `data:` :
 * il part avec l'export, la synchronisation et le partage, sans rien de plus à gérer. Un
 * gros fichier — une vidéo, typiquement — reste **rangé à part** dans IndexedDB, et le
 * document n'en garde que la clé : sans ça, un film de 1,4 Go passerait en base64
 * (+33 %), serait relu en entier à chaque enregistrement, et repartirait à chaque
 * synchronisation.
 *
 * Le prix de ce second régime est assumé : le fichier ne quitte pas cet appareil, à moins
 * d'être envoyé dans le Storage d'un compte. Les blocs concernés le disent.
 */
export const isLocalAsset = (item) => Boolean(item?.blobKey) && !item?.src

/**
 * Une adresse d'objet par clé, partagée et comptée.
 *
 * Deux blocs peuvent citer le même fichier (un bloc dupliqué, un modèle reposé) : sans
 * ce partage, chacun en créerait une copie. Et sans le compteur, le démontage de l'un
 * révoquerait l'adresse que l'autre est en train de lire — ce que le mode strict de
 * React provoque à chaque montage.
 */
const shared = new Map() // clé → { url, users, pending }

function acquire(key) {
  const held = shared.get(key)
  if (held) {
    held.users += 1
    return held.pending
  }

  const entry = { url: null, users: 1, pending: null }
  entry.pending = getMedia(key).then((blob) => {
    if (!blob) return null
    // Personne n'attend plus cette entrée-là : créer une adresse ne ferait que la fuir.
    // On compare l'objet, pas la clé : une seconde entrée a pu prendre sa place entre-temps.
    if (shared.get(key) !== entry) return null
    entry.url = URL.createObjectURL(blob)
    return entry.url
  })
  shared.set(key, entry)
  return entry.pending
}

function release(key) {
  const held = shared.get(key)
  if (!held) return
  held.users -= 1
  if (held.users > 0) return
  shared.delete(key)
  if (held.url) URL.revokeObjectURL(held.url)
}

/** Retourne une adresse utilisable pour ce bloc, et la relâche en partant. */
export function useAssetSource(item) {
  const [source, setSource] = useState(() => item.src ?? null)
  const key = item.blobKey

  useEffect(() => {
    if (item.src) {
      setSource(item.src)
      return undefined
    }
    if (!key) {
      setSource(null)
      return undefined
    }

    let cancelled = false
    acquire(key).then((url) => {
      if (!cancelled) setSource(url)
    })

    return () => {
      cancelled = true
      release(key)
    }
  }, [item.src, key])

  return source
}

/** Les clés de médias utilisées par un document. */
export function keysOf(doc) {
  return (doc?.items ?? []).map((item) => item.blobKey).filter(Boolean)
}
