import './Settings.css'

/** Un interrupteur, avec son explication : on doit savoir ce qu'on coupe. */
function Switch({ label, hint, on, onChange }) {
  return (
    <label className="settings__row">
      <span className="settings__text">
        <span className="settings__label">{label}</span>
        <span className="settings__hint">{hint}</span>
      </span>
      <input type="checkbox" checked={on} onChange={(event) => onChange(event.target.checked)} />
      <span className="settings__switch" aria-hidden="true" />
    </label>
  )
}

/** Réglages du tableau. */
export default function Settings({ open, settings, onChange, onClose }) {
  if (!open) return null

  return (
    <div className="settings" onPointerDown={onClose}>
      <div className="settings__panel" onPointerDown={(event) => event.stopPropagation()}>
        <div className="settings__head">
          <h2>Réglages</h2>
          <button className="settings__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="settings__body">
          <Switch
            label="Aimantation"
            hint="Un bloc déplacé s'aligne sur les bords et les centres des autres."
            on={settings.snap}
            onChange={(value) => onChange('snap', value)}
          />
          <Switch
            label="Grille"
            hint="Les pointillés du fond. Le tableau reste infini sans eux."
            on={settings.grid}
            onChange={(value) => onChange('grid', value)}
          />
        </div>
      </div>
    </div>
  )
}
