/** Réglages du tableau : ce que l'outil décidait tout seul jusqu'ici. */

const KEY = 'moodboard:settings'

export const DEFAULTS = {
  snap: true, // aimantation aux bords et aux centres des autres blocs
  grid: true, // pointillés de la grille
  p2p: false, // sessions en pair-à-pair plutôt que par Supabase
}

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    // Réglages illisibles : on repart des valeurs par défaut plutôt que de bloquer.
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* stockage refusé : les réglages ne survivront pas à la session */
  }
}
