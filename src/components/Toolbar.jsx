import { useEffect, useRef } from 'react'
import ContextBar from './ContextBar.jsx'
import { ALIGNMENTS } from '../lib/align.js'
import { ARROW_STYLES, LINK_STYLES } from '../lib/links.js'
import { COLOR_ROWS, NEUTRAL_ROW, QUICK_COLORS } from '../lib/palette.js'
import { CLOSED, SHAPES } from '../lib/shapes.js'
import { MASKS, isCropped } from '../lib/images.js'
import { DASHABLE, LINE_DASHES } from '../lib/dashes.js'
import { BRUSHES, DASHABLE_BRUSHES } from '../lib/brushes.js'
import { MINDMAP_LAYOUTS } from '../lib/mindmap.js'
import { SKETCH_MODES } from '../lib/sketch.js'
import {
  IconAlign,
  IconBrush,
  IconBucket,
  IconArc,
  IconArrow,
  IconArrowStyle,
  IconCircle,
  IconCode,
  IconCursor,
  IconDash,
  IconDiamond,
  IconEraser,
  IconFill,
  IconFrame,
  IconFreeform,
  IconGrid,
  IconGroup,
  IconHand,
  IconImage,
  IconLaser,
  IconLasso,
  IconCrop,
  IconSwatch,
  IconMask,
  IconLine,
  IconMagnet,
  IconMap,
  IconLink,
  IconLinkStyle,
  IconLock,
  IconMarkdown,
  IconMarker,
  IconMindmap,
  IconMinus,
  IconNote,
  IconOutline,
  IconRadial,
  IconRowPlus,
  IconTree,
  IconPen,
  IconPicker,
  IconPlus,
  IconPlay,
  IconRedo,
  IconStrokeEraser,
  IconSketch,
  IconSquare,
  IconStraighten,
  IconStrokeBrush,
  IconTable,
  IconText,
  IconTimer,
  IconTrash,
  IconTriangle,
  IconUndo,
  IconVote,
} from './Icons.jsx'

const LAYOUT_ICONS = {
  mindmap: IconMindmap,
  tree: IconTree,
  outline: IconOutline,
  radial: IconRadial,
}

const SHAPE_ICONS = {
  rect: IconSquare,
  ellipse: IconCircle,
  triangle: IconTriangle,
  diamond: IconDiamond,
  line: IconLine,
  arrow: IconArrow,
  free: IconFreeform,
  arc: IconArc,
}

/**
 * Barre d'outils flottante. Purement présentationnelle : tout l'état vit dans le tableau,
 * et la zone de style s'adapte à la sélection courante.
 */
export default function Toolbar({
  tool,
  setTool,
  shape,
  setShape,
  menu,
  setMenu,
  color,
  size,
  markerSize,
  eraserMode,
  selectMode,
  arrow,
  linkStyle,
  dash,
  brush,
  isArc,
  filled,
  textSizes,
  history,
  tipProps,
  selectedCount,
  selectedItem,
  frameCount,
  timerOpen,
  settings,
  onSetting,
  scale,
  styleReady,
  selectedTable,
  selectedMarkdown,
  selectedShape,
  selectedImage,
  canFill,
  selectedGroup,
  selectedText,
  selectedSketch,
  sketchMode,
  selectedNode,
  nodeLayout,
  showArrows,
  actions,
}) {
  const rowRef = useRef(null)

  // La rangée du bas se replie sur plusieurs lignes quand l'écran rétrécit. Sa hauteur
  // est publiée en variable CSS : la barre de réglages et la minimap se placent dessus
  // au lieu de deviner une valeur fixe.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return undefined
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty('--row-h', `${Math.round(entry.contentRect.height)}px`)
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  const ShapeGlyph = SHAPE_ICONS[shape]
  const toggleMenu = (name) => setMenu((open) => (open === name ? null : name))

  const colorButton = (
    <div className="menu">
      <button
        className={`colorbtn ${menu === 'color' ? 'is-active' : ''}`}
        style={{ '--swatch': color }}
        onClick={() => toggleMenu('color')}
        {...tipProps('Couleur')}
      />
      {menu === 'color' && (
        <div className="menu__panel menu__panel--palette">
          <div className="palette__quick">
            {QUICK_COLORS.map((value) => (
              <button
                key={value}
                style={{ '--swatch': value }}
                onClick={() => actions.pickColor(value)}
              />
            ))}
            <label className="palette__custom" style={{ '--swatch': color }}>
              <input
                type="color"
                value={color}
                onChange={(event) => actions.pickColor(event.target.value)}
              />
            </label>
          </div>
          {[...COLOR_ROWS, NEUTRAL_ROW].map((row, index) => (
            <div key={index} className="palette__row">
              {row.map((value) => (
                <button
                  key={value}
                  className={color === value ? 'is-active' : ''}
                  style={{ '--swatch': value }}
                  onClick={() => actions.pickColor(value)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const sizes = (values, active, onPick, unit, range) => {
    const buttons = values.map((value) => (
      <button
        key={value}
        className={`size ${active === value ? 'is-active' : ''}`}
        onClick={() => onPick(value)}
        {...tipProps(`${unit} ${value} px`)}
      >
        <span style={{ width: Math.min(20, value) + 2, height: Math.min(20, value) + 2 }} />
      </button>
    ))

    if (!range) return buttons

    // Cinquième choix : une épaisseur libre, réglée au curseur.
    const [min, max] = range
    return [
      ...buttons,
      <div className="menu" key="custom">
        <button
          className={`size size--custom ${values.includes(active) ? '' : 'is-active'}`}
          onClick={() => toggleMenu('size')}
          {...tipProps(`${unit} libre`)}
        >
          {active}
        </button>
        {menu === 'size' && (
          <div className="menu__panel menu__panel--size">
            <input
              type="range"
              min={min}
              max={max}
              value={Math.min(max, Math.max(min, active))}
              onChange={(event) => onPick(Number(event.target.value))}
            />
            <span>{active} px</span>
          </div>
        )}
      </div>,
    ]
  }

  /** Choix du type de trait. Le trait double n'a pas de sens pour un tracé au crayon. */
  const dashes = (styles = LINE_DASHES) =>
    styles.map((style) => (
      <button
        key={style.key}
        className={`chip chip--icon ${dash === style.key ? 'is-active' : ''}`}
        onClick={() => actions.pickDash(style.key)}
        {...tipProps(style.label)}
      >
        <IconDash size={17} dash={style.key} />
      </button>
    ))

  const separator = <span className="context-bar__sep" />

  // Réglages du moment : ils dépendent de la sélection, ou à défaut de l'outil actif.
  const contextual = (() => {
    if (selectedCount > 1) {
      return [
        styleReady ? (
          <button
            key="style"
            className="chip chip--icon"
            onClick={actions.pasteStyle}
            {...tipProps('Appliquer le style copié')}
          >
            <IconBrush size={17} paste />
          </button>
        ) : null,
        ...ALIGNMENTS.map((option) => (
        <button
          key={option.key}
          className="chip chip--icon"
          onClick={() => actions.applyAlign(option.key)}
          {...tipProps(option.label)}
        >
          <IconAlign mode={option.key} size={17} />
        </button>
        )),
      ].filter(Boolean)
    }

    if (showArrows) {
      return (
        <>
          {colorButton}
          {separator}
          {ARROW_STYLES.map((style) => (
            <button
              key={style.key}
              className={`chip chip--icon ${arrow === style.key ? 'is-active' : ''}`}
              onClick={() => actions.pickArrow(style.key)}
              {...tipProps(style.title)}
            >
              <IconArrowStyle
                size={18}
                start={style.key === 'start' || style.key === 'both'}
                end={style.key === 'end' || style.key === 'both'}
              />
            </button>
          ))}
          {separator}
          {dashes()}
          {/* Un arc suit ses propres poignées : le choix du tracé ne le concerne pas. */}
          {!isArc && separator}
          {!isArc &&
            LINK_STYLES.map((style) => (
              <button
                key={style.key}
                className={`chip chip--icon ${linkStyle === style.key ? 'is-active' : ''}`}
                onClick={() => actions.pickLinkStyle(style.key)}
                {...tipProps(style.title)}
              >
                <IconLinkStyle size={18} style={style.key} />
              </button>
            ))}
        </>
      )
    }

    if (selectedGroup) {
      return (
        <>
          {colorButton}
          {separator}
          <button
            className={`chip ${selectedGroup.autoSort ? 'is-active' : ''}`}
            onClick={() => actions.toggleAutoSort(selectedGroup.id)}
            {...tipProps('Range les blocs du groupe automatiquement')}
          >
            tri auto
          </button>
          <button
            className="chip"
            onClick={() => actions.sortGroupNow(selectedGroup.id)}
            {...tipProps('Ranger maintenant')}
          >
            Ranger
          </button>
        </>
      )
    }

    if (selectedNode) {
      return (
        <>
          {colorButton}
          {separator}
          {MINDMAP_LAYOUTS.map((option) => {
            const Glyph = LAYOUT_ICONS[option.key]
            return (
              <button
                key={option.key}
                className={`chip chip--icon ${nodeLayout === option.key ? 'is-active' : ''}`}
                onClick={() => actions.setNodeLayout(option.key)}
                {...tipProps(option.label)}
              >
                <Glyph size={17} />
              </button>
            )
          })}
        </>
      )
    }

    if (selectedSketch) {
      return Object.entries(SKETCH_MODES).map(([key, meta]) => (
        <button
          key={key}
          className={`chip ${sketchMode === key ? 'is-active' : ''}`}
          onClick={() => actions.setSketchMode(key)}
          {...tipProps(`Rendu ${meta.hint}`)}
        >
          {meta.label}
        </button>
      ))
    }

    // Le bloc markdown n'a qu'un réglage : la teinte de son liseré et de ses liens.
    if (selectedMarkdown) return colorButton

    if (selectedTable) {
      return (
        <>
          {colorButton}
          {separator}
          <button
            className="chip chip--icon"
            onClick={() => actions.resizeTable('row', 1)}
            {...tipProps('Ajouter une ligne')}
          >
            <IconRowPlus size={17} />
          </button>
          <button
            className="chip chip--icon"
            onClick={() => actions.resizeTable('row', -1)}
            {...tipProps('Retirer une ligne')}
          >
            <IconRowPlus size={17} minus />
          </button>
          <button
            className="chip chip--icon"
            onClick={() => actions.resizeTable('column', 1)}
            {...tipProps('Ajouter une colonne')}
          >
            <IconRowPlus size={17} column />
          </button>
          <button
            className="chip chip--icon"
            onClick={() => actions.resizeTable('column', -1)}
            {...tipProps('Retirer une colonne')}
          >
            <IconRowPlus size={17} column minus />
          </button>
        </>
      )
    }

    if (selectedImage) {
      return (
        <>
          <button
            className={`chip chip--icon ${isCropped(selectedImage) ? 'is-active' : ''}`}
            onClick={() => actions.startCrop(selectedImage.id)}
            {...tipProps('Recadrer l’image (ou double-clic dessus)')}
          >
            <IconCrop size={17} />
          </button>
          <button
            className="chip chip--icon"
            onClick={() => actions.extractPalette(selectedImage.id)}
            {...tipProps('Extraire les couleurs dominantes')}
          >
            <IconSwatch size={17} />
          </button>
          {separator}
          {MASKS.map((mask) => (
            <button
              key={mask.key}
              className={`chip chip--icon ${(selectedImage.mask ?? 'none') === mask.key ? 'is-active' : ''}`}
              onClick={() => actions.setMask(mask.key)}
              {...tipProps(mask.label)}
            >
              <IconMask size={17} kind={mask.key} />
            </button>
          ))}
        </>
      )
    }

    if (selectedText) {
      return (
        <>
          {colorButton}
          {separator}
          <button
            className={`chip chip--icon ${selectedText.variant === 'note' ? 'is-active' : ''}`}
            onClick={actions.toggleTextVariant}
            {...tipProps('Note ou texte simple')}
          >
            <IconNote size={17} />
          </button>
          {sizes(textSizes, selectedText.size ?? 16, actions.pickTextSize, 'Texte', [10, 96])}
        </>
      )
    }

    if (tool === 'shape' || selectedShape) {
      const kind = selectedShape?.kind ?? shape
      return (
        <>
          {colorButton}
          {separator}
          {SHAPES.map((option) => {
            const Glyph = SHAPE_ICONS[option.key]
            return (
              <button
                key={option.key}
                className={`chip chip--icon ${kind === option.key ? 'is-active' : ''}`}
                onClick={() => actions.pickShape(option.key)}
                {...tipProps(option.label)}
              >
                <Glyph size={17} />
              </button>
            )
          })}
          {separator}
          {selectedShape?.kind === 'free' && (
            <button
              className="chip chip--icon"
              onClick={actions.straightenShape}
              {...tipProps('Redresser le tracé')}
            >
              <IconStraighten size={17} />
            </button>
          )}
          {(selectedShape ? canFill : CLOSED.has(kind)) && (
            <button
              className={`chip chip--icon ${(selectedShape ? selectedShape.filled : filled) ? 'is-active' : ''}`}
              onClick={actions.toggleFill}
              {...tipProps('Remplir la forme')}
            >
              <IconFill size={17} />
            </button>
          )}
          {sizes(
            [2, 5, 10, 20],
            selectedShape?.strokeWidth ?? size,
            actions.pickSize,
            'Épaisseur',
            [1, 60],
          )}
          {separator}
          {dashes()}
        </>
      )
    }

    // La gommette prend la couleur choisie — ou celle de la personne, en session.
    if (tool === 'vote' || tool === 'bucket') return colorButton

    if (tool === 'marker') {
      return (
        <>
          {colorButton}
          {separator}
          {sizes([10, 20, 32, 48], markerSize, actions.pickMarkerSize, 'Surligneur', [6, 90])}
        </>
      )
    }

    // Rien de sélectionné, outil sélection : on choisit la façon d'attraper.
    if (tool === 'select' && !selectedCount) {
      return (
        <>
          <button
            className={`chip chip--icon ${selectMode === 'band' ? 'is-active' : ''}`}
            onClick={() => actions.setSelectMode('band')}
            {...tipProps('Sélection au rectangle')}
          >
            <IconCursor size={17} />
          </button>
          <button
            className={`chip chip--icon ${selectMode === 'lasso' ? 'is-active' : ''}`}
            onClick={() => actions.setSelectMode('lasso')}
            {...tipProps('Sélection au lasso : entourez ce que vous voulez prendre')}
          >
            <IconLasso size={17} />
          </button>
        </>
      )
    }

    if (tool === 'eraser') {
      return (
        <>
          <button
            className={`chip chip--icon ${eraserMode === 'pixel' ? 'is-active' : ''}`}
            onClick={() => actions.setEraserMode('pixel')}
            {...tipProps('Gomme classique')}
          >
            <IconEraser size={17} />
          </button>
          <button
            className={`chip chip--icon ${eraserMode === 'stroke' ? 'is-active' : ''}`}
            onClick={() => actions.setEraserMode('stroke')}
            {...tipProps('Effacer le trait entier')}
          >
            <IconStrokeEraser size={17} />
          </button>
          {separator}
          {sizes([2, 5, 10, 20], size, actions.pickSize, 'Épaisseur', [1, 60])}
        </>
      )
    }

    if (tool === 'pen') {
      return (
        <>
          {colorButton}
          {separator}
          {BRUSHES.map((option) => (
            <button
              key={option.key}
              className={`chip chip--icon ${brush === option.key ? 'is-active' : ''}`}
              onClick={() => actions.pickBrush(option.key)}
              {...tipProps(`${option.label} : ${option.hint}`)}
            >
              <IconStrokeBrush size={17} kind={option.key} />
            </button>
          ))}
          {separator}
          {sizes([2, 5, 10, 20], size, actions.pickSize, 'Épaisseur', [1, 60])}
          {/* Les motifs ne valent que pour le stylo : ailleurs, chaque segment les
              redémarrerait et le trait ressemblerait à des miettes. */}
          {DASHABLE_BRUSHES.has(brush) && separator}
          {DASHABLE_BRUSHES.has(brush) && dashes(DASHABLE)}
        </>
      )
    }

    return null
  })()

  // Le verrou vaut pour n'importe quel bloc : il ouvre la barre, et quand il est mis
  // il reste seul — un bloc verrouillé n'a plus de réglage à offrir.
  const styleBrush = (
    <>
      <button
        className="chip chip--icon"
        onClick={actions.copyStyle}
        {...tipProps('Copier le style')}
      >
        <IconBrush size={17} />
      </button>
      {styleReady && (
        <button
          className="chip chip--icon"
          onClick={actions.pasteStyle}
          {...tipProps('Appliquer le style copié')}
        >
          <IconBrush size={17} paste />
        </button>
      )}
    </>
  )

  const lock = selectedItem ? (
    <>
      {!selectedItem.locked && styleBrush}
      <button
        className={`chip chip--icon ${selectedItem.locked ? 'is-active' : ''}`}
        onClick={actions.toggleLock}
        {...tipProps(selectedItem.locked ? 'Déverrouiller' : 'Verrouiller le bloc')}
      >
        <IconLock size={17} open={!selectedItem.locked} />
      </button>
      {!selectedItem.locked && contextual && separator}
    </>
  ) : null

  const bar = selectedItem?.locked ? lock : (lock || contextual) && (
    <>
      {lock}
      {contextual}
    </>
  )

  return (
    <>
      <ContextBar visible={Boolean(bar)}>{bar}</ContextBar>

      <div className="toolbar-row" ref={rowRef}>
      <div className="toolbar">
      <div className="toolbar__group">
        <button
          className={`tool ${tool === 'select' ? 'is-active' : ''}`}
          onClick={() => setTool('select')}
          {...tipProps('Sélection', 'V')}
        >
          <IconCursor />
        </button>
        <button
          className={`tool ${tool === 'pen' ? 'is-active' : ''}`}
          onClick={() => setTool('pen')}
          {...tipProps('Crayon', 'P')}
        >
          <IconPen />
        </button>
        <button
          className={`tool ${tool === 'marker' ? 'is-active' : ''}`}
          onClick={() => setTool('marker')}
          {...tipProps('Surligneur', 'M')}
        >
          <IconMarker />
        </button>
        <button
          className={`tool ${tool === 'eraser' ? 'is-active' : ''}`}
          onClick={() => setTool('eraser')}
          {...tipProps('Gomme', 'E')}
        >
          <IconEraser />
        </button>
        <button
          className={`tool ${tool === 'picker' ? 'is-active' : ''}`}
          onClick={() => setTool('picker')}
          {...tipProps('Pipette : reprendre une couleur', 'I')}
        >
          <IconPicker />
        </button>

        <button
          className={`tool ${tool === 'shape' ? 'is-active' : ''}`}
          onClick={() => setTool('shape')}
          {...tipProps(`Forme : ${SHAPES.find((option) => option.key === shape).label.toLowerCase()}`, 'S')}
        >
          <ShapeGlyph />
        </button>

        <button
          className={`tool ${tool === 'bucket' ? 'is-active' : ''}`}
          onClick={() => setTool('bucket')}
          {...tipProps('Seau : remplir une forme', 'B')}
        >
          <IconBucket />
        </button>
        <button
          className={`tool ${tool === 'laser' ? 'is-active' : ''}`}
          onClick={() => setTool('laser')}
          {...tipProps('Pointeur laser : montrer sans laisser de trace')}
        >
          <IconLaser />
        </button>
        <button
          className={`tool ${tool === 'vote' ? 'is-active' : ''}`}
          onClick={() => setTool('vote')}
          {...tipProps('Gommette de vote')}
        >
          <IconVote />
        </button>
        <button
          className={`tool ${tool === 'link' ? 'is-active' : ''}`}
          onClick={() => setTool('link')}
          {...tipProps('Connexion : un bloc, puis l’autre', 'L')}
        >
          <IconLink />
        </button>
        <button
          className={`tool ${tool === 'group' ? 'is-active' : ''}`}
          onClick={() => setTool('group')}
          {...tipProps('Zone de groupe', 'G')}
        >
          <IconGroup />
        </button>
        <button
          className={`tool ${tool === 'frame' ? 'is-active' : ''}`}
          onClick={() => setTool('frame')}
          {...tipProps('Cadre : une scène de la présentation', 'F')}
        >
          <IconFrame />
        </button>
        <button
          className={`tool ${tool === 'hand' ? 'is-active' : ''}`}
          onClick={() => setTool('hand')}
          {...tipProps('Main', 'H')}
        >
          <IconHand />
        </button>
      </div>

      <span className="toolbar__sep" />

      <div className="toolbar__group">
        <button className="tool" onClick={actions.openFiles} {...tipProps('Image ou fichier')}>
          <IconImage />
        </button>
        <button className="tool" onClick={() => actions.addText('note')} {...tipProps('Note', 'T')}>
          <IconNote />
        </button>
        <button className="tool" onClick={() => actions.addText('plain')} {...tipProps('Texte simple')}>
          <IconText />
        </button>
        <button className="tool" onClick={actions.addCodeBlock} {...tipProps('Bloc de code')}>
          <IconCode />
        </button>
        <button className="tool" onClick={actions.addTable} {...tipProps('Tableau')}>
          <IconTable />
        </button>
        <button className="tool" onClick={actions.addMarkdown} {...tipProps('Bloc markdown')}>
          <IconMarkdown />
        </button>
        <button className="tool" onClick={actions.addMap} {...tipProps('Carte')}>
          <IconMap />
        </button>
        <button
          className="tool"
          onClick={() => actions.addMindmap('mindmap')}
          {...tipProps('Carte mentale')}
        >
          <IconMindmap />
        </button>
        <button
          className="tool"
          onClick={() => actions.addSketch('canvas2d')}
          {...tipProps('Bloc visuel : le code fait la vue')}
        >
          <IconSketch />
        </button>
      </div>

      <span className="toolbar__sep" />

      <div className="toolbar__group">
        <button
          className={`tool ${timerOpen ? 'is-active' : ''}`}
          onClick={actions.toggleTimer}
          {...tipProps('Minuteur partagé')}
        >
          <IconTimer />
        </button>
      </div>

      {/* Le bouton n'apparaît qu'une fois qu'il y a une scène à montrer. */}
      {frameCount > 0 && (
        <>
          <span className="toolbar__sep" />
          <div className="toolbar__group">
            <button
              className="tool"
              onClick={actions.present}
              {...tipProps(`Présenter (${frameCount} scène${frameCount > 1 ? 's' : ''})`)}
            >
              <IconPlay />
            </button>
          </div>
        </>
      )}

      <span className="toolbar__sep" />

      <div className="toolbar__group">
        <button
          className="tool"
          onClick={actions.undo}
          disabled={!history.past}
          {...tipProps('Annuler', '⌘Z')}
        >
          <IconUndo />
        </button>
        <button
          className="tool"
          onClick={actions.redo}
          disabled={!history.future}
          {...tipProps('Rétablir', '⇧⌘Z')}
        >
          <IconRedo />
        </button>
        <button className="tool tool--danger" onClick={actions.clear} {...tipProps('Tout effacer')}>
          <IconTrash />
        </button>
      </div>
      </div>

      {/* Réglages rapides et zoom : posés à droite de la barre, sans déplacer celle-ci. */}
      <div className="toolbar-aside">
      <div className="quickset">
        <button
          className={`tool ${settings.snap ? 'is-active' : ''}`}
          onClick={() => onSetting('snap', !settings.snap)}
          {...tipProps(settings.snap ? 'Aimantation active' : 'Aimantation coupée')}
        >
          <IconMagnet />
        </button>
        <button
          className={`tool ${settings.grid ? 'is-active' : ''}`}
          onClick={() => onSetting('grid', !settings.grid)}
          {...tipProps(settings.grid ? 'Grille visible' : 'Grille masquée')}
        >
          <IconGrid />
        </button>
      </div>

      {/* Le zoom rejoint la rangée : dans son coin, il finissait sous la barre
          dès que celle-ci se repliait. */}
      <div className="zoom">
        <button onClick={actions.zoomOut} {...tipProps('Dézoomer')}>
          <IconMinus size={16} />
        </button>
        <button className="zoom__label" onClick={actions.resetView} {...tipProps('Réinitialiser la vue')}>
          {Math.round(scale * 100)}%
        </button>
        <button onClick={actions.zoomIn} {...tipProps('Zoomer')}>
          <IconPlus size={16} />
        </button>
      </div>
      </div>
      </div>
    </>
  )
}
