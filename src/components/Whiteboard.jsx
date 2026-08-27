import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import BoardItem from './BoardItem.jsx'
import ShapeBlock from './ShapeBlock.jsx'
import Toolbar from './Toolbar.jsx'
import BoardRail from './BoardRail.jsx'
import Minimap from './Minimap.jsx'
import RemoteCursors from './RemoteCursors.jsx'
import ShareDialog from './ShareDialog.jsx'
import ChatRail from './ChatRail.jsx'
import QuickChat from './QuickChat.jsx'
import Pings from './Pings.jsx'
import ArcHandles from './ArcHandles.jsx'
import Tour, { STEPS } from './Tour.jsx'
import { decodeBoard } from '../lib/share.js'
import { makeCode, openSession } from '../lib/session.js'
import { createShakeDetector } from '../lib/shake.js'
import { caretPoint } from '../lib/caret.js'
import { snapPosition } from '../lib/snap.js'
import { IconMinus, IconPlus } from './Icons.jsx'
import Links from './Links.jsx'
import {
  codeItem,
  groupItem,
  imageItemFromShot,
  itemsFromFiles,
  newId,
  nodeItem,
  sketchItem,
  textItem,
} from '../lib/files.js'
import { autoLayout, groupFor } from '../lib/groups.js'
import { branches, childrenOf, layoutTree, progressOf, rootOf, subtree } from '../lib/mindmap.js'
import {
  CLOSED,
  DEFAULT_SHAPE_SIZE,
  DRAWN,
  freeShape,
  isTooSmall,
  normalizeRect,
  shapeItem,
} from '../lib/shapes.js'
import { alignItems } from '../lib/align.js'
import {
  arcEnds,
  controlsOf,
  defaultControls,
  mirrorControl,
  nearestAnchor,
  resolveEnd,
  snapReach,
} from '../lib/links.js'
import { GROUP_TINTS, QUICK_COLORS } from '../lib/palette.js'
import {
  deleteBoard,
  loadBoard,
  loadIndex,
  newBoardId,
  saveBoard,
  saveIndex,
} from '../lib/storage.js'
import { exportJson, exportPng, readJson } from '../lib/export.js'
import { SKETCH_MODES, SKETCH_TEMPLATES, parseMode, withMode } from '../lib/sketch.js'
import { makePreview } from '../lib/preview.js'
import './Whiteboard.css'

const SIZES = [2, 5, 10, 20]
const TEXT_SIZES = [14, 18, 24, 34]
const MIN_SCALE = 0.2
const MAX_SCALE = 5
const GRID_STEP = 40
const EMPTY_DOC = { strokes: [], items: [], links: [] }


/** Tuile d'un point de grille, régénérée seulement quand le pas ou le rayon change. */
function gridTileFor(cache, step, radius) {
  const key = `${step}:${radius}`
  if (cache.current.key === key) return cache.current.canvas

  const tile = document.createElement('canvas')
  tile.width = step
  tile.height = step
  const ctx = tile.getContext('2d')
  ctx.fillStyle = '#d7d7dd'
  ctx.beginPath()
  ctx.arc(step / 2, step / 2, radius, 0, Math.PI * 2)
  ctx.fill()

  cache.current = { key, canvas: tile }
  return tile
}

/** Replace tout l'arbre d'une carte mentale à partir de sa racine. */
function applyTreeLayout(items, rootId) {
  const nodes = items.filter((item) => item.type === 'node')
  const root = nodes.find((node) => node.id === rootId)
  if (!root) return items

  const byId = new Map(layoutTree(nodes, root).map((move) => [move.id, move]))
  if (!byId.size) return items
  return items.map((item) => {
    const move = byId.get(item.id)
    return move ? { ...item, x: move.x, y: move.y } : item
  })
}

/** Range les membres d'un groupe en grille et ajuste sa hauteur. */
function layoutGroup(items, group) {
  const members = group.members
    .map((memberId) => items.find((item) => item.id === memberId))
    .filter(Boolean)
  if (!members.length) return items

  const { moves, height } = autoLayout(group, members)
  const byId = new Map(moves.map((move) => [move.id, move]))
  return items.map((item) => {
    if (item.id === group.id) return { ...item, h: height }
    const move = byId.get(item.id)
    return move ? { ...item, x: move.x, y: move.y } : item
  })
}

/** Boîte englobante d'un trait, en coordonnées « monde ». */
function strokeBounds(stroke) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of stroke.points) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return { minX, minY, maxX, maxY }
}

export default function Whiteboard() {
  const containerRef = useRef(null)
  const gridRef = useRef(null)
  const drawRef = useRef(null)
  const fileInputRef = useRef(null)
  const itemsRef = useRef(null)
  const boardIdRef = useRef(null)
  const boardsRef = useRef([])
  const sessionRef = useRef(null)
  const fromRemote = useRef(false)
  const cursorTargets = useRef(new Map()) // id → position visée, lue par la boucle d'animation
  const remoteInk = useRef(new Map()) // traits des autres, en cours de tracé
  const lastLocalEdit = useRef(0)
  const tweenTimer = useRef(0)
  const gotRemoteDoc = useRef(false)
  const peerToolsRef = useRef(new Map())
  const pointerScreen = useRef({ x: 0, y: 0 })
  const typingSent = useRef(false)
  const bubbleTimers = useRef(new Map())
  const shakeDetector = useRef(createShakeDetector())
  const shakeSentAt = useRef(0)
  const shakeTimers = useRef(new Map())

  const [doc, setDoc] = useState(EMPTY_DOC)
  const [tool, setTool] = useState('select')
  const [color, setColor] = useState(QUICK_COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [arrow, setArrow] = useState('end')
  const [shape, setShape] = useState('rect')
  const [filled, setFilled] = useState(false)
  const [draft, setDraft] = useState(null) // forme en cours de tracé
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  // Sélection : plusieurs blocs à la fois, ou un fil.
  const [selection, setSelection] = useState({ items: [], link: null })
  const [band, setBand] = useState(null) // rectangle de sélection en cours
  const [guides, setGuides] = useState([]) // repères d'aimantation
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [editingId, setEditingId] = useState(null)
  const [pending, setPending] = useState(null) // connexion en cours : { fromId, point }
  const [menu, setMenu] = useState(null) // 'sketch' | 'color'
  const [nodeMenu, setNodeMenu] = useState(null) // menu du clic droit sur un nœud
  const [tip, setTip] = useState(null)
  const [boards, setBoards] = useState([])
  const [boardId, setBoardId] = useState(null)
  const [share, setShare] = useState(false)
  const [session, setSession] = useState(null)
  const [peers, setPeers] = useState([])
  const [chat, setChat] = useState([])
  const [unread, setUnread] = useState(0)
  const [peerTools, setPeerTools] = useState(new Map())
  const [notice, setNotice] = useState(null)
  const [typingPeers, setTypingPeers] = useState(new Set())
  const [bubbles, setBubbles] = useState(new Map())
  const [shaking, setShaking] = useState(new Set())
  const [pings, setPings] = useState([])
  const [tween, setTween] = useState(false) // les blocs glissent vers leur nouvelle place
  const [arcSnap, setArcSnap] = useState(null) // accroche visée en déplaçant une extrémité
  const [tourStep, setTourStep] = useState(null) // visite guidée : étape en cours
  const [quick, setQuick] = useState(null) // saisie rapide ouverte à la position du curseur
  const [liveStatus, setLiveStatus] = useState('idle')
  const [liveError, setLiveError] = useState(null)
  const [peerName, setPeerName] = useState(
    () => localStorage.getItem('moodboard:name') ?? 'Invité',
  )
  const [status, setStatus] = useState('loading')
  const [dropping, setDropping] = useState(false)

  // Refs miroir : les handlers de pointeur lisent la valeur courante sans se réabonner.
  const docRef = useRef(doc)
  const viewRef = useRef(view)
  const toolRef = useRef(tool)
  const colorRef = useRef(color)
  const sizeRef = useRef(size)
  const arrowRef = useRef(arrow)
  const shapeRef = useRef(shape)
  const filledRef = useRef(filled)
  const draftRef = useRef(null)
  const pendingRef = useRef(pending)
  const selectionRef = useRef(selection)
  const bandRef = useRef(null)
  docRef.current = doc
  viewRef.current = view
  toolRef.current = tool
  colorRef.current = color
  sizeRef.current = size
  arrowRef.current = arrow
  shapeRef.current = shape
  filledRef.current = filled
  pendingRef.current = pending
  selectionRef.current = selection

  const liveStroke = useRef(null)
  const pan = useRef(null)

  // Un seul traitement par image : souris et trackpads émettent plus vite que l'écran
  // ne rafraîchit, et chaque déplacement repeint le tableau.
  const frame = useRef(0)
  const nextMove = useRef(null)
  const spaceDown = useRef(false)
  const touches = useRef(new Map()) // doigts posés : id → position dans le tableau
  const gesture = useRef(null) // pincement / déplacement à deux doigts en cours
  const penDown = useRef(false) // un stylet écrit : les doigts ne comptent plus
  const ignored = useRef(new Set()) // doigts restants après un geste, à ne pas interpréter
  const [panning, setPanning] = useState(false)

  const clearSelection = useCallback(() => setSelection({ items: [], link: null }), [])

  /** Prendre un outil de tracé, c'est vouloir dessiner : on relâche la sélection. */
  const chooseTool = useCallback((next) => {
    setTool(next)
    setMenu(null)
    if (next === 'pen' || next === 'eraser' || next === 'shape') {
      setSelection({ items: [], link: null })
    }
  }, [])

  const selectItems = useCallback((ids, additive = false) => {
    setSelection((current) => {
      if (!additive) return { items: ids, link: null }
      const set = new Set(current.items)
      for (const id of ids) {
        if (set.has(id)) set.delete(id)
        else set.add(id)
      }
      return { items: [...set], link: null }
    })
  }, [])

  /* ---------- document + historique ---------- */

  const past = useRef([])
  const future = useRef([])
  const [history, setHistory] = useState({ past: 0, future: 0 })

  const write = useCallback((producer, recordHistory) => {
    if (recordHistory) {
      past.current.push(docRef.current)
      future.current = []
    }
    const next = producer(docRef.current)
    docRef.current = next
    setDoc(next)
    if (recordHistory) setHistory({ past: past.current.length, future: 0 })
  }, [])

  const commit = useCallback((producer) => write(producer, true), [write])

  /** Enrobe une remise en page : le temps de l'animation, les blocs glissent. */
  const animated = useCallback(
    (run) => {
      setTween(true)
      run()
      setTimeout(() => setTween(false), 360)
    },
    [],
  )

  const restore = useCallback((from, to) => {
    if (!from.current.length) return
    to.current.push(docRef.current)
    const restored = from.current.pop()
    docRef.current = restored
    setDoc(restored)
    setEditingId(null)
    setHistory({ past: past.current.length, future: future.current.length })
  }, [])

  const undo = useCallback(() => restore(past, future), [restore])
  const redo = useCallback(() => restore(future, past), [restore])

  const clear = useCallback(() => {
    const { strokes, items, links } = docRef.current
    if (!strokes.length && !items.length && !links.length) return
    commit(() => EMPTY_DOC)
    clearSelection()
    setEditingId(null)
    setPending(null)
  }, [commit, clearSelection])

  /* ---------- persistance ---------- */

  const applyDoc = useCallback((saved) => {
    const restored = {
      strokes: saved?.strokes ?? [],
      items: saved?.items ?? [],
      links: saved?.links ?? [],
    }
    docRef.current = restored
    setDoc(restored)
    past.current = []
    future.current = []
    setHistory({ past: 0, future: 0 })
    setEditingId(null)
    setSelection({ items: [], link: null })
    if (saved?.view) setView(saved.view)
  }, [])

  useEffect(() => {
    let cancelled = false
    loadIndex()
      .then(async (index) => {
        if (cancelled) return
        const id = index.currentId ?? index.boards[0].id
        setBoards(index.boards)
        boardsRef.current = index.boards
        setBoardId(id)
        boardIdRef.current = id
        const saved = await loadBoard(id)
        if (cancelled) return
        applyDoc(saved)
        setStatus('saved')
      })
      .catch(() => setStatus('saved'))
    return () => {
      cancelled = true
    }
  }, [applyDoc])

  useEffect(() => {
    if (status === 'loading' || !boardId) return
    setStatus('saving')
    const timer = setTimeout(async () => {
      const ok = await saveBoard(boardId, { ...docRef.current, view: viewRef.current })
      setStatus(ok ? 'saved' : 'error')

      // Vignette du rail : quelques rectangles normalisés, réécrits avec le tableau.
      const preview = makePreview(docRef.current)
      const list = boardsRef.current.map((board) =>
        board.id === boardId ? { ...board, preview } : board,
      )
      setBoards(list)
      saveIndex({ boards: list, currentId: boardId })
    }, 500)
    return () => clearTimeout(timer)
    // `view` participe volontairement au déclenchement : la vue est persistée aussi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, view, boardId])

  /* ---------- tableaux, export, import ---------- */

  const commitIndex = useCallback(async (nextBoards, nextId) => {
    boardsRef.current = nextBoards
    setBoards(nextBoards)
    await saveIndex({ boards: nextBoards, currentId: nextId })
  }, [])

  const openBoard = useCallback(
    async (id, list = boards) => {
      if (id === boardIdRef.current) return
      await saveBoard(boardIdRef.current, { ...docRef.current, view: viewRef.current })
      const saved = await loadBoard(id)
      boardIdRef.current = id
      setBoardId(id)
      applyDoc(saved)
      await commitIndex(list, id)
    },
    [applyDoc, boards, commitIndex],
  )

  const createBoard = useCallback(
    async (name = `Tableau ${boards.length + 1}`, content = EMPTY_DOC) => {
      const id = newBoardId()
      await saveBoard(id, content)
      await saveBoard(boardIdRef.current, { ...docRef.current, view: viewRef.current })
      const list = [...boards, { id, name }]
      boardIdRef.current = id
      setBoardId(id)
      applyDoc(content)
      setView({ x: 0, y: 0, scale: 1 })
      await commitIndex(list, id)
    },
    [applyDoc, boards, commitIndex],
  )

  const createBoardRef = useRef(null)
  createBoardRef.current = createBoard

  const renameBoard = useCallback(
    (name) => {
      const list = boards.map((board) => (board.id === boardId ? { ...board, name } : board))
      commitIndex(list, boardId)
    },
    [boards, boardId, commitIndex],
  )

  const duplicateBoard = useCallback(() => {
    const current = boards.find((board) => board.id === boardId)
    createBoard(`${current?.name ?? 'Tableau'} (copie)`, { ...docRef.current })
  }, [boards, boardId, createBoard])

  const removeBoard = useCallback(async () => {
    if (boards.length < 2) return
    const list = boards.filter((board) => board.id !== boardId)
    await deleteBoard(boardId)
    const next = list[0].id
    const saved = await loadBoard(next)
    boardIdRef.current = next
    setBoardId(next)
    applyDoc(saved)
    await commitIndex(list, next)
  }, [applyDoc, boards, boardId, commitIndex])

  const boardName = boards.find((board) => board.id === boardId)?.name ?? 'Tableau'

  const savePng = useCallback(
    async (onlySelection) => {
      setStatus('saving')
      const ok = await exportPng(
        {
          layer: itemsRef.current,
          doc: docRef.current,
          only: onlySelection ? selectionRef.current.items : null,
        },
        boardName,
      )
      setStatus(ok ? 'saved' : 'error')
    },
    [boardName],
  )

  const saveJson = useCallback(() => {
    exportJson(docRef.current, boardName)
  }, [boardName])

  const importJson = useCallback(
    async (file) => {
      try {
        const data = await readJson(file)
        await createBoard(data.name, { strokes: data.strokes, items: data.items, links: data.links })
      } catch {
        setStatus('error')
      }
    },
    [createBoard],
  )

  /* ---------- partage et collaboration ---------- */

  /** Applique un document reçu : pas d'entrée d'historique, pas de renvoi en boucle. */
  const applyRemote = useCallback((incoming) => {
    if (!incoming) return
    fromRemote.current = true
    const next = {
      strokes: incoming.strokes ?? [],
      items: incoming.items ?? [],
      links: incoming.links ?? [],
    }
    docRef.current = next
    setDoc(next)
  }, [])

  /**
   * Synchronisation par résumé : au lieu d'un flot continu (et du document entier toutes
   * les 220 ms, images comprises, qui finissait par saturer la liaison), chaque pair
   * envoie trois fois par seconde ce qui a changé depuis son dernier envoi — et
   * uniquement les champs modifiés. À la réception, les blocs glissent vers leur nouvelle
   * place : on garde la sensation du direct sans le débit.
   */
  const sent = useRef({ items: new Map(), strokes: new Set(), links: null, ink: null })

  const resetDigest = useCallback(() => {
    sent.current = {
      items: new Map(docRef.current.items.map((item) => [item.id, item])),
      strokes: new Set(docRef.current.strokes.map((stroke) => stroke.id)),
      links: docRef.current.links,
      ink: null,
    }
  }, [])

  /**
   * Marque comme « déjà connu » ce qu'un pair vient de nous envoyer — et rien d'autre :
   * repartir de zéro effacerait nos propres modifications pas encore transmises.
   */
  const absorb = useCallback((message) => {
    const doc = docRef.current
    const state = sent.current
    for (const delta of message.items ?? []) {
      const item = doc.items.find((candidate) => candidate.id === delta.id)
      if (item) state.items.set(item.id, item)
    }
    for (const id of message.removed ?? []) state.items.delete(id)
    for (const stroke of message.strokes ?? []) state.strokes.add(stroke.id)
    for (const id of message.erased ?? []) state.strokes.delete(id)
    if (message.links) state.links = doc.links
  }, [])

  const buildDigest = useCallback(() => {
    const doc = docRef.current
    const previous = sent.current
    const digest = {}

    // Blocs : seuls les champs qui ont bougé partent (une image déplacée n'est pas renvoyée).
    const items = []
    const present = new Set()
    for (const item of doc.items) {
      present.add(item.id)
      const before = previous.items.get(item.id)
      if (before === item) continue
      if (!before) {
        items.push(item)
        continue
      }
      const delta = { id: item.id }
      for (const key of Object.keys(item)) {
        if (item[key] !== before[key]) delta[key] = item[key]
      }
      if (Object.keys(delta).length > 1) items.push(delta)
    }
    const gone = [...previous.items.keys()].filter((id) => !present.has(id))
    if (items.length) digest.items = items
    if (gone.length) digest.removed = gone

    // Traits : les nouveaux en entier, les disparus par identifiant.
    const strokeIds = new Set(doc.strokes.map((stroke) => stroke.id))
    const fresh = doc.strokes.filter((stroke) => !previous.strokes.has(stroke.id))
    const erased = [...previous.strokes].filter((id) => !strokeIds.has(id))
    if (fresh.length) digest.strokes = fresh
    if (erased.length) digest.erased = erased

    if (doc.links !== previous.links) digest.links = doc.links

    // Trait en cours : seulement les points ajoutés depuis le dernier envoi.
    const live = liveStroke.current
    if (live) {
      const already = previous.ink?.id === live.id ? previous.ink.count : 0
      if (live.points.length > already) {
        digest.ink = {
          id: live.id,
          tool: live.tool,
          color: live.color,
          size: live.size,
          from: already,
          points: live.points.slice(already),
        }
      }
    }

    if (!Object.keys(digest).length) return null

    sent.current = {
      items: new Map(doc.items.map((item) => [item.id, item])),
      strokes: strokeIds,
      links: doc.links,
      ink: live ? { id: live.id, count: live.points.length } : null,
    }
    return digest
  }, [])

  /** Onde éphémère à l'endroit pointé. */
  const addPing = useCallback((point, color, name) => {
    const ping = { id: `${Date.now()}-${Math.random()}`, x: point.x, y: point.y, color, name }
    setPings((current) => [...current, ping])
    setTimeout(() => setPings((current) => current.filter((entry) => entry.id !== ping.id)), 1400)
  }, [])

  /** Bulle éphémère sous le curseur de la personne qui vient de parler. */
  const showBubble = useCallback((id, text) => {
    setBubbles((current) => new Map(current).set(id, { text, at: Date.now() }))
    clearTimeout(bubbleTimers.current.get(id))
    bubbleTimers.current.set(
      id,
      setTimeout(() => {
        setBubbles((current) => {
          const next = new Map(current)
          next.delete(id)
          return next
        })
      }, 6000),
    )
  }, [])

  const receive = useCallback(
    (message, from) => {
      switch (message.t) {
        case 'join':
          sessionRef.current?.sendTo(from, { t: 'doc', doc: docRef.current })
          break

        case 'doc':
          gotRemoteDoc.current = true
          applyRemote(message.doc)
          resetDigest()
          // Le document reçu contient les traits terminés : on retire nos copies vivantes.
          for (const [id, ink] of remoteInk.current) {
            if (message.doc?.strokes?.some((stroke) => stroke.id === ink.id)) {
              remoteInk.current.delete(id)
            }
          }
          painters.current.paintStrokes()
          break

        case 'sync': {
          fromRemote.current = true
          const doc = docRef.current
          let items = doc.items

          if (message.items?.length) {
            const known = new Map(items.map((item) => [item.id, item]))
            for (const delta of message.items) {
              const before = known.get(delta.id)
              known.set(delta.id, before ? { ...before, ...delta } : delta)
            }
            items = [...known.values()]
          }
          if (message.removed?.length) {
            const dropped = new Set(message.removed)
            items = items.filter((item) => !dropped.has(item.id))
          }

          let strokes = doc.strokes
          if (message.strokes?.length) {
            const known = new Set(strokes.map((stroke) => stroke.id))
            strokes = [...strokes, ...message.strokes.filter((stroke) => !known.has(stroke.id))]
            // Le trait est arrivé complet : sa copie « en cours » n'a plus lieu d'être.
            for (const [peer, ink] of remoteInk.current) {
              if (message.strokes.some((stroke) => stroke.id === ink.id)) {
                remoteInk.current.delete(peer)
              }
            }
          }
          if (message.erased?.length) {
            const dropped = new Set(message.erased)
            strokes = strokes.filter((stroke) => !dropped.has(stroke.id))
          }

          const next = { items, strokes, links: message.links ?? doc.links }
          docRef.current = next
          setDoc(next)
          absorb(message)

          if (message.ink) {
            const ink = remoteInk.current.get(from)
            if (ink && ink.id === message.ink.id) ink.points.push(...message.ink.points)
            else remoteInk.current.set(from, { ...message.ink, points: [...message.ink.points] })
          }
          painters.current.paintStrokes()

          // Un mouvement reçu se joue en douceur, sauf si on est soi-même en train de
          // manipuler un bloc : la transition ferait traîner celui qu'on tient.
          if (message.items?.length && Date.now() - lastLocalEdit.current > 500) {
            setTween(true)
            clearTimeout(tweenTimer.current)
            tweenTimer.current = setTimeout(() => setTween(false), 420)
          }
          break
        }

        case 'cursor':
          cursorTargets.current.set(from, { x: message.x, y: message.y })
          // L'outil ne change presque jamais : on ne re-rend que dans ce cas.
          if (message.tool && peerToolsRef.current.get(from) !== message.tool) {
            peerToolsRef.current.set(from, message.tool)
            setPeerTools(new Map(peerToolsRef.current))
          }
          break

        case 'chat':
          setChat((current) => [...current.slice(-199), { ...message, id: `${from}-${message.at}` }])
          setUnread((count) => count + 1)
          showBubble(from, message.text)
          break

        case 'mark':
          addPing({ x: message.x, y: message.y }, message.color, message.name)
          break

        case 'shake':
          // Le curseur grossit tant que la personne secoue, puis se calme tout seul.
          setShaking((current) => new Set(current).add(from))
          clearTimeout(shakeTimers.current.get(from))
          shakeTimers.current.set(
            from,
            setTimeout(() => {
              setShaking((current) => {
                const next = new Set(current)
                next.delete(from)
                return next
              })
            }, 1100),
          )
          break

        case 'typing':
          setTypingPeers((current) => {
            const next = new Set(current)
            if (message.on) next.add(from)
            else next.delete(from)
            return next
          })
          break

        case 'left':
          cursorTargets.current.delete(from)
          peerToolsRef.current.delete(from)
          setPeerTools(new Map(peerToolsRef.current))
          setTypingPeers((current) => {
            const next = new Set(current)
            next.delete(from)
            return next
          })
          setShaking((current) => {
            const next = new Set(current)
            next.delete(from)
            return next
          })
          remoteInk.current.delete(from)
          painters.current.paintStrokes()
          break

        default:
          break
      }
    },
    [applyRemote, addPing, showBubble, resetDigest, absorb],
  )

  /** Prévient les autres qu'on est en train d'écrire (points à la place du nom). */
  const setTyping = useCallback((on) => {
    if (!sessionRef.current || typingSent.current === on) return
    typingSent.current = on
    sessionRef.current.send({ t: 'typing', on })
  }, [])

  const sendChat = useCallback(
    (text) => {
      const session = sessionRef.current
      if (!session || !text.trim()) return
      const message = {
        t: 'chat',
        name: peerName,
        color: session.self.color,
        text: text.trim(),
        at: Date.now(),
      }
      session.send(message)
      setChat((current) => [...current.slice(-199), { ...message, id: `moi-${message.at}` }])
      setTyping(false)
    },
    [peerName, setTyping],
  )

  const systemMessage = useCallback((text) => {
    setChat((current) => [
      ...current.slice(-199),
      { id: `sys-${Date.now()}`, name: 'Session', color: '#8a8a93', text, system: true },
    ])
  }, [])

  const announceNotice = useCallback((text, sticky = false) => {
    setNotice(text)
    if (sticky) return
    setTimeout(() => setNotice((current) => (current === text ? null : current)), 6000)
  }, [])

  const connect = useCallback(
    async ({ host, code, silent }) => {
      setLiveError(null)
      setLiveStatus('connecting')
      try {
        const handle = await openSession({
          host,
          // Une reprise d'hôte réutilise le code existant : sans ça, personne ne
          // retrouverait la session.
          code: code ?? makeCode(),
          name: peerName,
          onPeers: setPeers,
          onMessage: receive,
          onHostLost: (info) => hostLostRef.current?.(info, code),
          onStatus: (state) => {
            if (state === 'reconnecting') {
              announceNotice('Connexion instable, reconnexion en cours…', true)
            }
            if (state === 'ready') setNotice(null)
          },
        })
        gotRemoteDoc.current = false
        resetDigest()
        sessionRef.current = handle
        setSession(handle)
        setLiveStatus('ready')
        return true
      } catch (error) {
        setLiveStatus('idle')
        if (!silent) {
          setLiveError(
            error?.type === 'unavailable-id'
              ? 'Ce code est déjà pris, réessayez.'
              : (error?.message ?? 'Connexion impossible'),
          )
        }
        return false
      }
    },
    [receive, peerName, announceNotice, resetDigest],
  )

  /**
   * L'hôte ne répond plus. À deux, la session n'a plus lieu d'être ; à plus, le survivant
   * au plus petit identifiant reprend le code et les autres s'y rebranchent.
   */
  const hostLost = useCallback(
    async ({ survivors, isWinner }, code) => {
      sessionRef.current = null
      setSession(null)
      setPeers([])
      cursorTargets.current.clear()
      remoteInk.current.clear()
      peerToolsRef.current.clear()
      setPeerTools(new Map())

      if (survivors.length < 2) {
        setChat([])
        setLiveStatus('idle')
        announceNotice('L’hôte s’est déconnecté : session fermée, votre tableau reste ici.')
        return
      }

      announceNotice(
        isWinner
          ? 'L’hôte s’est déconnecté : vous reprenez la session.'
          : 'L’hôte s’est déconnecté : reconnexion à la session…',
        !isWinner,
      )
      systemMessage(
        isWinner ? 'Vous reprenez la session.' : 'Changement d’hôte, reconnexion…',
      )

      // L'annuaire met quelques secondes à libérer l'identifiant de l'ancien hôte :
      // les deux rôles insistent, chacun à son rythme.
      const attempts = isWinner ? 12 : 14
      const pause = isWinner ? 1200 : 1600
      if (!isWinner) await new Promise((resolve) => setTimeout(resolve, 2000))

      for (let attempt = 0; attempt < attempts; attempt++) {
        if (await connect({ host: isWinner, code, silent: true })) {
          setNotice(null)
          systemMessage(isWinner ? 'Session reprise.' : 'Reconnecté à la session.')
          return
        }
        await new Promise((resolve) => setTimeout(resolve, pause))
      }

      setLiveStatus('idle')
      announceNotice('Impossible de rétablir la session.')
    },
    [announceNotice, connect, systemMessage],
  )

  const hostLostRef = useRef(null)
  hostLostRef.current = hostLost

  const leaveSession = useCallback(() => {
    sessionRef.current?.close()
    sessionRef.current = null
    setSession(null)
    setPeers([])
    cursorTargets.current.clear()
    remoteInk.current.clear()
    peerToolsRef.current.clear()
    setPeerTools(new Map())
    setTypingPeers(new Set())
    setBubbles(new Map())
    setShaking(new Set())
    setPings([])
    shakeDetector.current.reset()
    setQuick(null)
    setChat([])
    setUnread(0)
    setLiveStatus('idle')
  }, [])

  useEffect(() => () => sessionRef.current?.close(), [])

  useEffect(() => {
    localStorage.setItem('moodboard:name', peerName)
  }, [peerName])

  // Première venue : on propose la visite, une seule fois.
  useEffect(() => {
    if (localStorage.getItem('moodboard:tour')) return undefined
    const timer = setTimeout(() => setTourStep(0), 700)
    return () => clearTimeout(timer)
  }, [])

  const closeTour = useCallback(() => {
    setTourStep(null)
    // La visite a pu changer d'outil pour montrer les réglages : on rend la main proprement.
    setTool('select')
    localStorage.setItem('moodboard:tour', 'vu')
  }, [])


  // Trois envois par seconde : assez pour suivre, assez peu pour ne jamais s'engorger.
  useEffect(() => {
    if (!session) return undefined

    const timer = setInterval(() => {
      // Un invité attend le tableau de l'hôte avant d'émettre le sien (vérifié à chaque
      // battement : la valeur arrive après la mise en place de la boucle).
      if (!session.isHost && !gotRemoteDoc.current) return
      const digest = buildDigest()
      if (digest) session.send({ t: 'sync', ...digest })
    }, 320)

    return () => clearInterval(timer)
  }, [session, buildDigest])

  const importCode = useCallback(
    async (code) => {
      try {
        const data = await decodeBoard(code)
        await createBoardRef.current(data.name, {
          strokes: data.strokes,
          items: data.items,
          links: data.links,
        })
        setShare(false)
      } catch (error) {
        setLiveError(error?.message ?? 'Code illisible')
      }
    },
    [],
  )

  /* ---------- rendu canvas ---------- */

  // La grille est un motif mis en cache : un seul fillRect par image, quel que soit le
  // zoom. La dessiner point par point coûtait des dizaines de milliers d'arcs par image
  // une fois dézoomé, ce qui saccadait le déplacement.
  const gridTile = useRef({ key: '', canvas: null })

  const paintGrid = useCallback(() => {
    const canvas = gridRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const { x, y, scale } = viewRef.current

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Pas adaptatif : on double (ou halve) le pas « monde » pour garder des points
    // lisibles et peu nombreux à l'écran.
    let world = GRID_STEP
    while (world * scale < 24) world *= 2
    while (world * scale > 96) world /= 2

    const step = Math.round(world * scale * dpr)
    if (step < 6) return

    const radius = Math.round(Math.min(1.6, Math.max(0.7, scale)) * dpr * 10) / 10
    const pattern = ctx.createPattern(gridTileFor(gridTile, step, radius), 'repeat')
    const offsetX = (((x * dpr) % step) + step) % step
    const offsetY = (((y * dpr) % step) + step) % step

    ctx.setTransform(1, 0, 0, 1, offsetX, offsetY)
    ctx.fillStyle = pattern
    ctx.fillRect(-offsetX, -offsetY, canvas.width + step, canvas.height + step)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [])

  const strokePath = useCallback((ctx, stroke) => {
    const { x, y, scale } = viewRef.current
    const pts = stroke.points
    if (!pts.length) return

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(0.5, stroke.size * scale)
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
    }

    ctx.beginPath()
    if (pts.length === 1) {
      // un simple clic : on dépose un point
      ctx.arc(pts[0].x * scale + x, pts[0].y * scale + y, ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fill()
    } else {
      ctx.moveTo(pts[0].x * scale + x, pts[0].y * scale + y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * scale + x, pts[i].y * scale + y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }, [])

  // Les boîtes englobantes sont calculées une fois par trait, puis réutilisées à chaque
  // repeint pour ignorer tout ce qui est hors écran.
  const bounds = useRef(new Map())

  const boundsOf = useCallback((stroke) => {
    let box = bounds.current.get(stroke.id)
    if (!box) {
      box = strokeBounds(stroke)
      bounds.current.set(stroke.id, box)
    }
    return box
  }, [])

  const paintStrokes = useCallback(() => {
    const canvas = drawRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas.getBoundingClientRect()
    const { x, y, scale } = viewRef.current

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1)

    for (const stroke of doc.strokes) {
      const box = boundsOf(stroke)
      const margin = stroke.size * scale
      if (
        box.maxX * scale + x < -margin ||
        box.minX * scale + x > width + margin ||
        box.maxY * scale + y < -margin ||
        box.minY * scale + y > height + margin
      ) {
        continue
      }
      strokePath(ctx, stroke)
    }
    for (const ink of remoteInk.current.values()) strokePath(ctx, ink)
    if (liveStroke.current) strokePath(ctx, liveStroke.current)
  }, [doc.strokes, strokePath, boundsOf])

  // Les peintres changent à chaque trait : on les garde dans une ref pour ne pas
  // recréer le ResizeObserver à chaque coup de crayon.
  const painters = useRef({ paintGrid, paintStrokes })
  painters.current = { paintGrid, paintStrokes }

  useLayoutEffect(() => {
    const resize = () => {
      const el = containerRef.current
      if (!el) return
      const dpr = window.devicePixelRatio || 1
      const { width, height } = el.getBoundingClientRect()
      setViewport({ w: width, h: height })
      for (const canvas of [gridRef.current, drawRef.current]) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }
      painters.current.paintGrid()
      painters.current.paintStrokes()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(containerRef.current)
    window.addEventListener('resize', resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    paintGrid()
    paintStrokes()
  }, [view, paintGrid, paintStrokes])

  /* ---------- coordonnées ---------- */

  const toWorld = useCallback((clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect()
    const { x, y, scale } = viewRef.current
    return {
      x: (clientX - rect.left - x) / scale,
      y: (clientY - rect.top - y) / scale,
    }
  }, [])

  // Les nouveaux blocs arrivent au centre : on les décale en cascade pour éviter la pile.
  const spawnIndex = useRef(0)

  const itemsById = useCallback(
    () => new Map(docRef.current.items.map((item) => [item.id, item])),
    [],
  )

  /** Transforme un point libre en accroche si un bloc est assez proche. */
  const snapEnd = useCallback((point) => {
    const found = nearestAnchor(
      docRef.current.items.filter((item) => item.type !== 'group'),
      point,
      snapReach(viewRef.current.scale),
    )
    return found ? { id: found.id, side: found.side } : { x: Math.round(point.x), y: Math.round(point.y) }
  }, [])

  const viewportCenter = useCallback(() => {
    const rect = containerRef.current.getBoundingClientRect()
    const center = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const step = (spawnIndex.current++ % 6) * 30
    return { x: center.x + step, y: center.y + step }
  }, [toWorld])

  /**
   * Quand on écrit dans un bloc, les autres voient notre curseur se poser sur la lettre
   * en cours. `selectionchange` couvre la frappe, les flèches et les clics dans le texte.
   */
  useEffect(() => {
    if (!session) return undefined
    const follow = () => {
      const field = document.activeElement
      if (!field || (field.tagName !== 'TEXTAREA' && field.tagName !== 'INPUT')) return
      if (!itemsRef.current?.contains(field)) return

      const point = caretPoint(field)
      if (!point) return
      const world = toWorld(point.x, point.y)
      sessionRef.current?.send({ t: 'cursor', x: world.x, y: world.y, tool: 'text' })
    }
    document.addEventListener('selectionchange', follow)
    return () => document.removeEventListener('selectionchange', follow)
  }, [session, toWorld])

  /* ---------- éléments ---------- */

  const addItems = useCallback(
    (items) => {
      if (!items.length) return
      commit((d) => ({ ...d, items: [...d.items, ...items] }))
      setTool('select')
      setSelection({ items: items.map((item) => item.id), link: null })
    },
    [commit],
  )

  const changeItem = useCallback(
    (id, patch, recordHistory) => {
      write((d) => {
        const target = d.items.find((item) => item.id === id)
        if (!target) return d

        // Un déplacement entraîne : toute la sélection, les membres d'un groupe,
        // et la descendance d'un nœud de carte mentale.
        const dx = patch.x === undefined ? 0 : patch.x - target.x
        const dy = patch.y === undefined ? 0 : patch.y - target.y
        let moving = null
        if (dx || dy) {
          const chosen = selectionRef.current.items
          const roots = chosen.length > 1 && chosen.includes(id) ? chosen : [id]
          const set = new Set(roots)
          const nodes = d.items.filter((item) => item.type === 'node')
          for (const rootId of roots) {
            const item = d.items.find((candidate) => candidate.id === rootId)
            if (!item) continue
            if (item.type === 'group') for (const member of item.members) set.add(member)
            if (item.type === 'node') for (const node of subtree(nodes, rootId)) set.add(node.id)
          }
          set.delete(id)
          moving = set.size ? set : null
        }

        let items = d.items.map((item) => {
          if (item.id === id) return { ...item, ...patch }
          if (moving?.has(item.id)) return { ...item, x: item.x + dx, y: item.y + dy }
          return item
        })

        const next = items.find((item) => item.id === id)
        if (next.type === 'group' && next.autoSort && (patch.w !== undefined || patch.h !== undefined)) {
          items = layoutGroup(items, next)
        }
        if (!recordHistory) lastLocalEdit.current = Date.now()
        return { ...d, items }
      }, recordHistory)
    },
    [write],
  )

  /** Aimante un bloc déplacé seul aux bords et centres des autres. */
  const snap = useCallback((id, x, y) => {
    const item = docRef.current.items.find((candidate) => candidate.id === id)
    if (!item || selectionRef.current.items.length > 1) {
      setGuides((current) => (current.length ? [] : current))
      return { x, y }
    }
    const others = docRef.current.items.filter(
      (candidate) => candidate.id !== id && candidate.type !== 'group',
    )
    const result = snapPosition({ ...item, x, y }, others, viewRef.current.scale)
    setGuides(result.guides)
    return { x: result.x, y: result.y }
  }, [])

  const clearGuides = useCallback(() => setGuides((current) => (current.length ? [] : current)), [])

  const deleteItem = useCallback(
    (id) => {
      // Un nœud emporte sa branche ; les connexions attachées disparaissent avec le bloc.
      commit((d) => {
        const target = d.items.find((item) => item.id === id)
        if (target?.type === 'node') {
          const nodes = d.items.filter((item) => item.type === 'node')
          const doomed = new Set(subtree(nodes, id).map((node) => node.id))
          let items = d.items.filter((item) => !doomed.has(item.id))
          const parent = items.find((item) => item.id === target.parent)
          if (parent) {
            const root = rootOf(items.filter((item) => item.type === 'node'), parent)
            items = applyTreeLayout(items, root.id)
          }
          return {
            ...d,
            items,
            links: d.links.filter((link) => !doomed.has(link.from) && !doomed.has(link.to)),
          }
        }
        return {
        ...d,
        items: d.items
          .filter((item) => item.id !== id)
          .map((item) =>
            item.type === 'group' && item.members.includes(id)
              ? { ...item, members: item.members.filter((member) => member !== id) }
              : item,
          ),
        links: d.links.filter((link) => link.from !== id && link.to !== id),
        }
      })
      setSelection((current) => ({
        items: current.items.filter((item) => item !== id),
        link: current.link,
      }))
      setEditingId((current) => (current === id ? null : current))
      setPending((current) => (current?.fromId === id ? null : current))
      setNodeMenu(null)
    },
    [commit],
  )

  const importFiles = useCallback(
    async (files, at) => {
      const point = at ?? viewportCenter()
      addItems(await itemsFromFiles([...files], point))
    },
    [addItems, viewportCenter],
  )

  const addText = useCallback(
    (variant = 'note') => {
      const item = textItem({
        at: viewportCenter(),
        color: variant === 'note' ? '#f5cd5a' : colorRef.current,
        variant,
      })
      addItems([item])
      setEditingId(item.id)
    },
    [addItems, viewportCenter],
  )

  const applyAlign = useCallback(
    (mode) => {
      animated(() =>
      commit((d) => {
        const patches = alignItems(d.items, selectionRef.current.items, mode)
        if (!patches.length) return d

        // Un bloc aligné entraîne ses dépendants (membres de groupe, branche d'un nœud).
        const nodes = d.items.filter((item) => item.type === 'node')
        const deltas = new Map()
        for (const patch of patches) {
          const item = d.items.find((candidate) => candidate.id === patch.id)
          const dx = (patch.x ?? item.x) - item.x
          const dy = (patch.y ?? item.y) - item.y
          if (!dx && !dy) continue
          const targets = new Set([item.id])
          if (item.type === 'group') for (const member of item.members) targets.add(member)
          if (item.type === 'node') for (const node of subtree(nodes, item.id)) targets.add(node.id)
          for (const id of targets) {
            const previous = deltas.get(id) ?? { dx: 0, dy: 0 }
            deltas.set(id, { dx: previous.dx + dx, dy: previous.dy + dy })
          }
        }
        return {
          ...d,
          items: d.items.map((item) => {
            const delta = deltas.get(item.id)
            return delta ? { ...item, x: item.x + delta.dx, y: item.y + delta.dy } : item
          }),
        }
      }))
    },
    [commit, animated],
  )

  const addCodeBlock = useCallback(() => {
    const item = codeItem('// Collez ou tapez votre code ici\n', {
      name: 'extrait',
      at: viewportCenter(),
    })
    addItems([item])
    setEditingId(item.id)
  }, [addItems, viewportCenter])

  const addSketch = useCallback(
    (mode) => {
      setMenu(null)
      addItems([sketchItem(mode, viewportCenter())])
    },
    [addItems, viewportCenter],
  )

  const exportSketch = useCallback(
    (source, shot) => {
      addItems([imageItemFromShot(source, shot)])
    },
    [addItems],
  )

  /* ---------- copier, dupliquer, ordre ---------- */

  const clipboard = useRef([])
  const MARKER = 'moodboard/items'

  /** Copies indépendantes : nouveaux identifiants, liens internes conservés. */
  const cloneItems = useCallback((source, offset = 24) => {
    const ids = new Map(source.map((item) => [item.id, newId()]))
    return source.map((item) => {
      const copy = { ...item, id: ids.get(item.id), x: item.x + offset, y: item.y + offset }
      if (item.type === 'group') copy.members = item.members.map((m) => ids.get(m)).filter(Boolean)
      if (item.type === 'node') copy.parent = item.parent ? (ids.get(item.parent) ?? null) : null
      return copy
    })
  }, [])

  const copySelection = useCallback(() => {
    const chosen = docRef.current.items.filter((item) => selectionRef.current.items.includes(item.id))
    if (!chosen.length) return
    clipboard.current = chosen
    navigator.clipboard?.writeText?.(JSON.stringify({ [MARKER]: chosen })).catch(() => {})
  }, [])

  const pasteItems = useCallback(
    (source) => {
      const copies = cloneItems(source)
      if (!copies.length) return
      commit((d) => ({ ...d, items: [...d.items, ...copies] }))
      setTool('select')
      setSelection({ items: copies.map((item) => item.id), link: null })
    },
    [cloneItems, commit],
  )

  const duplicateSelection = useCallback(() => {
    const chosen = docRef.current.items.filter((item) => selectionRef.current.items.includes(item.id))
    if (chosen.length) pasteItems(chosen)
  }, [pasteItems])

  const reorder = useCallback(
    (toFront) => {
      const ids = new Set(selectionRef.current.items)
      if (!ids.size) return
      commit((d) => {
        const moved = d.items.filter((item) => ids.has(item.id))
        const rest = d.items.filter((item) => !ids.has(item.id))
        return { ...d, items: toFront ? [...rest, ...moved] : [...moved, ...rest] }
      })
    },
    [commit],
  )

  /* ---------- carte mentale ---------- */

  const addMindmap = useCallback(
    (layout = 'mindmap') => {
      // Teinte dédiée en rotation, comme les groupes : le noir du crayon rendrait l'arbre terne.
      const roots = docRef.current.items.filter(
        (item) => item.type === 'node' && !item.parent,
      ).length
      const root = nodeItem({
        at: viewportCenter(),
        color: GROUP_TINTS[roots % GROUP_TINTS.length],
        layout,
      })
      addItems([root])
      setEditingId(root.id)
      setMenu(null)
    },
    [addItems, viewportCenter],
  )

  /** Change la disposition de l'arbre auquel appartient le nœud sélectionné. */
  const setNodeLayout = useCallback(
    (layout) => {
      const node = docRef.current.items.find(
        (item) => item.id === selectionRef.current.items[0] && item.type === 'node',
      )
      if (!node) return
      const root = rootOf(
        docRef.current.items.filter((item) => item.type === 'node'),
        node,
      )
      animated(() =>
        commit((d) => {
          const items = d.items.map((item) => (item.id === root.id ? { ...item, layout } : item))
          return { ...d, items: applyTreeLayout(items, root.id) }
        }),
      )
    },
    [commit, animated],
  )

  const addChild = useCallback(
    (parentId) => {
      const parent = docRef.current.items.find((item) => item.id === parentId)
      if (!parent) return

      // Les enfants poussent du côté de leur parent ; sous la racine d'une carte mentale,
      // on équilibre en choisissant le côté le moins chargé.
      let side = parent.side
      if (!parent.parent) {
        const kids = docRef.current.items.filter(
          (item) => item.type === 'node' && item.parent === parentId,
        )
        const left = kids.filter((kid) => kid.side === 'left').length
        side = left < kids.length - left ? 'left' : 'right'
      }

      const child = nodeItem({
        at: { x: parent.x + parent.w / 2, y: parent.y + parent.h / 2 },
        parent: parentId,
        side,
        color: parent.color,
      })

      animated(() =>
        commit((d) => {
          const items = [...d.items, child]
          const nodes = items.filter((item) => item.type === 'node')
          const root = rootOf(nodes, parent)
          return { ...d, items: applyTreeLayout(items, root.id) }
        }),
      )
      setNodeMenu(null)
      setSelection({ items: [child.id], link: null })
      setEditingId(child.id)
    },
    [commit, animated],
  )

  /** Un frère, c'est un enfant de plus sur le parent. */
  const addSibling = useCallback(
    (nodeId) => {
      const node = docRef.current.items.find((item) => item.id === nodeId)
      if (node?.parent) addChild(node.parent)
    },
    [addChild],
  )

  const toggleDone = useCallback(
    (id) => {
      commit((d) => ({
        ...d,
        items: d.items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
      }))
    },
    [commit],
  )

  const openItemMenu = useCallback((item, point) => {
    setNodeMenu({
      id: item.id,
      type: item.type,
      hasParent: item.type === 'node' && Boolean(item.parent),
      x: point.x,
      y: point.y,
    })
  }, [])

  /* ---------- groupes ---------- */

  const onItemDragEnd = useCallback(
    (id) => {
      setGuides([])
      write((d) => {
        const moved = d.items.find((item) => item.id === id)
        if (!moved || moved.type === 'group') return d

        // Le bloc appartient au groupe dans la zone duquel il a été lâché, où que ce soit.
        const target = groupFor(
          d.items.filter((item) => item.type === 'group'),
          moved,
        )

        let items = d.items.map((group) => {
          if (group.type !== 'group') return group
          const was = group.members.includes(id)
          const now = target?.id === group.id
          if (was === now) return group
          return {
            ...group,
            members: now ? [...group.members, id] : group.members.filter((m) => m !== id),
          }
        })

        for (const group of items.filter((item) => item.type === 'group' && item.autoSort)) {
          items = layoutGroup(items, items.find((item) => item.id === group.id))
        }
        return { ...d, items }
      }, false)
    },
    [write],
  )

  const toggleAutoSort = useCallback(
    (id) => {
      animated(() =>
      commit((d) => {
        let items = d.items.map((item) =>
          item.id === id ? { ...item, autoSort: !item.autoSort } : item,
        )
        const group = items.find((item) => item.id === id)
        if (group.autoSort) items = layoutGroup(items, group)
        return { ...d, items }
      }))
    },
    [commit, animated],
  )

  const sortGroupNow = useCallback(
    (id) => {
      animated(() =>
        commit((d) => ({
          ...d,
          items: layoutGroup(d.items, d.items.find((item) => item.id === id)),
        })),
      )
    },
    [commit, animated],
  )

  /* ---------- connexions ---------- */

  /** Les deux arcs d'un raccord, et l'extrémité concernée de chacun. */
  const joinOf = (link, key) => link.joins?.[key] ?? null

  /**
   * Déplacement d'une poignée d'arc, en continu et sans entrée d'historique.
   * Un raccord entraîne l'arc voisin : extrémités confondues, tangentes opposées.
   */
  const dragArc = useCallback(
    (id, key, point) => {
      write((d) => {
        const arc = d.links.find((link) => link.id === id)
        if (!arc) return d

        const byId = new Map(d.items.map((item) => [item.id, item]))
        const changes = new Map()
        const value = { x: Math.round(point.x), y: Math.round(point.y) }

        if (key === 'from' || key === 'to') {
          changes.set(id, { [key]: value })
          // L'arc raccordé garde le même point de jonction.
          const join = joinOf(arc, key)
          if (join) changes.set(join.arc, { [join.end]: value })
        } else {
          changes.set(id, { [key]: point })
          // Tangente d'un raccord : celle d'en face reste dans son prolongement.
          const side = key === 'c1' ? 'from' : 'to'
          const join = joinOf(arc, side)
          if (join) {
            const joint = resolveEnd(arc[side], byId)
            const neighbour = d.links.find((link) => link.id === join.arc)
            if (joint && neighbour) {
              const ends = {
                from: resolveEnd(neighbour.from, byId),
                to: resolveEnd(neighbour.to, byId),
              }
              const controls = controlsOf(neighbour, ends.from, ends.to)
              const target = join.end === 'from' ? 'c1' : 'c2'
              const length = Math.hypot(
                controls[target].x - joint.x,
                controls[target].y - joint.y,
              )
              changes.set(join.arc, { [target]: mirrorControl(joint, point, length) })
            }
          }
        }

        return {
          ...d,
          links: d.links.map((link) =>
            changes.has(link.id) ? { ...link, ...changes.get(link.id) } : link,
          ),
        }
      }, false)

      if (key === 'from' || key === 'to') {
        const anchor = nearestAnchor(
          docRef.current.items.filter((item) => item.type !== 'group'),
          point,
          snapReach(viewRef.current.scale),
        )
        const end = anchor ? null : nearestArcEnd(id, point, 0.45)
        setArcSnap(anchor ? { x: anchor.x, y: anchor.y } : end)
      }
    },
    [write],
  )

  /** Extrémité d'un autre arc, si elle est à portée. */
  const nearestArcEnd = useCallback((id, point, ratio = 1) => {
    const byId = new Map(docRef.current.items.map((item) => [item.id, item]))
    const reach = snapReach(viewRef.current.scale) * ratio
    let best = null
    for (const candidate of arcEnds(docRef.current.links, id)) {
      const position = resolveEnd(candidate.point, byId)
      if (!position) continue
      const distance = Math.hypot(position.x - point.x, position.y - point.y)
      if (distance <= reach && (!best || distance < best.distance)) {
        best = { ...candidate, x: position.x, y: position.y, distance }
      }
    }
    return best
  }, [])

  /**
   * Fin de déplacement : l'extrémité s'accroche à un bloc, se raccorde à un autre arc,
   * ou reste où elle est. Un raccord aligne les deux tangentes.
   */
  const dropArc = useCallback(
    (id, key, point) => {
      setArcSnap(null)

      if (key === 'c1' || key === 'c2') {
        commit((d) => ({
          ...d,
          links: d.links.map((link) => (link.id === id ? { ...link, [key]: point } : link)),
        }))
        return
      }

      // Un bloc à portée l'emporte, et un raccord d'arc demande d'être bien plus précis :
      // deux flèches qui arrivent au même endroit doivent pouvoir rester indépendantes.
      const anchored = snapEnd(point)
      const junction = anchored.id ? null : nearestArcEnd(id, point, 0.45)
      const value = junction ? { x: junction.x, y: junction.y } : anchored

      commit((d) => {
        const byId = new Map(d.items.map((item) => [item.id, item]))
        const links = d.links.map((link) => {
          if (link.id !== id) return link
          const joins = { ...link.joins }
          if (junction) joins[key] = { arc: junction.arc, end: junction.end }
          else delete joins[key]
          return { ...link, [key]: value, joins }
        })

        if (!junction) return { ...d, links }

        // On enregistre le raccord des deux côtés et on aligne les tangentes.
        return {
          ...d,
          links: links.map((link) => {
            if (link.id !== junction.arc) return link
            const joins = { ...link.joins, [junction.end]: { arc: id, end: key } }
            const mine = links.find((entry) => entry.id === id)
            const ends = { from: resolveEnd(mine.from, byId), to: resolveEnd(mine.to, byId) }
            const controls = controlsOf(mine, ends.from ?? point, ends.to ?? point)
            const joint = { x: junction.x, y: junction.y }
            const target = junction.end === 'from' ? 'c1' : 'c2'
            const source = key === 'from' ? controls.c1 : controls.c2
            const neighbourEnds = {
              from: resolveEnd(link.from, byId),
              to: resolveEnd(link.to, byId),
            }
            const neighbourControls = controlsOf(link, neighbourEnds.from, neighbourEnds.to)
            const length = Math.hypot(
              neighbourControls[target].x - joint.x,
              neighbourControls[target].y - joint.y,
            )
            return {
              ...link,
              [junction.end]: joint,
              joins,
              [target]: mirrorControl(joint, source, length),
            }
          }),
        }
      })
    },
    [commit, nearestArcEnd, snapEnd],
  )

  const changeLink = useCallback(
    (id, patch, recordHistory = true) => {
      write(
        (d) => ({
          ...d,
          links: d.links.map((link) => (link.id === id ? { ...link, ...patch } : link)),
        }),
        recordHistory,
      )
    },
    [write],
  )

  const deleteLink = useCallback(
    (id) => {
      commit((d) => ({ ...d, links: d.links.filter((link) => link.id !== id) }))
      setSelection((current) => ({ ...current, link: current.link === id ? null : current.link }))
    },
    [commit],
  )

  const selectLink = useCallback((id) => setSelection({ items: [], link: id }), [])

  const activateItem = useCallback(
    (id, additive = false) => {
      if (toolRef.current !== 'link') {
        // Un bloc déjà sélectionné le reste : on peut glisser tout le lot.
        if (!additive && selectionRef.current.items.includes(id)) return
        selectItems([id], additive)
        return
      }
      const from = pendingRef.current?.fromId
      if (!from) {
        const item = docRef.current.items.find((candidate) => candidate.id === id)
        setPending({ fromId: id, point: { x: item.x + item.w / 2, y: item.y + item.h / 2 } })
        return
      }
      if (from === id) {
        setPending(null)
        return
      }
      const link = {
        id: newId(),
        from,
        to: id,
        arrow: arrowRef.current,
        color: colorRef.current,
        width: 2,
      }
      commit((d) => ({ ...d, links: [...d.links, link] }))
      setPending(null)
      setSelection({ items: [], link: link.id })
    },
    [commit, selectItems],
  )

  /* ---------- interactions pointeur ---------- */

  const localPoint = (event) => {
    const rect = containerRef.current.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /** Abandonne ce qui vient d'être commencé : un deuxième doigt annule le geste en cours. */
  const cancelPending = () => {
    if (liveStroke.current) {
      liveStroke.current = null
      painters.current.paintStrokes()
    }
    bandRef.current = null
    setBand(null)
    draftRef.current = null
    setDraft(null)
    pan.current = null
    setPanning(false)
  }

  const startGesture = () => {
    const [a, b] = [...touches.current.values()]
    gesture.current = {
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      view: viewRef.current,
    }
  }

  const applyGesture = () => {
    const state = gesture.current
    if (!state || touches.current.size < 2) return
    const [a, b] = [...touches.current.values()]

    const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.view.scale * (distance / state.distance)))
    const ratio = scale / state.view.scale

    setView({
      scale,
      x: middle.x - (state.middle.x - state.view.x) * ratio,
      y: middle.y - (state.middle.y - state.view.y) * ratio,
    })
  }

  const onPointerDown = (event) => {
    if (event.pointerType === 'pen') penDown.current = true

    if (event.pointerType === 'touch') {
      // Le stylet a la priorité : la paume et les doigts ne perturbent pas le tracé.
      if (penDown.current) {
        ignored.current.add(event.pointerId)
        return
      }

      touches.current.set(event.pointerId, localPoint(event))
      if (touches.current.size >= 2) {
        // Deux doigts : on annule ce que le premier avait amorcé et on navigue.
        cancelPending()
        for (const id of touches.current.keys()) ignored.current.add(id)
        startGesture()
        return
      }
    }

    // Alt (Option) + clic : on pointe l'endroit, quel que soit l'outil, sans rien changer.
    if (event.altKey && event.button === 0 && sessionRef.current) {
      const at = toWorld(event.clientX, event.clientY)
      const session = sessionRef.current
      addPing(at, session.self.color, peerName)
      session.send({ t: 'mark', x: at.x, y: at.y, color: session.self.color, name: peerName })
      return
    }

    setEditingId(null)
    setMenu(null)
    if (!(toolRef.current === 'select' && event.shiftKey)) clearSelection()
    setNodeMenu(null)
    if (pendingRef.current) setPending(null)

    const current = toolRef.current

    if (current === 'group') {
      // Teinte dédiée (en rotation) plutôt que la couleur du crayon.
      const used = docRef.current.items.filter((item) => item.type === 'group').length
      const group = groupItem(toWorld(event.clientX, event.clientY), GROUP_TINTS[used % GROUP_TINTS.length])
      commit((d) => ({ ...d, items: [...d.items, group] }))
      setTool('select')
      setSelection({ items: [group.id], link: null })
      return
    }

    const isPan =
      event.button === 1 ||
      event.button === 2 ||
      spaceDown.current ||
      current === 'hand' ||
      current === 'link'

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Le pointeur peut déjà être relâché (stylet qui quitte la surface) : sans gravité.
    }

    // Glisser sur le vide en mode sélection : rectangle de sélection.
    if (current === 'select' && !isPan && event.button === 0) {
      const at = toWorld(event.clientX, event.clientY)
      bandRef.current = { from: at, to: at, additive: event.shiftKey }
      setBand({ ...bandRef.current })
      return
    }

    if (current === 'shape' && event.button === 0) {
      const at = toWorld(event.clientX, event.clientY)
      const kind = shapeRef.current
      draftRef.current =
        kind === 'free'
          ? { free: true, points: [at] }
          : kind === 'arc'
            ? { arc: true, from: snapEnd(at), to: at }
            : { from: at, to: at }
      setDraft({ ...draftRef.current })
      return
    }

    if (isPan) {
      pan.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: viewRef.current,
      }
      setPanning(true)
      return
    }
    if (event.button !== 0) return

    liveStroke.current = {
      id: newId(),
      tool: current,
      color: colorRef.current,
      size: sizeRef.current,
      points: [toWorld(event.clientX, event.clientY)],
    }
    paintStrokes()
  }

  const onPointerMove = (event) => {
    if (event.pointerType === 'touch' && touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, localPoint(event))
      if (gesture.current) {
        const move = nextMove.current ?? {}
        move.gesture = true
        nextMove.current = move
        scheduleFrame()
        return
      }
      if (ignored.current.has(event.pointerId)) return
    }
    if (event.pointerType === 'touch' && ignored.current.has(event.pointerId)) return

    pointerScreen.current = { x: event.clientX, y: event.clientY }

    // Secouer la souris fait grossir son curseur chez les autres.
    if (sessionRef.current) {
      const now = event.timeStamp || Date.now()
      if (shakeDetector.current.push(event.clientX, event.clientY, now) && now - shakeSentAt.current > 400) {
        shakeSentAt.current = now
        sessionRef.current.send({ t: 'shake' })
      }
    }
    const move = nextMove.current ?? {}

    if (pendingRef.current && !pan.current) move.link = toWorld(event.clientX, event.clientY)

    if (pan.current && pan.current.id === event.pointerId) {
      move.pan = pan.current
      move.x = event.clientX
      move.y = event.clientY
    } else if (bandRef.current) {
      move.band = toWorld(event.clientX, event.clientY)
    } else if (draftRef.current) {
      move.draft = toWorld(event.clientX, event.clientY)
    } else if (liveStroke.current) {
      const coalesced = event.nativeEvent.getCoalescedEvents?.()
      const events = coalesced?.length ? coalesced : [event.nativeEvent]
      const fresh = events.map((e) => toWorld(e.clientX, e.clientY))
      liveStroke.current.points.push(...fresh)
      move.paint = true
    }

    if (sessionRef.current) move.cursor = toWorld(event.clientX, event.clientY)

    nextMove.current = move
    scheduleFrame()
  }

  const endPointer = (event) => {
    if (event.pointerType === 'pen') penDown.current = false

    if (event.pointerType === 'touch') {
      touches.current.delete(event.pointerId)
      if (touches.current.size < 2) gesture.current = null
      if (ignored.current.has(event.pointerId)) {
        ignored.current.delete(event.pointerId)
        // Le doigt restant après un pincement ne doit pas se mettre à dessiner.
        if (touches.current.size === 0) ignored.current.clear()
        return
      }
    }

    const selecting = bandRef.current
    if (selecting) {
      bandRef.current = null
      setBand(null)
      const rect = normalizeRect(selecting.from, selecting.to)

      // Clic sec dans le vide pendant une session : on pointe l'endroit pour les autres.
      if (rect.w <= 3 && rect.h <= 3 && sessionRef.current) {
        const session = sessionRef.current
        addPing(selecting.from, session.self.color, peerName)
        session.send({
          t: 'mark',
          x: selecting.from.x,
          y: selecting.from.y,
          color: session.self.color,
          name: peerName,
        })
      }

      if (rect.w > 3 || rect.h > 3) {
        const hits = docRef.current.items
          .filter(
            (item) =>
              item.x < rect.x + rect.w &&
              item.x + item.w > rect.x &&
              item.y < rect.y + rect.h &&
              item.y + item.h > rect.y,
          )
          .map((item) => item.id)
        if (hits.length) selectItems(hits, selecting.additive)
      }
      return
    }

    const sketchDraft = draftRef.current
    if (sketchDraft) {
      draftRef.current = null
      setDraft(null)
      if (sketchDraft.arc) {
        const from = sketchDraft.from
        const to = snapEnd(sketchDraft.to)
        const a = resolveEnd(from, itemsById()) ?? sketchDraft.to
        const b = resolveEnd(to, itemsById()) ?? sketchDraft.to
        if (Math.hypot(b.x - a.x, b.y - a.y) > 12) {
          const link = {
            id: newId(),
            kind: 'arc',
            from,
            to,
            ...defaultControls(a, b),
            color: colorRef.current,
            width: sizeRef.current,
            arrow: arrowRef.current === 'none' ? 'none' : arrowRef.current,
          }
          commit((d) => ({ ...d, links: [...d.links, link] }))
          setTool('select')
          setSelection({ items: [], link: link.id })
        }
        return
      }

      if (sketchDraft.free) {
        const shape = freeShape({
          id: newId(),
          points: sketchDraft.points,
          color: colorRef.current,
          strokeWidth: sizeRef.current,
          filled: filledRef.current,
        })
        if (shape) addItems([shape])
        return
      }

      const drawn = normalizeRect(sketchDraft.from, sketchDraft.to)
      // Un simple clic pose une forme de taille par défaut.
      const rect = isTooSmall(drawn)
        ? {
            x: Math.round(sketchDraft.from.x - DEFAULT_SHAPE_SIZE.w / 2),
            y: Math.round(sketchDraft.from.y - DEFAULT_SHAPE_SIZE.h / 2),
            ...DEFAULT_SHAPE_SIZE,
          }
        : drawn
      addItems([
        shapeItem({
          id: newId(),
          kind: shapeRef.current,
          rect,
          color: colorRef.current,
          strokeWidth: sizeRef.current,
          filled: filledRef.current,
        }),
      ])
      return
    }

    if (pan.current && pan.current.id === event.pointerId) {
      pan.current = null
      setPanning(false)
      return
    }
    const stroke = liveStroke.current
    liveStroke.current = null
    if (stroke) commit((d) => ({ ...d, strokes: [...d.strokes, stroke] }))
  }

  const flushMove = useCallback(() => {
    frame.current = 0
    const move = nextMove.current
    nextMove.current = null
    if (!move) return

    if (move.pan) {
      const { startX, startY, origin } = move.pan
      setView({ ...origin, x: origin.x + (move.x - startX), y: origin.y + (move.y - startY) })
    }
    if (move.link) {
      setPending((current) => (current ? { ...current, point: move.link } : current))
    }
    if (move.scroll) {
      setView((prev) => ({ ...prev, x: prev.x - move.scroll.dx, y: prev.y - move.scroll.dy }))
    }
    if (move.zoom) {
      zoomRef.current(move.zoom.x, move.zoom.y, move.zoom.factor)
    }
    if (move.band && bandRef.current) {
      bandRef.current = { ...bandRef.current, to: move.band }
      setBand({ ...bandRef.current })
    }
    if (move.draft && draftRef.current) {
      const current = draftRef.current
      if (current.arc) {
        draftRef.current = { ...current, to: move.draft }
        setDraft({ ...draftRef.current })
      } else if (current.free) {
        const last = current.points.at(-1)
        // On ne garde que les points qui apportent quelque chose.
        if (Math.hypot(move.draft.x - last.x, move.draft.y - last.y) > 3 / viewRef.current.scale) {
          current.points.push(move.draft)
          setDraft({ ...current, points: [...current.points] })
        }
      } else {
        draftRef.current = { ...current, to: move.draft }
        setDraft({ ...draftRef.current })
      }
    }
    if (move.cursor) {
      sessionRef.current?.send({
        t: 'cursor',
        x: move.cursor.x,
        y: move.cursor.y,
        tool: toolRef.current,
      })
    }
    if (move.gesture) applyGestureRef.current()
    if (move.paint) painters.current.paintStrokes()
  }, [])

  const applyGestureRef = useRef(null)
  applyGestureRef.current = applyGesture

  const scheduleFrame = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(flushMove)
  }, [flushMove])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const zoomAt = useCallback((clientX, clientY, factor) => {
    setView((prev) => {
      const rect = containerRef.current.getBoundingClientRect()
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))
      const ratio = scale / prev.scale
      const px = clientX - rect.left
      const py = clientY - rect.top
      return {
        scale,
        x: px - (px - prev.x) * ratio,
        y: py - (py - prev.y) * ratio,
      }
    })
  }, [])

  const zoomRef = useRef(zoomAt)
  zoomRef.current = zoomAt

  // wheel non passif : on ne peut pas passer par la prop React onWheel. Les trackpads
  // émettent plusieurs événements par image : on cumule et on applique une fois par image.
  useEffect(() => {
    const el = containerRef.current
    const onWheel = (event) => {
      event.preventDefault()
      const move = nextMove.current ?? {}
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.01)
        move.zoom = {
          x: event.clientX,
          y: event.clientY,
          factor: (move.zoom?.factor ?? 1) * factor,
        }
      } else {
        move.scroll = {
          dx: (move.scroll?.dx ?? 0) + event.deltaX,
          dy: (move.scroll?.dy ?? 0) + event.deltaY,
        }
      }
      nextMove.current = move
      scheduleFrame()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scheduleFrame])

  /* ---------- clavier, glisser-déposer, presse-papiers ---------- */

  const isTyping = (target) =>
    target instanceof HTMLElement &&
    (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)

  const deleteSelection = useCallback(() => {
    if (selection.link) deleteLink(selection.link)
    for (const id of selection.items) deleteItem(id)
  }, [selection, deleteItem, deleteLink])

  useEffect(() => {
    const onKeyDown = (event) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && !isTyping(event.target)) {
        const key = event.key.toLowerCase()
        if (key === 'z') {
          event.preventDefault()
          event.shiftKey ? redo() : undo()
          return
        }
        if (key === 'c') {
          copySelection()
          return
        }
        if (key === 'd') {
          event.preventDefault()
          duplicateSelection()
          return
        }
        if (key === 'a') {
          event.preventDefault()
          selectItems(docRef.current.items.map((item) => item.id))
          return
        }
        if (event.key === ']') {
          event.preventDefault()
          reorder(true)
          return
        }
        if (event.key === '[') {
          event.preventDefault()
          reorder(false)
          return
        }
      }
      if (isTyping(event.target) || mod) return

      if (event.code === 'Space' && !event.repeat) {
        spaceDown.current = true
        setPanning(true)
      }
      // La lettre du raccourci ne doit pas finir dans le champ qu'il vient d'ouvrir.
      const shortcuts = {
        v: () => setTool('select'),
        p: () => chooseTool('pen'),
        e: () => chooseTool('eraser'),
        h: () => setTool('hand'),
        l: () => setTool('link'),
        g: () => setTool('group'),
        s: () => chooseTool('shape'),
        t: () => addText('note'),
      }
      if (shortcuts[event.key]) {
        event.preventDefault()
        shortcuts[event.key]()
        return
      }
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        (selection.items.length || selection.link)
      ) {
        event.preventDefault()
        deleteSelection()
      }
      if (event.key === 'Enter' && sessionRef.current && !quick) {
        event.preventDefault()
        setQuick({ ...pointerScreen.current, text: '' })
        return
      }
      if (event.key === 'Escape') {
        clearSelection()
        setEditingId(null)
        setPending(null)
        setMenu(null)
        setNodeMenu(null)
      }
    }
    const onKeyUp = (event) => {
      if (event.code === 'Space') {
        spaceDown.current = false
        if (!pan.current) setPanning(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [
    quick,
    undo,
    redo,
    deleteSelection,
    selection,
    clearSelection,
    addText,
    chooseTool,
    copySelection,
    duplicateSelection,
    reorder,
    selectItems,
  ])

  useEffect(() => {
    const onPaste = (event) => {
      if (isTyping(event.target)) return

      const raw = event.clipboardData?.getData('text/plain')
      if (raw?.startsWith('{"moodboard/items"')) {
        event.preventDefault()
        try {
          pasteItems(JSON.parse(raw)['moodboard/items'])
          return
        } catch {
          /* on retombe sur le collage de texte */
        }
      }
      if (!raw && clipboard.current.length) {
        event.preventDefault()
        pasteItems(clipboard.current)
        return
      }

      const files = [...(event.clipboardData?.files ?? [])]
      if (files.length) {
        event.preventDefault()
        importFiles(files)
        return
      }
      const text = event.clipboardData?.getData('text/plain')
      if (text?.trim()) {
        event.preventDefault()
        addItems([codeItem(text, { name: 'collé', at: viewportCenter() })])
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [importFiles, addItems, viewportCenter, pasteItems])

  const onDrop = (event) => {
    event.preventDefault()
    setDropping(false)
    const at = toWorld(event.clientX, event.clientY)
    if (event.dataTransfer.files?.length) {
      importFiles(event.dataTransfer.files, at)
      return
    }
    const text = event.dataTransfer.getData('text/plain')
    if (text?.trim()) addItems([codeItem(text, { name: 'déposé', at })])
  }

  /* ---------- rendu ---------- */

  const resetView = () => setView({ x: 0, y: 0, scale: 1 })
  const linking = tool === 'link'
  const interactive = tool === 'select' || linking
  const selectedIds = selection.items
  const selectedItemId = selectedIds.length === 1 ? selectedIds[0] : null
  const selectedLinkId = selection.link
  const showArrows = linking || Boolean(selectedLinkId)

  const nodes = useMemo(() => doc.items.filter((item) => item.type === 'node'), [doc.items])

  const nodeInfo = useMemo(() => {
    const map = new Map()
    for (const node of nodes) {
      map.set(node.id, {
        progress: progressOf(nodes, node),
        leaf: childrenOf(nodes, node.id).length === 0,
      })
    }
    return map
  }, [nodes])

  const nodeBranches = useMemo(() => branches(nodes), [nodes])

  // Les zones de groupe se dessinent derrière les blocs.
  const ordered = useMemo(() => {
    const groups = doc.items.filter((item) => item.type === 'group')
    return groups.length ? [...groups, ...doc.items.filter((item) => item.type !== 'group')] : doc.items
  }, [doc.items])

  const selectedGroup = useMemo(
    () =>
      doc.items.find((item) => item.id === selectedItemId && item.type === 'group') ?? null,
    [doc.items, selectedItemId],
  )

  const selectedShape = useMemo(
    () => doc.items.find((item) => item.id === selectedItemId && item.type === 'shape') ?? null,
    [doc.items, selectedItemId],
  )

  const selectedSketch = useMemo(
    () => doc.items.find((item) => item.id === selectedItemId && item.type === 'sketch') ?? null,
    [doc.items, selectedItemId],
  )

  const selectedText = useMemo(
    () => doc.items.find((item) => item.id === selectedItemId && item.type === 'text') ?? null,
    [doc.items, selectedItemId],
  )

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedItemId) ?? null,
    [nodes, selectedItemId],
  )

  /** L'arc choisi et ceux qui lui sont raccordés : leurs poignées s'affichent ensemble. */
  const editedArcs = useMemo(() => {
    const chosen = doc.links.find((link) => link.id === selectedLinkId && link.kind === 'arc')
    if (!chosen) return []
    const neighbours = Object.values(chosen.joins ?? {})
      .map((join) => doc.links.find((link) => link.id === join.arc))
      .filter(Boolean)
    return [chosen, ...neighbours]
  }, [doc.links, selectedLinkId])

  // Aperçu de l'arc en cours de tracé.
  const arcPreview = useMemo(() => {
    if (!draft?.arc) return null
    const byId = new Map(doc.items.map((item) => [item.id, item]))
    const from = resolveEnd(draft.from, byId)
    const to = draft.to
    if (!from || !to) return null
    return { from, to, ...defaultControls(from, to) }
  }, [draft, doc.items])

  const pendingLink = useMemo(() => {
    if (!pending) return null
    const from = doc.items.find((item) => item.id === pending.fromId)
    return from ? { from, point: pending.point } : null
  }, [pending, doc.items])

  const cursor = panning
    ? 'grabbing'
    : tool === 'hand'
      ? 'grab'
      : tool === 'select'
        ? 'default'
        : linking
          ? 'cell'
          : 'crosshair'

  const statusLabel = { loading: '…', saving: 'Enregistrement…', saved: 'Enregistré', error: 'Non enregistré' }[status]

  const pickColor = (value) => {
    setColor(value)
    if (selectedLinkId) {
      changeLink(selectedLinkId, { color: value })
    } else if (selectedGroup) {
      changeItem(selectedGroup.id, { color: value }, true)
    } else if (selectedShape) {
      changeItem(selectedShape.id, { color: value }, true)
    } else if (selectedText) {
      changeItem(selectedText.id, { color: value }, true)
    } else if (selectedNode) {
      // Recolorer un nœud recolore sa branche.
      const painted = new Set(subtree(nodes, selectedNode.id).map((node) => node.id))
      commit((d) => ({
        ...d,
        items: d.items.map((item) => (painted.has(item.id) ? { ...item, color: value } : item)),
      }))
    } else if (!linking && tool !== 'group') {
      setTool('pen')
    }
  }

  /** Choisir une forme : réglage par défaut, et forme sélectionnée le cas échéant. */
  const pickShape = (kind) => {
    setShape(kind)
    setTool('shape')
    if (selectedShape) {
      changeItem(
        selectedShape.id,
        { kind, filled: selectedShape.filled && CLOSED.has(kind) },
        true,
      )
    }
  }

  const pickSize = (value) => {
    setSize(value)
    if (selectedShape) changeItem(selectedShape.id, { strokeWidth: value }, true)
  }

  /**
   * Change le moteur d'un bloc visuel depuis la barre de réglages : on réécrit la
   * directive du code, et on repart du modèle si celui-ci n'a jamais été touché.
   */
  const setSketchMode = (mode) => {
    if (!selectedSketch) return
    const current = parseMode(selectedSketch.code, selectedSketch.mode)
    if (current === mode) return

    const untouched = selectedSketch.code.trim() === SKETCH_TEMPLATES[current]?.trim()
    changeItem(
      selectedSketch.id,
      { mode, code: untouched ? SKETCH_TEMPLATES[mode] : withMode(selectedSketch.code, mode) },
      true,
    )
  }

  const pickTextSize = (value) => {
    if (selectedText) changeItem(selectedText.id, { size: value }, true)
  }

  const toggleTextVariant = () => {
    if (!selectedText) return
    changeItem(selectedText.id, { variant: selectedText.variant === 'note' ? 'plain' : 'note' }, true)
  }

  const toggleFill = () => {
    if (selectedShape) {
      const next = !selectedShape.filled
      setFilled(next)
      changeItem(selectedShape.id, { filled: next }, true)
      return
    }
    setFilled((value) => !value)
  }

  const pickArrow = (value) => {
    setArrow(value)
    if (selectedLinkId) changeLink(selectedLinkId, { arrow: value })
  }

  // Infobulles maison : un petit texte qui suit la souris, à la place des raccourcis
  // autrefois affichés en permanence sur le tableau.
  const tipProps = (label, shortcut) => ({
    onPointerEnter: (event) => setTip({ label, shortcut, x: event.clientX, y: event.clientY }),
    onPointerMove: (event) =>
      setTip((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current)),
    onPointerLeave: () => setTip(null),
  })

  return (
    <div className="board">
      <div
        ref={containerRef}
        className={`board__surface ${dropping ? 'is-dropping' : ''}`}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={(e) => {
          e.preventDefault()
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        <canvas ref={gridRef} className="board__canvas" />

        <Links
          links={doc.links}
          items={doc.items}
          branches={nodeBranches}
          view={view}
          arc={arcPreview}
          selectedId={selectedLinkId}
          interactive={interactive}
          pending={pendingLink}
          onSelect={selectLink}
        />

        <div
          ref={itemsRef}
          className="board__items"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            '--inv': 1 / view.scale,
          }}
        >
          {ordered.map((item) => (
            <BoardItem
              key={item.id}
              item={item}
              scale={view.scale}
              selected={selectedIds.includes(item.id)}
              soloSelected={selectedItemId === item.id}
              editing={editingId === item.id}
              interactive={interactive}
              draggable={tool === 'select'}
              linkTarget={linking}
              tween={tween}
              toWorld={toWorld}
              onSelect={activateItem}
              onChange={changeItem}
              onEdit={setEditingId}
              onDelete={deleteItem}
              onExport={exportSketch}
              onDragEnd={onItemDragEnd}
              onSnap={snap}
              onMenu={openItemMenu}
              onToggleDone={toggleDone}
              progress={nodeInfo.get(item.id)?.progress}
              leaf={nodeInfo.get(item.id)?.leaf}
            />
          ))}
          <Pings pings={pings} />

          <RemoteCursors
            peers={peers}
            targets={cursorTargets}
            tools={peerTools}
            typing={typingPeers}
            bubbles={bubbles}
            shaking={shaking}
          />

          {editedArcs.map((arc) => (
            <ArcHandles
              key={arc.id}
              link={arc}
              items={doc.items}
              snap={arc.id === selectedLinkId ? arcSnap : null}
              toWorld={toWorld}
              onDrag={(key, point) => dragArc(arc.id, key, point)}
              onDrop={(key, point) => dropArc(arc.id, key, point)}
            />
          ))}

          {guides.map((guide, index) => (
            <span
              key={index}
              className={`guide guide--${guide.axis}`}
              style={
                guide.axis === 'x'
                  ? { left: guide.at, top: guide.from, height: guide.to - guide.from }
                  : { top: guide.at, left: guide.from, width: guide.to - guide.from }
              }
            />
          ))}

          {band &&
            (() => {
              const rect = normalizeRect(band.from, band.to)
              return (
                <div
                  className="band"
                  style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                />
              )
            })()}

          {draft?.free && draft.points.length > 1 &&
            (() => {
              const preview = freeShape({
                id: 'draft',
                points: draft.points,
                color,
                strokeWidth: size,
                filled,
              })
              if (!preview) return null
              return (
                <div
                  className="item item--draft"
                  style={{
                    left: preview.x,
                    top: preview.y,
                    width: preview.w,
                    height: preview.h,
                  }}
                >
                  <ShapeBlock item={preview} />
                </div>
              )
            })()}

          {draft && !draft.free && !draft.arc &&
            (() => {
              const rect = normalizeRect(draft.from, draft.to)
              const preview = shapeItem({
                id: 'draft',
                kind: shape,
                rect,
                color,
                strokeWidth: size,
                filled,
              })
              return (
                <div
                  className="item item--draft"
                  style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
                >
                  <ShapeBlock item={preview} />
                </div>
              )
            })()}
        </div>

        <canvas ref={drawRef} className="board__canvas" />
      </div>

      {tourStep !== null && (
        <Tour
          step={tourStep}
          onStep={(next) => (next < 0 || next >= STEPS.length ? closeTour() : setTourStep(next))}
          onClose={closeTour}
          actions={{ setTool: chooseTool }}
        />
      )}

      <ShareDialog
        open={share}
        onClose={() => setShare(false)}
        doc={doc}
        boardName={boardName}
        session={session}
        peers={peers}
        name={peerName}
        setName={setPeerName}
        status={liveStatus}
        error={liveError}
        onImportCode={importCode}
        onHost={() => connect({ host: true })}
        onJoin={(code) => connect({ host: false, code })}
        onLeave={leaveSession}
      />

      {session && quick && (
        <QuickChat
          at={quick}
          value={quick.text}
          onChange={(text) => {
            setQuick((current) => (current ? { ...current, text } : current))
            setTyping(text.length > 0)
          }}
          onSend={() => {
            sendChat(quick.text)
            setQuick(null)
          }}
          onClose={() => {
            setQuick(null)
            setTyping(false)
          }}
        />
      )}

      {session && (
        <ChatRail
          self={{ name: peerName, color: session.self.color }}
          peers={peers}
          messages={chat}
          unread={unread}
          onOpen={() => setUnread(0)}
          onSend={sendChat}
          onTyping={setTyping}
        />
      )}

      <BoardRail
        boards={boards}
        currentId={boardId}
        onSwitch={(id) => openBoard(id)}
        onCreate={() => createBoard()}
        onRename={renameBoard}
        onDuplicate={duplicateBoard}
        onDelete={removeBoard}
        onExportPng={() => savePng(false)}
        onExportSelection={() => savePng(true)}
        onExportJson={saveJson}
        onImportJson={importJson}
        onShare={() => setShare(true)}
        onTour={() => setTourStep(0)}
        live={Boolean(session)}
        hasSelection={selectedIds.length > 0}
      />

      <Toolbar
        tool={tool}
        setTool={chooseTool}
        shape={shape}
        setShape={setShape}
        menu={menu}
        setMenu={setMenu}
        color={color}
        size={size}
        arrow={arrow}
        filled={filled}
        textSizes={TEXT_SIZES}
        history={history}
        tipProps={tipProps}
        selectedCount={selectedIds.length}
        selectedShape={selectedShape}
        selectedGroup={selectedGroup}
        selectedText={selectedText}
        selectedSketch={selectedSketch}
        sketchMode={selectedSketch ? parseMode(selectedSketch.code, selectedSketch.mode) : null}
        selectedNode={selectedNode}
        nodeLayout={
          selectedNode
            ? rootOf(nodes, selectedNode)?.layout ?? 'mindmap'
            : null
        }
        showArrows={showArrows}
        actions={{
          pickColor,
          pickShape,
          pickSize,
          pickTextSize,
          pickArrow,
          toggleFill,
          toggleTextVariant,
          setSketchMode,
          toggleAutoSort,
          sortGroupNow,
          setNodeLayout,
          applyAlign,
          addText,
          addCodeBlock,
          addSketch,
          addMindmap,
          openFiles: () => fileInputRef.current?.click(),
          undo,
          redo,
          clear,
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,text/*,.js,.jsx,.ts,.tsx,.py,.json,.css,.html,.md,.yml,.yaml,.sh,.sql,.go,.rs"
        hidden
        onChange={(event) => {
          importFiles(event.target.files)
          event.target.value = ''
        }}
      />

      <div className="zoom">
        <button onClick={() => zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.2)} {...tipProps('Dézoomer')}>
          <IconMinus size={16} />
        </button>
        <button className="zoom__label" onClick={resetView} {...tipProps('Réinitialiser la vue')}>
          {Math.round(view.scale * 100)}%
        </button>
        <button onClick={() => zoomAt(innerWidth / 2, innerHeight / 2, 1.2)} {...tipProps('Zoomer')}>
          <IconPlus size={16} />
        </button>
      </div>

      {doc.items.length > 0 && (
        <Minimap
          items={doc.items}
          view={view}
          viewport={viewport}
          onGoto={(point) =>
            setView((prev) => ({
              ...prev,
              x: viewport.w / 2 - point.x * prev.scale,
              y: viewport.h / 2 - point.y * prev.scale,
            }))
          }
        />
      )}

      <p className={`status status--${status}`}>{statusLabel}</p>

      {notice && <p className="notice">{notice}</p>}

      {linking && (
        <p className="prompt">
          {pending ? 'Cliquez le bloc d’arrivée · Échap pour annuler' : 'Cliquez le bloc de départ'}
        </p>
      )}

      {nodeMenu && (
        <div
          className="context"
          style={{
            left: Math.min(nodeMenu.x, innerWidth - 210),
            top: Math.min(nodeMenu.y, innerHeight - 170),
          }}
        >
          {nodeMenu.type === 'node' && (
            <>
              <button onClick={() => addChild(nodeMenu.id)}>Créer un enfant</button>
              {nodeMenu.hasParent && (
                <button onClick={() => addSibling(nodeMenu.id)}>Créer un frère</button>
              )}
              <button
                onClick={() => {
                  setEditingId(nodeMenu.id)
                  setNodeMenu(null)
                }}
              >
                Renommer
              </button>
              <span className="context__sep" />
            </>
          )}
          <button
            onClick={() => {
              duplicateSelection()
              setNodeMenu(null)
            }}
          >
            Dupliquer <kbd>⌘D</kbd>
          </button>
          <button
            onClick={() => {
              reorder(true)
              setNodeMenu(null)
            }}
          >
            Premier plan
          </button>
          <button
            onClick={() => {
              reorder(false)
              setNodeMenu(null)
            }}
          >
            Arrière-plan
          </button>
          <span className="context__sep" />
          <button className="context__danger" onClick={() => deleteSelection()}>
            {nodeMenu.type === 'node' ? 'Supprimer la branche' : 'Supprimer'}
          </button>
        </div>
      )}

      {tip && (
        <div
          className="tip"
          style={{ left: Math.min(tip.x + 16, innerWidth - 220), top: tip.y - 36 }}
        >
          {tip.label}
          {tip.shortcut && <kbd>{tip.shortcut}</kbd>}
        </div>
      )}
    </div>
  )
}
