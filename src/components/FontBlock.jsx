import { useEffect, useState } from 'react'
import { useAssetSource } from '../lib/assets.js'
import './FontBlock.css'

const SPECIMEN = 'Voix ambiguë d’un cœur qui, au zéphyr, préfère les jattes de kiwis'

/**
 * Spécimen de police : la fonte déposée est chargée dans le document, puis le bloc
 * l'écrit vraiment. Sur une planche de direction artistique, c'est la seule façon utile
 * de ranger une fonte — un nom de fichier ne dit rien de son dessin.
 */
export default function FontBlock({ item }) {
  const [ready, setReady] = useState(false)
  const family = `moodboard-${item.id}`
  const src = useAssetSource(item)

  useEffect(() => {
    if (!src) return undefined
    let face = null
    let cancelled = false

    // FontFace charge depuis l'adresse du document : rien à installer sur la machine.
    new FontFace(family, `url(${src})`)
      .load()
      .then((loaded) => {
        if (cancelled) return
        face = loaded
        document.fonts.add(loaded)
        setReady(true)
      })
      .catch(() => setReady(false))

    return () => {
      cancelled = true
      if (face) document.fonts.delete(face)
    }
  }, [family, src])

  return (
    <div className="font" style={ready ? { fontFamily: `"${family}", system-ui` } : undefined}>
      <span className="font__name">{item.name}</span>
      {ready ? (
        <>
          <span className="font__big">Aa Bb Cc</span>
          <span className="font__line">{SPECIMEN}</span>
          <span className="font__digits">0123456789 &amp; ? ! « » — €</span>
        </>
      ) : (
        <span className="font__failed">Police illisible par le navigateur.</span>
      )}
    </div>
  )
}
