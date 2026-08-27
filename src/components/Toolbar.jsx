import ContextBar from './ContextBar.jsx'
import { ALIGNMENTS } from '../lib/align.js'
import { ARROW_STYLES } from '../lib/links.js'
import { COLOR_ROWS, NEUTRAL_ROW, QUICK_COLORS } from '../lib/palette.js'
import { CLOSED, SHAPES } from '../lib/shapes.js'
import { MINDMAP_LAYOUTS } from '../lib/mindmap.js'
import { SKETCH_MODES } from '../lib/sketch.js'
import {
  IconAlign,
  IconArrow,
  IconArrowStyle,
  IconCircle,
  IconCode,
  IconCursor,
  IconDiamond,
  IconEraser,
  IconFill,
  IconGroup,
  IconHand,
  IconImage,
  IconLine,
  IconLink,
  IconMindmap,
  IconNote,
  IconOutline,
  IconRadial,
  IconTree,
  IconPen,
  IconRedo,
  IconSketch,
  IconSquare,
  IconText,
  IconTrash,
  IconTriangle,
  IconUndo,
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
  arrow,
  filled,
  textSizes,
  history,
  tipProps,
  selectedCount,
  selectedShape,
  selectedGroup,
  selectedText,
  selectedSketch,
  sketchMode,
  selectedNode,
  nodeLayout,
  showArrows,
  actions,
}) {
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

  const separator = <span className="context-bar__sep" />

  // Réglages du moment : ils dépendent de la sélection, ou à défaut de l'outil actif.
  const settings = (() => {
    if (selectedCount > 1) {
      return ALIGNMENTS.map((option) => (
        <button
          key={option.key}
          className="chip chip--icon"
          onClick={() => actions.applyAlign(option.key)}
          {...tipProps(option.label)}
        >
          <IconAlign mode={option.key} size={17} />
        </button>
      ))
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
          {CLOSED.has(kind) && (
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
        </>
      )
    }

    if (tool === 'pen' || tool === 'eraser') {
      return (
        <>
          {colorButton}
          {separator}
          {sizes([2, 5, 10, 20], size, actions.pickSize, 'Épaisseur', [1, 60])}
        </>
      )
    }

    return null
  })()

  return (
    <>
      <ContextBar visible={Boolean(settings)}>{settings}</ContextBar>

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
          className={`tool ${tool === 'eraser' ? 'is-active' : ''}`}
          onClick={() => setTool('eraser')}
          {...tipProps('Gomme', 'E')}
        >
          <IconEraser />
        </button>

        <button
          className={`tool ${tool === 'shape' ? 'is-active' : ''}`}
          onClick={() => setTool('shape')}
          {...tipProps(`Forme : ${SHAPES.find((option) => option.key === shape).label.toLowerCase()}`, 'S')}
        >
          <ShapeGlyph />
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
    </>
  )
}
