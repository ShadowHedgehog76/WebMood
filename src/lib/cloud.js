/**
 * Compte et tableaux hébergés (Supabase).
 *
 * La clé publiable est faite pour vivre dans le navigateur : ce sont les règles de
 * sécurité au niveau des lignes (RLS) qui protègent les données, pas le secret de la clé.
 * Le client est chargé à la demande — personne ne paie ces kilo-octets sans s'en servir.
 */

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const BUCKET = 'board-images'

let client = null

/** Sans clés, la partie « compte » se met simplement en retrait. */
export const configured = () => Boolean(URL && KEY)

async function db() {
  if (client) return client
  if (!configured()) {
    throw new Error(
      'Supabase n’est pas configuré : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.',
    )
  }
  const { createClient } = await import('@supabase/supabase-js')
  client = createClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}

/* ---------- compte ---------- */

export async function currentUser() {
  const { data } = await (await db()).auth.getUser()
  return data?.user ?? null
}

export async function onAuthChange(handler) {
  const { data } = (await db()).auth.onAuthStateChange((_event, session) => {
    handler(session?.user ?? null)
  })
  return () => data?.subscription?.unsubscribe()
}

export async function signIn(email, password) {
  const { error } = await (await db()).auth.signInWithPassword({ email, password })
  if (error) throw new Error(traduire(error.message))
}

export async function signUp(email, password) {
  const { data, error } = await (await db()).auth.signUp({ email, password })
  if (error) throw new Error(traduire(error.message))
  // Sans session en retour, le projet demande une confirmation par courriel.
  return { confirmed: Boolean(data.session) }
}

export async function signInWithLink(email) {
  const { error } = await (await db()).auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  })
  if (error) throw new Error(traduire(error.message))
}

export async function signOut() {
  await (await db()).auth.signOut()
}

function traduire(message = '') {
  if (/invalid login credentials/i.test(message)) return 'Adresse ou mot de passe incorrect.'
  if (/email not confirmed/i.test(message)) return 'Adresse pas encore confirmée : voyez vos courriels.'
  if (/already registered/i.test(message)) return 'Cette adresse a déjà un compte.'
  if (/password should be/i.test(message)) return 'Mot de passe trop court (six caractères au minimum).'
  if (/email address .* is invalid/i.test(message)) return 'Cette adresse est refusée par le serveur.'
  if (/rate limit|too many/i.test(message)) return 'Trop de tentatives : réessayez dans quelques minutes.'
  return message
}

/* ---------- tableaux ---------- */

/** Liste légère : de quoi peupler le rail sans télécharger les documents. */
/** Identifiant conforme à la colonne `uuid` de la table, même sans `crypto.randomUUID`. */
export function newCloudId() {
  const random = globalThis.crypto?.randomUUID?.()
  if (random) return random
  const hex = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) =>
    byte.toString(16).padStart(2, '0'),
  )
  hex[6] = `4${hex[6][1]}`
  hex[8] = `${'89ab'[Number(hex[8][0]) % 4]}${hex[8][1]}`
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

export async function listBoards() {
  const { data, error } = await (await db())
    .from('boards')
    .select('id, name, preview, is_public, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchBoard(id) {
  const { data, error } = await (await db())
    .from('boards')
    .select('id, name, doc, is_public')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function saveBoard({ id, name, doc, preview, owner }) {
  const { error } = await (await db())
    .from('boards')
    .upsert({ id, owner, name, doc, preview }, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export async function removeBoard(id) {
  const { error } = await (await db()).from('boards').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Rend un tableau lisible par toute personne ayant le lien. */
/* ---------- actions sans retour ---------- */

/**
 * Vide le compte : les tableaux en base et les images du Storage disparaissent, le
 * compte lui-même reste. Les copies locales ne sont pas touchées.
 */
export async function wipeCloud(userId) {
  const supabase = await db()

  const { data: files, error: listing } = await supabase.storage.from(BUCKET).list(userId, {
    limit: 1000,
  })
  if (listing) throw new Error(listing.message)
  if (files?.length) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove(files.map((file) => `${userId}/${file.name}`))
    if (error) throw new Error(error.message)
  }

  const { error, count } = await supabase
    .from('boards')
    .delete({ count: 'exact' })
    .eq('owner', userId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * Supprime le compte. Le navigateur n'a pas les droits d'écrire dans `auth.users` :
 * c'est une fonction en base, qui ne sait supprimer que l'appelant (`auth.uid()`).
 * Tableaux et images partent avec.
 */
export async function deleteAccount() {
  const supabase = await db()
  const { error } = await supabase.rpc('delete_account')
  if (error) throw new Error(traduire(error.message))
  await supabase.auth.signOut()
}

export async function publishBoard(id, is_public = true) {
  const { error } = await (await db()).from('boards').update({ is_public }).eq('id', id)
  if (error) throw new Error(error.message)
}

/* ---------- images ---------- */

async function digest(text) {
  const bytes = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function decodeDataUrl(source) {
  const match = source.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const binary = atob(match[2])
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return { type: match[1], bytes }
}

/**
 * Les images d'un document partent dans Storage et ne laissent qu'une adresse : sans ça,
 * chaque enregistrement renverrait plusieurs mégaoctets de base64 dans la base.
 */
export async function uploadImages(doc, userId) {
  const items = doc.items ?? []
  if (!items.some((item) => item.type === 'image' && item.src?.startsWith('data:'))) return doc

  const supabase = await db()
  const next = []
  for (const item of items) {
    if (item.type !== 'image' || !item.src?.startsWith('data:')) {
      next.push(item)
      continue
    }
    const file = decodeDataUrl(item.src)
    if (!file) {
      next.push(item)
      continue
    }
    const extension = file.type.split('/')[1]?.replace('+xml', '') ?? 'png'
    const path = `${userId}/${await digest(item.src)}.${extension}`

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file.bytes, { contentType: file.type, upsert: true })
    if (error && !/exists/i.test(error.message)) {
      next.push(item)
      continue
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    next.push({ ...item, src: data.publicUrl })
  }
  return { ...doc, items: next }
}
