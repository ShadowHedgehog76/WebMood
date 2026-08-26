/**
 * Session de collaboration en pair-à-pair (WebRTC via PeerJS).
 *
 * Topologie en étoile : l'hôte porte le code, les invités s'y connectent, et l'hôte
 * relaie les messages entre eux. Aucun serveur applicatif — seul un annuaire public
 * sert à la mise en relation, les données passent ensuite directement entre navigateurs.
 */

const PREFIX = 'moodboard-'
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function makeCode(length = 6) {
  const values = crypto.getRandomValues(new Uint32Array(length))
  return [...values].map((value) => ALPHABET[value % ALPHABET.length]).join('')
}

export const PEER_COLORS = ['#e5484d', '#f5a623', '#30a46c', '#3b82f6', '#8b5cf6', '#0ea5b7']

function colorFor(id) {
  let sum = 0
  for (const char of id) sum += char.charCodeAt(0)
  return PEER_COLORS[sum % PEER_COLORS.length]
}

async function makePeer(id) {
  const { default: Peer } = await import('peerjs')
  const peer = new Peer(id ?? undefined, { debug: 0 })
  await new Promise((resolve, reject) => {
    peer.on('open', resolve)
    peer.on('error', reject)
  })
  return peer
}

/**
 * Ouvre une session. `host: true` crée le code, sinon on rejoint `code`.
 * Renvoie une poignée : { code, isHost, self, send, sendTo, close }.
 */
const RELAYED = new Set(['doc', 'items', 'ink', 'inkEnd', 'cursor', 'chat', 'typing', 'shake'])

// Battement de cœur : l'hôte donne signe de vie, les invités surveillent.
const PING_EVERY = 2000
const HOST_TIMEOUT = 7000

export function hostIdFor(code) {
  return PREFIX + code
}

/** Le survivant au plus petit identifiant reprend la main : tout le monde calcule pareil. */
export function electHost(survivors) {
  return survivors.map((person) => person.id).sort()[0] ?? null
}

export async function openSession({
  host,
  code,
  name,
  onPeers,
  onMessage,
  onStatus,
  onHostLost,
}) {
  const self = { name: name || 'Invité' }
  const links = new Map() // id → connexion
  const people = new Map() // id → { id, name, color }
  let closed = false
  let heartbeat = 0
  let watchdog = 0
  let lastSeen = Date.now() // dernier signe de vie de l'hôte (côté invité)
  const seen = new Map() // id → dernier signe de vie (côté hôte)

  const announce = () => {
    onPeers?.([...people.values()])
    // L'hôte s'inclut dans la liste qu'il diffuse : sinon les invités ne le voient pas.
    if (host) {
      send({
        t: 'peers',
        list: [{ id: self.id, name: self.name, color: self.color }, ...people.values()],
      })
    }
  }

  const send = (message, except) => {
    for (const [id, connection] of links) {
      if (id === except || !connection.open) continue
      try {
        connection.send(message)
      } catch {
        /* connexion morte : elle sera nettoyée par son événement close */
      }
    }
  }

  const peer = await makePeer(host ? PREFIX + code : null)
  self.id = peer.id
  self.color = colorFor(peer.id)

  const wire = (connection) => {
    links.set(connection.peer, connection)

    connection.on('data', (message) => {
      if (closed || !message?.t) return

      // Toute réception vaut signe de vie, dans un sens comme dans l'autre.
      seen.set(connection.peer, Date.now())
      if (!host && connection.peer === hostIdFor(code)) lastSeen = Date.now()
      if (message.t === 'ping') return

      switch (message.t) {
        case 'hello':
          people.set(connection.peer, {
            id: connection.peer,
            name: message.name,
            color: message.color,
          })
          announce()
          // L'hôte met le nouvel arrivant à jour avec le tableau courant.
          if (host) onMessage?.({ t: 'join' }, connection.peer)
          break

        case 'peers':
          people.clear()
          for (const person of message.list) {
            if (person.id !== self.id) people.set(person.id, person)
          }
          onPeers?.([...people.values()])
          break

        case 'bye':
          people.delete(connection.peer)
          links.delete(connection.peer)
          announce()
          onMessage?.({ t: 'left' }, connection.peer)
          break

        default:
          onMessage?.(message, connection.peer)
          // En étoile, l'hôte fait suivre aux autres invités.
          if (host && RELAYED.has(message.t)) send(message, connection.peer)
          break
      }
    })

    connection.on('close', () => {
      people.delete(connection.peer)
      links.delete(connection.peer)
      announce()
      onMessage?.({ t: 'left' }, connection.peer)
      // L'hôte vient de tomber : on ne l'attend pas plus longtemps.
      if (!host && connection.peer === hostIdFor(code)) hostGone()
    })
  }

  const hostGone = () => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    clearInterval(watchdog)

    const survivors = [
      { id: self.id, name: self.name, color: self.color },
      ...[...people.values()].filter((person) => person.id !== hostIdFor(code)),
    ]
    const winner = electHost(survivors)
    onHostLost?.({ survivors, winner, isWinner: winner === self.id })
  }

  const drop = (id) => {
    people.delete(id)
    links.get(id)?.close()
    links.delete(id)
    seen.delete(id)
    announce()
    onMessage?.({ t: 'left' }, id)
  }

  if (host) {
    heartbeat = setInterval(() => send({ t: 'ping', at: Date.now() }), PING_EVERY)
    // Un invité disparu sans prévenir (onglet fermé, réseau coupé) finit par sortir.
    watchdog = setInterval(() => {
      const now = Date.now()
      for (const id of [...links.keys()]) {
        if (now - (seen.get(id) ?? now) > HOST_TIMEOUT) drop(id)
      }
    }, 2000)
    peer.on('connection', (connection) => {
      connection.on('open', () => {
        wire(connection)
        connection.send({ t: 'hello', name: self.name, color: self.color })
      })
    })
    onStatus?.('ready')
  } else {
    const connection = peer.connect(PREFIX + code, { reliable: true })
    await new Promise((resolve, reject) => {
      connection.on('open', resolve)
      peer.on('error', reject)
      // Court : la reprise d'hôte enchaîne les tentatives, mieux vaut échouer vite.
      setTimeout(() => reject(new Error('Aucune réponse : code inconnu ou hôte hors ligne')), 4500)
    })
    wire(connection)
    connection.send({ t: 'hello', name: self.name, color: self.color })
    lastSeen = Date.now()
    // L'invité donne aussi de la voix, pour que l'hôte sache qu'il est encore là.
    heartbeat = setInterval(() => send({ t: 'ping', at: Date.now() }), PING_EVERY)
    watchdog = setInterval(() => {
      if (Date.now() - lastSeen > HOST_TIMEOUT) hostGone()
    }, 1500)
    onStatus?.('ready')
  }

  return {
    code,
    isHost: Boolean(host),
    self,
    /** Diffuse à tout le monde (l'hôte relaiera pour les invités). */
    send(message) {
      send(message)
    },
    sendTo(id, message) {
      links.get(id)?.send(message)
    },
    close() {
      closed = true
      clearInterval(heartbeat)
      clearInterval(watchdog)
      send({ t: 'bye' })
      for (const connection of links.values()) connection.close()
      peer.destroy()
    },
  }
}
