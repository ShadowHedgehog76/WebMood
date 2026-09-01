/**
 * Persistance : plusieurs tableaux, un index et un enregistrement par tableau.
 * IndexedDB en premier (supporte plusieurs Mo d'images), localStorage en secours.
 */

const DB_NAME = 'moodboard'
const STORE = 'boards'
const MEDIA = 'media'
const INDEX_KEY = 'index'
const STENCILS_KEY = 'stencils'
const LEGACY_KEY = 'default'
const LS_PREFIX = 'moodboard:'
const VERSION = 2

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'))
      return
    }
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      // Les gros médias sont rangés à part, en `Blob` : les mettre dans le document
      // obligerait à les encoder en base64, à les relire entièrement à chaque
      // enregistrement, et à les transporter à chaque synchronisation.
      if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx(db, mode, run, store = STORE) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = run(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function read(key) {
  try {
    const db = await openDb()
    const data = await tx(db, 'readonly', (store) => store.get(key))
    db.close()
    if (data !== undefined) return data
  } catch {
    /* on retombe sur localStorage */
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function write(key, value) {
  try {
    const db = await openDb()
    await tx(db, 'readwrite', (store) => store.put(value, key))
    db.close()
    return true
  } catch {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  }
}

async function remove(key) {
  try {
    const db = await openDb()
    await tx(db, 'readwrite', (store) => store.delete(key))
    db.close()
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LS_PREFIX + key)
  } catch {
    /* ignore */
  }
}

export function newBoardId() {
  return globalThis.crypto?.randomUUID?.() ?? `board-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Index des tableaux. Un ancien document unique est repris tel quel au premier lancement.
 */
export async function loadIndex() {
  const index = await read(INDEX_KEY)
  if (index?.boards?.length) return index

  const legacy = await read(LEGACY_KEY)
  const boards = [{ id: LEGACY_KEY, name: 'Tableau 1' }]
  const fresh = { boards, currentId: LEGACY_KEY }
  if (!legacy) await write(LEGACY_KEY, { strokes: [], items: [], links: [] })
  await write(INDEX_KEY, fresh)
  return fresh
}

export function saveIndex(index) {
  return write(INDEX_KEY, index)
}

export function loadBoard(id) {
  return read(id)
}

export function saveBoard(id, board) {
  return write(id, { ...board, savedAt: Date.now() })
}

export function deleteBoard(id) {
  return remove(id)
}

/**
 * Bibliothèque de modèles : un seul enregistrement, partagé par tous les tableaux —
 * c'est bien l'intérêt, reposer ailleurs ce qu'on a mis de côté ici.
 */
export async function loadStencils() {
  const list = await read(STENCILS_KEY)
  return Array.isArray(list) ? list : []
}

export function saveStencils(list) {
  return write(STENCILS_KEY, list)
}

/* ---------- gros médias ---------- */

/**
 * Un `Blob` va directement dans IndexedDB : aucune lecture en mémoire, aucun gonflement
 * de 33 % comme en base64, et le document reste léger — il ne garde qu'une clé.
 */
export async function putMedia(key, blob) {
  const db = await openDb()
  await tx(db, 'readwrite', (store) => store.put(blob, key), MEDIA)
  db.close()
  return key
}

export async function getMedia(key) {
  try {
    const db = await openDb()
    const blob = await tx(db, 'readonly', (store) => store.get(key), MEDIA)
    db.close()
    return blob ?? null
  } catch {
    return null
  }
}

export async function mediaKeys() {
  try {
    const db = await openDb()
    const keys = await tx(db, 'readonly', (store) => store.getAllKeys(), MEDIA)
    db.close()
    return keys ?? []
  } catch {
    return []
  }
}

export async function deleteMedia(keys) {
  try {
    const db = await openDb()
    for (const key of keys) {
      await tx(db, 'readwrite', (store) => store.delete(key), MEDIA)
    }
    db.close()
  } catch {
    /* rien à nettoyer */
  }
}
