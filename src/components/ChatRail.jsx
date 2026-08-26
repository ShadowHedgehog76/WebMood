import { useEffect, useRef, useState } from 'react'
import './ChatRail.css'

const SLOT = 42 // hauteur d'une ligne de participant
const GAP = 4
const PADDING = 20 // 10 px en haut et en bas
const OPEN_HEIGHT = 520

function initials(name) {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Rail de droite, symétrique de celui des tableaux : replié il montre les participants,
 * ouvert au survol il déroule le tchat de la session.
 */
export default function ChatRail({ self, peers, messages, unread, onSend, onOpen, onTyping }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)

  const people = [{ ...self, me: true }, ...peers]
  // Replié, la barre fait exactement la hauteur des pastilles : elles restent centrées.
  const height = open
    ? Math.min(OPEN_HEIGHT, window.innerHeight - 48)
    : people.length * SLOT + GAP * (people.length - 1) + PADDING

  useEffect(() => {
    if (open) {
      onOpen?.()
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
    }
  }, [open, messages, onOpen])

  const submit = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
    onTyping?.(false)
  }

  return (
    <aside
      className={`chat-rail ${open ? 'is-open' : ''}`}
      style={{ height }}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
    >
      <div className="chat-rail__inner">
        <p className="chat-rail__title">Session</p>

        <div className="chat-rail__people">
          {people.map((person) => (
            <div key={person.id ?? 'moi'} className="chat-rail__person">
              <span className="chat-rail__slot">
                <span className="chat-rail__avatar" style={{ background: person.color }}>
                  {initials(person.name)}
                </span>
              </span>
              <span className="chat-rail__name">
                {person.name}
                {person.me && <em> · vous</em>}
              </span>
            </div>
          ))}
        </div>

        {!open && unread > 0 && <span className="chat-rail__unread">{unread}</span>}

        <span className="chat-rail__sep" />

        <div className="chat-rail__list" ref={listRef}>
          {messages.length === 0 ? (
            <p className="chat-rail__empty">Personne n'a encore parlé.</p>
          ) : (
            messages.map((message) => (
              <p
                key={message.id}
                className={`chat-rail__msg ${message.system ? 'is-system' : ''} ${
                  !message.system && message.name === self.name ? 'is-me' : ''
                }`}
              >
                {!message.system && (
                  <span className="chat-rail__who" style={{ color: message.color }}>
                    {message.name}
                  </span>
                )}
                {message.text}
              </p>
            ))
          )}
        </div>

        <form className="chat-rail__form" onSubmit={submit}>
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              onTyping?.(event.target.value.length > 0)
            }}
            onBlur={() => onTyping?.(false)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Message…"
            maxLength={500}
          />
          <button type="submit" disabled={!draft.trim()}>
            ↑
          </button>
        </form>
      </div>
    </aside>
  )
}
