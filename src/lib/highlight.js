/**
 * Coloration syntaxique minimale (commentaires, chaînes, nombres, mots-clés).
 * Volontairement générique : couvre correctement JS/TS, Python, CSS, JSON, Rust…
 */

const KEYWORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'elif', 'for', 'while', 'do',
  'import', 'from', 'export', 'default', 'class', 'extends', 'new', 'await', 'async',
  'try', 'catch', 'finally', 'throw', 'switch', 'case', 'break', 'continue', 'yield',
  'typeof', 'instanceof', 'delete', 'void', 'in', 'of', 'this', 'super', 'static',
  'null', 'undefined', 'true', 'false', 'None', 'True', 'False', 'self',
  'def', 'lambda', 'pass', 'with', 'as', 'raise', 'global', 'not', 'and', 'or',
  'public', 'private', 'protected', 'interface', 'type', 'enum', 'struct', 'impl',
  'fn', 'pub', 'use', 'mut', 'match', 'where', 'int', 'float', 'bool', 'string',
]

const TOKEN = new RegExp(
  [
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|^[ \\t]*#[^\\n]*)', // 1 commentaire
    '("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`)', // 2 chaîne
    '(\\b\\d+(?:\\.\\d+)?\\b)', // 3 nombre
    `\\b(${KEYWORDS.join('|')})\\b`, // 4 mot-clé
    '([A-Za-z_$][\\w$]*)(?=\\s*\\()', // 5 appel de fonction
  ].join('|'),
  'gm',
)

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

export function escapeHtml(text) {
  return text.replace(/[&<>]/g, (char) => ESCAPES[char])
}

export function highlight(code) {
  let html = ''
  let last = 0
  TOKEN.lastIndex = 0

  let match
  while ((match = TOKEN.exec(code)) !== null) {
    // Garde-fou contre une correspondance vide qui bloquerait la boucle.
    if (match[0] === '') {
      TOKEN.lastIndex += 1
      continue
    }
    html += escapeHtml(code.slice(last, match.index))
    const cls = match[1] ? 'cm' : match[2] ? 'st' : match[3] ? 'nu' : match[4] ? 'kw' : 'fn'
    html += `<span class="tk-${cls}">${escapeHtml(match[0])}</span>`
    last = match.index + match[0].length
  }
  html += escapeHtml(code.slice(last))
  return html
}

const EXT_LANG = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  c: 'c', h: 'c', cpp: 'c++', cs: 'c#', php: 'php', swift: 'swift',
  css: 'css', scss: 'scss', html: 'html', json: 'json', yml: 'yaml', yaml: 'yaml',
  md: 'markdown', sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', txt: 'texte',
}

export function langFromName(name = '') {
  const ext = name.split('.').pop()?.toLowerCase()
  return EXT_LANG[ext] || 'texte'
}

/** Devine grossièrement le langage d'un extrait collé (sans nom de fichier). */
export function guessLang(code) {
  const text = code.trim()
  if (!text) return 'texte'

  if (/^[[{]/.test(text)) {
    try {
      JSON.parse(text)
      return 'json'
    } catch {
      /* pas du JSON */
    }
  }
  if (/^\s*<(!doctype|html|div|span|section|p|a|script)\b/i.test(text)) return 'html'
  if (/^\s*[.#]?[\w-]+[^\n{]*\{[^}]*:[^;]+;/m.test(text)) return 'css'
  if (/^\s*(def |class \w+.*:|from \w+ import |import \w+$|print\()/m.test(text)) return 'python'
  if (/(^|\n)\s*(interface |type \w+\s*=|enum )|:\s*(string|number|boolean)\b/.test(text)) {
    return 'typescript'
  }
  if (/\b(const|let|var|function|=>|console\.log|import .* from)\b/.test(text)) return 'javascript'
  if (/^\s*(#!|\$ |npm |git |cd |ls |echo )/m.test(text)) return 'shell'
  return 'texte'
}
