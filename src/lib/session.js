/**
 * Choix du transport d'une session partagée.
 *
 * Supabase Realtime assure l'ordinaire : un service tient le canal, la présence et la
 * reconnexion, et rien de tout cela n'est à écrire ici. Le pair-à-pair reste disponible
 * sous un interrupteur, pour un réseau local sans internet ou pour ne dépendre de
 * personne — au prix des reprises d'hôte et des relais qu'il faut alors gérer.
 */

import { makeCode, colorFor } from './peers.js'
import { openSession as openP2P } from './session-p2p.js'
import { configured as supabaseConfigured, openSession as openSupabase } from './session-supabase.js'

export { makeCode, PEER_COLORS } from './peers.js'
export { supabaseConfigured }

export const TRANSPORTS = {
  supabase: 'Supabase',
  p2p: 'Pair-à-pair',
}

export function openSession({ transport = 'supabase', ...options }) {
  if (transport === 'p2p') return openP2P(options)

  // Un identifiant tiré au sort ici : sans annuaire, personne ne nous en donne un.
  const id = `${Date.now().toString(36)}-${makeCode(6)}`
  return openSupabase({ ...options, id, color: colorFor(id) })
}
