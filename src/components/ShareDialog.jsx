import { useEffect, useState } from 'react'
import { codeSize, encodeBoard } from '../lib/share.js'
import { IconCheck, IconCopy } from './Icons.jsx'
import './ShareDialog.css'

/**
 * Partage d'un tableau : un code qui contient tout (hors ligne), ou une session
 * pair-à-pair pour travailler à plusieurs et voir les curseurs.
 */
export default function ShareDialog({
  open,
  onClose,
  doc,
  boardName,
  session,
  peers,
  name,
  setName,
  status,
  error,
  onImportCode,
  onHost,
  onJoin,
  onLeave,
}) {
  const [tab, setTab] = useState('code')
  const [code, setCode] = useState('')
  const [received, setReceived] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (!open) return
    let alive = true
    encodeBoard(doc, boardName)
      .then((value) => alive && setCode(value))
      .catch(() => alive && setCode(''))
    return () => {
      alive = false
    }
  }, [open, doc, boardName])

  useEffect(() => {
    if (session) setTab('live')
  }, [session])

  if (!open) return null

  const copy = (value, which) => {
    navigator.clipboard?.writeText(value)
    setCopied(which)
    setTimeout(() => setCopied(''), 1600)
  }

  return (
    <div className="share" onPointerDown={onClose}>
      <div className="share__panel" onPointerDown={(event) => event.stopPropagation()}>
        <div className="share__tabs">
          <button className={tab === 'code' ? 'is-active' : ''} onClick={() => setTab('code')}>
            Code de partage
          </button>
          <button className={tab === 'live' ? 'is-active' : ''} onClick={() => setTab('live')}>
            Collaboration
          </button>
          <button className="share__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        {tab === 'code' ? (
          <div className="share__body">
            <p className="share__hint">
              Ce code contient <strong>tout le tableau</strong>. Copiez-le, transmettez-le comme
              vous voulez : la personne qui le colle obtient une copie indépendante.
            </p>
            <textarea className="share__code" readOnly value={code} rows={4} />
            <div className="share__row">
              <span className="share__size">{code ? codeSize(code) : 'préparation…'}</span>
              <button className="share__btn" disabled={!code} onClick={() => copy(code, 'code')}>
                {copied === 'code' ? <IconCheck size={15} /> : <IconCopy size={15} />}
                {copied === 'code' ? 'Copié' : 'Copier le code'}
              </button>
            </div>

            <hr className="share__sep" />

            <p className="share__hint">Vous avez reçu un code ?</p>
            <textarea
              className="share__code"
              rows={3}
              placeholder="Collez le code ici…"
              value={received}
              onChange={(event) => setReceived(event.target.value)}
            />
            <div className="share__row">
              <span />
              <button
                className="share__btn share__btn--primary"
                disabled={!received.trim()}
                onClick={() => onImportCode(received.trim())}
              >
                Ouvrir ce tableau
              </button>
            </div>
          </div>
        ) : (
          <div className="share__body">
            <label className="share__field">
              <span>Votre nom</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} />
            </label>

            {session ? (
              <>
                <p className="share__hint">
                  Session ouverte. Partagez ce code : chaque personne qui le saisit rejoint le
                  tableau et son curseur apparaît en direct.
                </p>
                <div className="share__row">
                  <code className="share__pin">{session.code}</code>
                  <button className="share__btn" onClick={() => copy(session.code, 'pin')}>
                    {copied === 'pin' ? <IconCheck size={15} /> : <IconCopy size={15} />}
                    {copied === 'pin' ? 'Copié' : 'Copier'}
                  </button>
                </div>

                <ul className="share__peers">
                  <li>
                    <span className="share__dot" style={{ background: session.self.color }} />
                    {name || 'Vous'} <em>{session.isHost ? '· hôte' : '· vous'}</em>
                  </li>
                  {peers.map((peer) => (
                    <li key={peer.id}>
                      <span className="share__dot" style={{ background: peer.color }} />
                      {peer.name}
                    </li>
                  ))}
                </ul>

                <div className="share__row">
                  <span />
                  <button className="share__btn share__btn--danger" onClick={onLeave}>
                    Quitter la session
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="share__hint">
                  Une session met les navigateurs en relation directe. Le tableau de l'hôte est
                  envoyé aux arrivants, puis chaque modification et chaque curseur circulent en
                  direct.
                </p>
                <div className="share__row">
                  <span />
                  <button
                    className="share__btn share__btn--primary"
                    disabled={status === 'connecting'}
                    onClick={onHost}
                  >
                    {status === 'connecting' ? 'Connexion…' : 'Ouvrir une session'}
                  </button>
                </div>

                <hr className="share__sep" />

                <label className="share__field">
                  <span>Rejoindre avec un code</span>
                  <input
                    value={joinCode}
                    placeholder="par ex. k7x2mq"
                    onChange={(event) => setJoinCode(event.target.value.trim().toLowerCase())}
                  />
                </label>
                <div className="share__row">
                  <span />
                  <button
                    className="share__btn"
                    disabled={!joinCode || status === 'connecting'}
                    onClick={() => onJoin(joinCode)}
                  >
                    Rejoindre
                  </button>
                </div>
              </>
            )}

            {error && <p className="share__error">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
