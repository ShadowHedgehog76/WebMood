import { useState } from 'react'
import './AccountDialog.css'

/**
 * Compte : connexion par mot de passe ou par lien reçu en courriel, et création de compte.
 * Une fois connecté, les tableaux suivent d'un appareil à l'autre.
 */
export default function AccountDialog({
  open,
  user,
  onClose,
  onSignIn,
  onSignUp,
  onLink,
  onSignOut,
  onPushAll,
  onPullAll,
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  if (!open) return null

  const run = async (action, message) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await action()
      if (message) setNotice(typeof message === 'function' ? message(result) : message)
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account" onPointerDown={onClose}>
      <div className="account__panel" onPointerDown={(event) => event.stopPropagation()}>
        <button className="account__close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>

        {user ? (
          <>
            <h2>Votre compte</h2>
            <p className="account__hint">
              Connecté en tant que <strong>{user.email}</strong>. Vos tableaux sont enregistrés en
              ligne et vous les retrouvez depuis n'importe quel appareil.
            </p>
            <p className="account__hint">
              L'aller-retour est automatique, mais on peut le forcer dans un sens ou dans
              l'autre — pratique après un long moment hors ligne, ou sur une machine qui
              découvre le compte.
            </p>

            <div className="account__stack">
              <button
                className="account__btn account__btn--wide"
                disabled={busy}
                onClick={() =>
                  run(onPushAll, (count) =>
                    count
                      ? `${count} tableau${count > 1 ? 'x' : ''} envoyé${count > 1 ? 's' : ''} en ligne.`
                      : 'Aucun tableau à envoyer.',
                  )
                }
              >
                <span>Envoyer mes tableaux en ligne</span>
                <small>Ce qui est sur cet ordinateur écrase la base.</small>
              </button>

              <button
                className="account__btn account__btn--wide"
                disabled={busy}
                onClick={() =>
                  run(onPullAll, (count) =>
                    count
                      ? `${count} tableau${count > 1 ? 'x' : ''} récupéré${count > 1 ? 's' : ''}.`
                      : 'Aucun tableau en ligne.',
                  )
                }
              >
                <span>Récupérer les tableaux du compte</span>
                <small>Ce qui est en ligne écrase les copies locales.</small>
              </button>
            </div>

            <hr className="account__sep" />

            <div className="account__row">
              <span />
              <button className="account__btn" onClick={() => run(onSignOut)} disabled={busy}>
                Se déconnecter
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Se connecter</h2>
            <p className="account__hint">
              Un compte garde vos tableaux en ligne et permet de les partager par lien. Sans
              compte, tout continue de fonctionner : le tableau reste simplement dans ce
              navigateur.
            </p>

            <label className="account__field">
              <span>Adresse électronique</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </label>

            <label className="account__field">
              <span>Mot de passe</span>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter' && email && password) {
                    run(() => onSignIn(email, password))
                  }
                }}
              />
            </label>

            <div className="account__row">
              <button
                className="account__btn"
                disabled={busy || !email || password.length < 6}
                onClick={() =>
                  run(() => onSignUp(email, password), (result) =>
                    result?.confirmed
                      ? 'Compte créé, vous êtes connecté.'
                      : 'Compte créé : confirmez votre adresse avec le courriel reçu.',
                  )
                }
              >
                Créer un compte
              </button>
              <button
                className="account__btn account__btn--main"
                disabled={busy || !email || !password}
                onClick={() => run(() => onSignIn(email, password))}
              >
                Se connecter
              </button>
            </div>

            <hr className="account__sep" />

            <div className="account__row">
              <span className="account__hint">Pas envie de mot de passe ?</span>
              <button
                className="account__btn"
                disabled={busy || !email}
                onClick={() =>
                  run(() => onLink(email), 'Lien de connexion envoyé : ouvrez vos courriels.')
                }
              >
                Recevoir un lien
              </button>
            </div>
          </>
        )}

        {error && <p className="account__error">{error}</p>}
        {notice && <p className="account__notice">{notice}</p>}
      </div>
    </div>
  )
}
