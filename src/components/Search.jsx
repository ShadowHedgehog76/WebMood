import { useEffect, useMemo, useRef, useState } from 'react'
import { searchItems } from '../lib/search.js'
import './Search.css'

/**
 * Recherche dans le tableau (⌘F). On tape, la liste suit ; ↑ ↓ parcourent, ⏎ emmène
 * la vue sur le bloc trouvé et le sélectionne.
 */
export default function Search({ items, onGo, onClose }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const results = useMemo(() => searchItems(items, query), [items, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActive(0)
  }, [query])

  const go = (index) => {
    const found = results[index]
    if (found) onGo(found.id)
  }

  return (
    <div className="search">
      <input
        ref={inputRef}
        className="search__field"
        value={query}
        placeholder="Rechercher dans le tableau…"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') onClose()
          if (event.key === 'Enter') go(active)
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((current) => Math.min(results.length - 1, current + 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((current) => Math.max(0, current - 1))
          }
        }}
      />

      {query.trim() && (
        <div className="search__results">
          {results.length === 0 && <p className="search__empty">Rien trouvé</p>}
          {results.map((found, index) => (
            <button
              key={found.id}
              className={`search__hit ${index === active ? 'is-active' : ''}`}
              onPointerEnter={() => setActive(index)}
              onClick={() => go(index)}
            >
              <span className="search__kind">{found.label}</span>
              <span className="search__excerpt">{found.excerpt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
