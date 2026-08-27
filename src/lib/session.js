/**
 * Session de collaboration en pair-à-pair (WebRTC via PeerJS).
 *
 * Topologie en étoile : l'hôte porte le code, les invités s'y connectent, et l'hôte
 * relaie les messages entre eux. Aucun serveur applicatif — un annuaire public sert à la
 * mise en relation, des relais TURN publics prennent le relais quand la liaison directe
 * est impossible (NAT strict, réseau d'entreprise, mobile).
 */

const PREFIX = 'moodboard-'
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

const RELAYED = new Set(['doc', 'sync', 'cursor', 'chat', 'typing', 'shake', 'mark', 'timer'])

// Battement de cœur : l'hôte donne signe de vie, chacun surveille l'autre bout.
const PING_EVERY = 2500
// Un silence de trois battements déclenche une tentative de reconnexion — ce n'est pas
// une coupure : si l'hôte est bien là, la liaison se rétablit en une seconde.
const HOST_TIMEOUT = 8000
const GUEST_TIMEOUT = 25000
const RELINK_TRIES = 3
const OPEN_TIMEOUT = 9000
const DIAL_TIMEOUT = 2500

/**
 * Chemins de secours : STUN pour découvrir son adresse, TURN pour faire transiter le
 * flux quand la connexion directe échoue. Le port 443 en TCP passe presque partout.
 */
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

export function hostIdFor(code) {
  return PREFIX + code
}

/** Le survivant au plus petit identifiant reprend la main : tout le monde calcule pareil. */
export function electHost(survivors) {
  return survivors.map((person) => person.id).sort()[0] ?? null
}

async function makePeer(id) {
  const { default: Peer } = await import('peerjs')
  const peer = new Peer(id ?? undefined, {
    debug: 0,
    pingInterval: 3000, // garde la liaison avec l'annuaire au chaud
    config: { iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 },
  })

  await new Promise((resolve, reject) => {
    peer.once('open', resolve)
    peer.once('error', reject)
    setTimeout(() => reject(new Error("L'annuaire ne répond pas")), OPEN_TIMEOUT)
  })
  return peer
}

/**
 * Ouvre une session. `host: true` crée le code, sinon on rejoint `code`.
 * Renvoie une poignée : { code, isHost, self, send, sendTo, close }.
 */
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
  const seen = new Map() // id → dernier signe de vie (côté hôte)

  let closed = false
  let relinking = false
  let heartbeat = 0
  let watchdog = 0
  let lastSeen = Date.now()

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
        /* connexion morte : son événement close fera le ménage */
      }
    }
  }

  const drop = (id) => {
    people.delete(id)
    links.get(id)?.close()
    links.delete(id)
    seen.delete(id)
    announce()
    onMessage?.({ t: 'left' }, id)
  }

  const peer = await makePeer(host ? hostIdFor(code) : null)
  self.id = peer.id
  self.color = colorFor(peer.id)

  // L'annuaire peut lâcher sans que la session soit perdue : on se rebranche.
  peer.on('disconnected', () => {
    if (closed) return
    onStatus?.('reconnecting')
    setTimeout(() => {
      if (!closed && peer.disconnected && !peer.destroyed) {
        try {
          peer.reconnect()
        } catch {
          /* on retentera au prochain événement */
        }
      }
    }, 800)
  })

  peer.on('error', (error) => {
    // Les erreurs de pair (invité parti, code introuvable) ne doivent pas tuer la session.
    if (closed) return
    if (error?.type === 'peer-unavailable' || error?.type === 'network') return
    onStatus?.('error', error)
  })

  const wire = (connection) => {
    links.set(connection.peer, connection)
    seen.set(connection.peer, Date.now())

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
          drop(connection.peer)
          break

        default:
          onMessage?.(message, connection.peer)
          if (host && RELAYED.has(message.t)) send(message, connection.peer)
          break
      }
    })

    const lost = () => {
      if (closed) return
      people.delete(connection.peer)
      links.delete(connection.peer)
      seen.delete(connection.peer)
      announce()
      onMessage?.({ t: 'left' }, connection.peer)
      // Côté invité, on ne conclut rien avant d'avoir tenté de se rebrancher.
      if (!host && connection.peer === hostIdFor(code)) relink()
    }

    connection.on('close', lost)
    connection.on('error', lost)
  }

  /**
   * Ouvre une connexion vers un pair. « Pair introuvable » remonte sur l'objet peer et
   * non sur la connexion : on l'écoute aussi, sinon on attendrait le délai pour rien.
   */
  const dial = (id, timeout = DIAL_TIMEOUT) =>
    new Promise((resolve, reject) => {
      const connection = peer.connect(id, { reliable: true })
      if (!connection) {
        reject(new Error('Connexion impossible'))
        return
      }

      let timer = 0
      const onPeerError = (error) => {
        if (error?.type !== 'peer-unavailable') return
        done()
        reject(error)
      }
      const done = () => {
        clearTimeout(timer)
        peer.off('error', onPeerError)
      }

      timer = setTimeout(() => {
        done()
        reject(new Error('Aucune réponse'))
      }, timeout)
      peer.on('error', onPeerError)

      connection.once('open', () => {
        done()
        resolve(connection)
      })
      connection.once('error', (error) => {
        done()
        reject(error)
      })
    })

  const greet = (connection) => {
    wire(connection)
    connection.send({ t: 'hello', name: self.name, color: self.color })
    lastSeen = Date.now()
  }

  /**
   * Coupure côté invité : avant de déclarer l'hôte perdu, on retente plusieurs fois de
   * le rejoindre. Une microcoupure ne doit pas provoquer un changement d'hôte.
   */
  const relink = async () => {
    if (closed || relinking || host) return
    relinking = true
    onStatus?.('reconnecting')

    for (let attempt = 0; attempt < RELINK_TRIES && !closed; attempt++) {
      await wait(600 + attempt * 900)
      if (closed) break
      if (peer.disconnected && !peer.destroyed) {
        try {
          peer.reconnect()
          await wait(600)
        } catch {
          /* on tente quand même l'appel */
        }
      }
      try {
        greet(await dial(hostIdFor(code)))
        relinking = false
        onStatus?.('ready')
        return
      } catch {
        /* on réessaie */
      }
    }

    relinking = false
    hostGone()
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

  // Un onglet en arrière-plan voit ses minuteurs ralentis : au retour, on repart à zéro
  // plutôt que de conclure à une déconnexion.
  const onVisible = () => {
    if (document.hidden) return
    lastSeen = Date.now()
    for (const id of links.keys()) seen.set(id, Date.now())
    if (peer.disconnected && !peer.destroyed && !closed) {
      try {
        peer.reconnect()
      } catch {
        /* ignore */
      }
    }
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onVisible)

  // L'hôte accueille les arrivants ; un invité n'en reçoit pas, mais rien n'y oblige.
  peer.on('connection', (connection) => {
    connection.on('open', () => {
      wire(connection)
      connection.send({ t: 'hello', name: self.name, color: self.color })
    })
  })

  if (host) {
    heartbeat = setInterval(() => send({ t: 'ping', at: Date.now() }), PING_EVERY)
    // Un invité disparu sans prévenir finit par sortir de la liste.
    watchdog = setInterval(() => {
      const now = Date.now()
      for (const id of [...links.keys()]) {
        if (now - (seen.get(id) ?? now) > GUEST_TIMEOUT) drop(id)
      }
    }, 3000)
    onStatus?.('ready')
  } else {
    greet(await dial(hostIdFor(code), OPEN_TIMEOUT))
    heartbeat = setInterval(() => send({ t: 'ping', at: Date.now() }), PING_EVERY)
    watchdog = setInterval(() => {
      if (Date.now() - lastSeen > HOST_TIMEOUT) relink()
    }, 2000)
    onStatus?.('ready')
  }

  return {
    code,
    isHost: Boolean(host),
    self,
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
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      send({ t: 'bye' })
      for (const connection of links.values()) connection.close()
      peer.destroy()
    },
  }
}
