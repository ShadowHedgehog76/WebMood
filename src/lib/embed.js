/**
 * Liens déposés sur le tableau.
 *
 * Quelques services savent s'afficher dans un cadre et donnent une adresse d'intégration
 * dédiée : on la reconnaît et on la reprend. Tous les autres refusent d'être encadrés
 * (`X-Frame-Options`), et un cadre vide ne rend service à personne : ils deviennent une
 * carte — domaine, favicon, adresse — qui s'ouvre d'un clic.
 */

const PROVIDERS = [
  {
    key: 'youtube',
    label: 'YouTube',
    ratio: 16 / 9,
    match: (url) =>
      /(^|\.)youtube\.com$/.test(url.hostname)
        ? url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop()
        : /(^|\.)youtu\.be$/.test(url.hostname)
          ? url.pathname.slice(1)
          : null,
    embed: (id) => `https://www.youtube-nocookie.com/embed/${id}`,
  },
  {
    key: 'vimeo',
    label: 'Vimeo',
    ratio: 16 / 9,
    match: (url) =>
      /(^|\.)vimeo\.com$/.test(url.hostname) ? /\d+/.exec(url.pathname)?.[0] : null,
    embed: (id) => `https://player.vimeo.com/video/${id}`,
  },
  {
    key: 'figma',
    label: 'Figma',
    ratio: 4 / 3,
    match: (url) => (/(^|\.)figma\.com$/.test(url.hostname) ? url.href : null),
    embed: (href) => `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(href)}`,
  },
  {
    key: 'spotify',
    label: 'Spotify',
    ratio: 2.4,
    match: (url) =>
      /(^|\.)open\.spotify\.com$/.test(url.hostname) || url.hostname === 'open.spotify.com'
        ? url.pathname
        : null,
    embed: (path) => `https://open.spotify.com/embed${path}`,
  },
  {
    key: 'codepen',
    label: 'CodePen',
    ratio: 4 / 3,
    match: (url) =>
      /(^|\.)codepen\.io$/.test(url.hostname) ? url.pathname.replace('/pen/', '/embed/') : null,
    embed: (path) => `https://codepen.io${path}`,
  },
  {
    key: 'maps',
    label: 'Google Maps',
    ratio: 4 / 3,
    match: (url) =>
      /(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname.startsWith('/maps')
        ? url.href
        : null,
    embed: (href) => (href.includes('output=embed') ? href : `${href}&output=embed`),
  },
]

/** Le lien est-il une adresse exploitable ? */
export function parseUrl(text) {
  const trimmed = (text ?? '').trim()
  if (!/^https?:\/\/\S+$/i.test(trimmed) || /\s/.test(trimmed)) return null
  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

/**
 * Décrit ce qu'il faut afficher pour ce lien : un cadre intégré chez un service connu,
 * une carte partout ailleurs.
 */
export function describeLink(text) {
  const url = parseUrl(text)
  if (!url) return null

  for (const provider of PROVIDERS) {
    const found = provider.match(url)
    if (found) {
      return {
        kind: 'embed',
        provider: provider.key,
        label: provider.label,
        src: provider.embed(found),
        href: url.href,
        ratio: provider.ratio,
        domain: url.hostname.replace(/^www\./, ''),
      }
    }
  }

  return {
    kind: 'card',
    provider: 'link',
    label: url.hostname.replace(/^www\./, ''),
    href: url.href,
    ratio: 2.6,
    domain: url.hostname.replace(/^www\./, ''),
    // Le service de favicons de Google évite d'aller chercher chaque site nous-mêmes,
    // ce que la politique d'origine interdirait de toute façon.
    icon: `https://www.google.com/s2/favicons?sz=64&domain=${url.hostname}`,
  }
}

const DEFAULT_WIDTH = 480

/** Le bloc correspondant à un lien, dimensionné selon le service. */
export function linkItem(text, at, newId) {
  const found = describeLink(text)
  if (!found) return null
  const w = DEFAULT_WIDTH
  return {
    id: newId(),
    type: 'embed',
    x: Math.round(at.x),
    y: Math.round(at.y),
    w,
    h: Math.round(w / found.ratio),
    ...found,
  }
}
