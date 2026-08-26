import { useEffect, useRef, useState } from 'react'
import './ChatPanel.css'

/** Tchat de session, ancré à droite pendant la collaboration. */
export default function ChatPanel({ open, setOpen, messages, unread, onSend, selfName }) {
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, open])

  const submit = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  return (
    <>
      {!open && (
        <button className="chat__tab" onClick={() => setOpen(true)}>
          Tchat
          {unread > 0 && <span className="chat__badge">{unread}</span>}
        </button>
      )}

      <aside className={`chat ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <header className="chat__head">
          <span>Tchat de session</span>
          <button onClick={() => setOpen(false)} aria-label="Replier">
            ✕
          </button>
        </header>

        <div className="chat__list" ref={listRef}>
          {messages.length === 0 && <p className="chat__empty">Personne n'a encore parlé.</p>}
          {messages.map((message) => (
            <p key={message.id} className={`chat__msg ${message.name === selfName ? 'is-me' : ''}`}>
              <span className="chat__who" style={{ color: message.color }}>
                {message.name}
              </span>
              {message.text}
            </p>
          ))}
        </div>

        <form className="chat__form" onSubmit={submit}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Écrire un message…"
            maxLength={500}
          />
          <button type="submit" disabled={!draft.trim()}>
            Envoyer
          </button>
        </form>
      </aside>
    </>
  )
}
