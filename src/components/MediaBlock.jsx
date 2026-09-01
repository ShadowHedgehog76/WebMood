import { useEffect, useMemo, useRef, useState } from 'react'
import { isLocalAsset, useAssetSource } from '../lib/assets.js'
import { formatDuration } from '../lib/files.js'
import './MediaBlock.css'

/**
 * Vidéo, son et PDF déposés sur le tableau.
 *
 * Un PDF ne s'affiche pas depuis une adresse `data:` — le navigateur la refuse dans un
 * cadre. On la reconvertit donc en objet local le temps de la vue, et on la libère en
 * partant : le document, lui, garde la version portable.
 */
export default function MediaBlock({ item, active }) {
  const media = useRef(null)
  const [failed, setFailed] = useState(false)

  const stored = useAssetSource(item)

  // Un PDF ne s'affiche pas depuis une adresse `data:` : on le repasse en objet local.
  const src = useMemo(() => {
    if (item.kind !== 'pdf' || !stored?.startsWith('data:')) return stored
    try {
      const [head, data] = stored.split(',')
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
      return URL.createObjectURL(new Blob([bytes], { type: head.slice(5).split(';')[0] }))
    } catch {
      return stored
    }
  }, [stored, item.kind])

  // Seule la conversion faite ici est à défaire : celle du stockage se libère toute seule.
  useEffect(() => {
    if (src !== stored && src?.startsWith('blob:')) return () => URL.revokeObjectURL(src)
    return undefined
  }, [src, stored])

  // Sortir de l'écran ne doit pas laisser une bande-son tourner toute seule.
  useEffect(() => {
    const node = media.current
    if (!node || item.kind === 'pdf') return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) node.pause?.()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [item.kind])

  if (failed) {
    return <div className="media media--failed">Média illisible</div>
  }
  if (!src) {
    return (
      <div className="media media--failed">
        {item.blobKey ? 'Média absent de cet appareil' : 'Média illisible'}
      </div>
    )
  }

  // Un gros média reste sur la machine où il a été déposé : le bloc le dit.
  const localOnly = isLocalAsset(item) && <span className="media__local">local</span>

  if (item.kind === 'pdf') {
    return (
      <div className="media media--pdf">
        <iframe
          src={src}
          title={item.name}
          style={{ pointerEvents: active ? 'auto' : 'none' }}
        />
        <span className="media__name">
          {item.name}
          {localOnly}
        </span>
      </div>
    )
  }

  if (item.kind === 'audio') {
    return (
      <div className="media media--audio">
        <span className="media__name">
          {item.name}
          {localOnly}
        </span>
        <audio
          ref={media}
          src={src}
          controls
          onError={() => setFailed(true)}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </div>
    )
  }

  const duration = formatDuration(item.duration)

  return (
    <div className="media media--video">
      <video
        ref={media}
        src={src}
        poster={item.poster}
        controls={active}
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        onPointerDown={(event) => active && event.stopPropagation()}
      />
      {!active && (
        <>
          <span className="media__hint">{item.name}</span>
          {duration && <span className="media__time">{duration}</span>}
          {localOnly}
          <span className="media__play" aria-hidden />
        </>
      )}
    </div>
  )
}
