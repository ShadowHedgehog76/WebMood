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
const RELAYED = new Set(['doc', 'items', 'ink', 'inkEnd', 'cursor', 'chat'])

export async function openSession({ host, code, name, onPeers, onMessage, onStatus }) {
  const self = { name: name || 'Invité' }
  const links = new Map() // id → connexion
  const people = new Map() // id → { id, name, color }
  let closed = false

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
    })
  }

  if (host) {
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
      setTimeout(() => reject(new Error('Aucune réponse : code inconnu ou hôte hors ligne')), 12000)
    })
    wire(connection)
    connection.send({ t: 'hello', name: self.name, color: self.color })
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
      send({ t: 'bye' })
      for (const connection of links.values()) connection.close()
      peer.destroy()
    },
  }
}
