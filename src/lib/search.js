/** Recherche dans le tableau : on cherche dans ce qui porte du texte. */

const LABELS = {
  text: 'Note',
  markdown: 'Markdown',
  table: 'Tableau',
  node: 'Nœud',
  code: 'Code',
  sketch: 'Bloc visuel',
  image: 'Image',
  group: 'Groupe',
  frame: 'Cadre',
}

/** Ce qu'un bloc donne à lire, selon son type. */
function contentOf(item) {
  switch (item.type) {
    case 'text':
    case 'node':
    case 'markdown':
      return item.text ?? ''
    case 'table':
      return (item.cells ?? []).flat().join(' ')
    case 'code':
      return `${item.name ?? ''}\n${item.text ?? ''}`
    case 'sketch':
      return `${item.name ?? ''}\n${item.code ?? ''}`
    default:
      return item.name ?? ''
  }
}

/** Accents et casse mis de côté : « Écrire » se trouve en tapant « ecrire ». */
function fold(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Un extrait centré sur ce qu'on cherchait, pour reconnaître le bloc dans la liste. */
function excerpt(content, at, length) {
  const line = content.slice(Math.max(0, at - 24), at + length + 40).replace(/\s+/g, ' ').trim()
  return (at > 24 ? '… ' : '') + line
}

export function searchItems(items, query) {
  const needle = fold(query.trim())
  if (!needle) return []

  const found = []
  for (const item of items) {
    const content = contentOf(item)
    const at = fold(content).indexOf(needle)
    if (at === -1) continue
    found.push({
      id: item.id,
      type: item.type,
      label: LABELS[item.type] ?? 'Bloc',
      excerpt: excerpt(content, at, needle.length) || LABELS[item.type],
      // Un titre qui commence par ce qu'on cherche passe devant.
      score: at,
    })
  }

  return found.sort((a, b) => a.score - b.score).slice(0, 12)
}
