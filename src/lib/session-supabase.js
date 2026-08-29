/**
 * Session de collaboration par Supabase Realtime.
 *
 * Tout le monde rejoint un même canal nommé d'après le code du tableau : la présence
 * tient la liste des participants, la diffusion porte les messages. Il n'y a plus d'hôte,
 * plus de relais, plus de reprise à organiser — le service s'en charge, et une coupure se
 * répare toute seule.
 */

import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/** La diffusion refuse les gros messages : au-delà, on les découpe. */
const MAX_PAYLOAD = 160_000

let client = null

export const configured = () => Boolean(URL && KEY)

function connection() {
  if (!configured()) {
    throw new Error(
      'Supabase n’est pas configuré : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.',
    )
  }
  client ??= createClient(URL, KEY, {
    auth: { persistSession: false },
    // Curseur à chaque image et synchronisation au fil de l'eau : la limite du client
    // doit laisser passer les deux, sinon elle rogne d'abord sur les curseurs.
    realtime: { params: { eventsPerSecond: 60 } },
  })
  return client
}

export async function openSession({ code, name, color, id, onPeers, onMessage, onStatus }) {
  const self = { id, name: name || 'Invité', color }
  const supabase = connection()
  const channel = supabase.channel(`board-${code}`, {
    config: { presence: { key: self.id }, broadcast: { self: false } },
  })

  let closed = false
  let founder = false
  const pieces = new Map() // messages découpés en cours de réassemblage

  /** Les autres participants, tirés de la présence du canal. */
  const others = () =>
    Object.entries(channel.presenceState())
      .filter(([id_]) => id_ !== self.id)
      .map(([id_, entries]) => ({ id: id_, ...entries[0] }))

  const announce = () => onPeers?.(others())

  /**
   * Qui répond à un nouvel arrivant ? Le plus petit identifiant parmi ceux déjà là. Sans
   * cette règle, tout le monde lui enverrait le tableau en même temps.
   */
  const answersTo = (newcomer) => {
    const present = Object.keys(channel.presenceState()).filter((id_) => id_ !== newcomer)
    return present.length > 0 && present.sort()[0] === self.id
  }

  const deliver = (message, from) => {
    if (message.t === 'chunk') {
      const parts = pieces.get(message.ref) ?? new Array(message.n).fill(null)
      parts[message.i] = message.part
      pieces.set(message.ref, parts)
      if (parts.some((part) => part === null)) return
      pieces.delete(message.ref)
      onMessage?.(JSON.parse(parts.join('')), from)
      return
    }
    onMessage?.(message, from)
  }

  channel
    .on('broadcast', { event: 'msg' }, ({ payload }) => {
      if (payload.from === self.id) return
      // Un message adressé à quelqu'un d'autre ne nous concerne pas.
      if (payload.to && payload.to !== self.id) return
      deliver(payload.body, payload.from)
    })
    .on('presence', { event: 'sync' }, announce)
    .on('presence', { event: 'join' }, ({ key }) => {
      if (key === self.id) return
      announce()
      if (answersTo(key)) onMessage?.({ t: 'join' }, key)
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      announce()
      onMessage?.({ t: 'left' }, key)
    })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Supabase ne répond pas')), 12_000)
    channel.subscribe(async (status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        await channel.track({ name: self.name, color: self.color })
        // Personne d'autre au moment d'arriver : c'est nous qui ouvrons le tableau.
        founder = others().length === 0
        onStatus?.('ready')
        resolve()
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Après coup, ce n'est pas une panne : le client se rebranche tout seul.
        if (closed) return
        onStatus?.('reconnecting')
        clearTimeout(timer)
        reject(error ?? new Error('Connexion impossible'))
      }
    })
  })

  /** Envoie un message, découpé s'il est trop gros pour la diffusion. */
  const post = (message, to) => {
    if (closed) return
    const body = JSON.stringify(message)

    if (body.length <= MAX_PAYLOAD) {
      channel.send({ type: 'broadcast', event: 'msg', payload: { from: self.id, to, body: message } })
      return
    }

    const ref = `${self.id}-${Date.now().toString(36)}`
    const count = Math.ceil(body.length / MAX_PAYLOAD)
    for (let i = 0; i < count; i++) {
      channel.send({
        type: 'broadcast',
        event: 'msg',
        payload: {
          from: self.id,
          to,
          body: { t: 'chunk', ref, i, n: count, part: body.slice(i * MAX_PAYLOAD, (i + 1) * MAX_PAYLOAD) },
        },
      })
    }
  }

  return {
    code,
    transport: 'supabase',
    get isHost() {
      return founder
    },
    self,
    send(message) {
      post(message)
    },
    sendTo(id, message) {
      post(message, id)
    },
    close() {
      closed = true
      channel.untrack()
      supabase.removeChannel(channel)
    },
  }
}
