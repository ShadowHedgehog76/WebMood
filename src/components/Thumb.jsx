import './Thumb.css'

/**
 * Miniature dessinée depuis les rectangles normalisés d'un aperçu ([preview.js]).
 * Sert au rail des tableaux comme à la bibliothèque de modèles.
 */
export default function Thumb({ preview }) {
  return (
    <span className="thumb">
      <span className="thumb__inner" style={{ aspectRatio: preview?.ratio || 1 }}>
        {preview?.rects?.map((rect, index) => (
          <span
            key={index}
            className={`thumb__rect thumb__rect--${rect.t}`}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${Math.max(3, rect.w * 100)}%`,
              height: `${Math.max(3, rect.h * 100)}%`,
              background: rect.c ?? undefined,
            }}
          />
        ))}
      </span>
    </span>
  )
}
