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
import PathHandles from './PathHandles.jsx'
import Tour, { STEPS } from './Tour.jsx'
import AccountDialog from './AccountDialog.jsx'
import * as cloud from '../lib/cloud.js'
import Search from './Search.jsx'
import Laser from './Laser.jsx'
import Timer from './Timer.jsx'
import Present from './Present.jsx'
import { decodeBoard } from '../lib/share.js'
import { makeCode, openSession, supabaseConfigured } from '../lib/session.js'
import { createShakeDetector } from '../lib/shake.js'
import { caretPoint } from '../lib/caret.js'
import { snapPosition } from '../lib/snap.js'
import { dilateIntoWalls, floodFill, traceOutline } from '../lib/bucket.js'
import { DASHABLE_BRUSHES, paintBrush } from '../lib/brushes.js'
import {
  followJoins,
  isClosed,
  moveHandle,
  nearestNode,
  nodesOf,
  normalizePath,
  pathData,
  simplifyPoints,
  projector,
  removeNode,
  splitSegment,
} from '../lib/paths.js'
import { loadSettings, saveSettings } from '../lib/settings.js'
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
  mapItem,
  markdownItem,
  tableItem,
  textItem,
} from '../lib/files.js'
import { autoLayout, contains, groupFor } from '../lib/groups.js'
import { fitView, frameItem, orderFrames } from '../lib/frames.js'
import { branches, childrenOf, layoutTree, progressOf, rootOf, subtree } from '../lib/mindmap.js'
import {
  CLOSED,
  DEFAULT_SHAPE_SIZE,
  endsFrom,
  DRAWN,
  constrain,
  freeShape,
  isTooSmall,
  normalizeRect,
  shapeItem,
  straighten,
} from '../lib/shapes.js'
import { DASHABLE, LINE_DASHES, dashPattern } from '../lib/dashes.js'
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

/** Écart minimal entre deux envois de synchronisation, et durée du glissé à l'arrivée. */
const SYNC_GAP = 70
const REMOTE_TWEEN = 150


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
  const accountRef = useRef(null)
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
  const [markerSize, setMarkerSize] = useState(20)
  const [eraserMode, setEraserMode] = useState('pixel') // 'pixel' ou 'stroke'
  const [linkStyle, setLinkStyle] = useState('curve') // 'curve', 'elbow' ou 'straight'
  const [dash, setDash] = useState('solid') // type de trait : plein, tirets, points…
  const [brush, setBrush] = useState('plain') // pinceau du crayon
  const [settings, setSettings] = useState(loadSettings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const [searching, setSearching] = useState(false)
  const [present, setPresent] = useState(null) // index de la scène montrée, ou rien
  const [timer, setTimer] = useState(null) // { endsAt } en marche, { left } en pause
  const [showTimer, setShowTimer] = useState(false)
  // Traînées du pointeur laser : la mienne et celle des autres, jamais enregistrées.
  const lasers = useRef(new Map())

  /** Ajoute un point à une traînée de laser. Elle s'éteindra d'elle-même. */
  const pressed = useRef(false)
  const presentRef = useRef(null)

  const trace = useCallback((id, point, color) => {
    const trail = lasers.current.get(id)
    const stamped = { x: point.x, y: point.y, at: performance.now() }
    if (trail) {
      trail.color = color
      trail.points.push(stamped)
    } else {
      lasers.current.set(id, { color, points: [stamped] })
    }
  }, [])
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
  const [account, setAccount] = useState(null) // compte connecté, ou null
  const [accountOpen, setAccountOpen] = useState(false)
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
  const markerRef = useRef(markerSize)
  const eraserModeRef = useRef(eraserMode)
  const previousTool = useRef('select')
  const erasing = useRef(false)
  const erasingRef = useRef(false)
  const arrowRef = useRef(arrow)
  const linkStyleRef = useRef(linkStyle)
  const dashRef = useRef(dash)
  const brushRef = useRef(brush)
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
  markerRef.current = markerSize
  eraserModeRef.current = eraserMode
  arrowRef.current = arrow
  linkStyleRef.current = linkStyle
  dashRef.current = dash
  brushRef.current = brush
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
    setTool((current) => {
      previousTool.current = current
      return next
    })
    setMenu(null)
    if (['pen', 'eraser', 'shape', 'marker'].includes(next)) {
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

  // Toute écriture locale incrémente ce compteur : la boucle d'envoi sait ainsi, sans
  // rien parcourir, s'il y a quelque chose à dire aux autres.
  const revision = useRef(0)
  const sentRevision = useRef(0)

  const write = useCallback((producer, recordHistory) => {
    if (recordHistory) {
      past.current.push(docRef.current)
      future.current = []
    }
    const next = producer(docRef.current)
    docRef.current = next
    revision.current += 1
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
    revision.current += 1
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
    revision.current += 1
    setDoc(restored)
    past.current = []
    future.current = []
    setHistory({ past: 0, future: 0 })
    setEditingId(null)
    setSelection({ items: [], link: null })
    if (saved?.view) setView(saved.view)
  }, [])

  const announceNotice = useCallback((text, sticky = false) => {
    setNotice(text)
    if (sticky) return
    setTimeout(() => setNotice((current) => (current === text ? null : current)), 6000)
  }, [])

  /* ---------- compte et tableaux en ligne ---------- */

  useEffect(() => {
    if (!cloud.configured()) return undefined
    let stop = null
    cloud
      .currentUser()
      .then((user) => {
        accountRef.current = user
        setAccount(user)
      })
      .catch(() => {})
    cloud.onAuthChange((user) => {
      accountRef.current = user
      setAccount(user)
    }).then((unsubscribe) => {
      stop = unsubscribe
    })
    return () => stop?.()
  }, [])

  /**
   * Rapproche la liste locale de celle du compte : les tableaux venus du serveur
   * apparaissent dans le rail, ceux d'ici obtiennent leur place en ligne.
   */
  const syncCloud = useCallback(
    async (user) => {
      if (!user) return
      try {
        const remote = await cloud.listBoards()
        const known = new Set(boardsRef.current.map((board) => board.cloudId).filter(Boolean))
        const arrivals = remote
          .filter((board) => !known.has(board.id))
          .map((board) => ({
            id: board.id,
            cloudId: board.id,
            name: board.name,
            preview: board.preview ?? null,
          }))

        const list = [...boardsRef.current, ...arrivals]
        boardsRef.current = list
        setBoards(list)
        await saveIndex({ boards: list, currentId: boardIdRef.current })
      } catch (error) {
        announceNotice(`Synchronisation impossible : ${error.message}`)
      }
    },
    [announceNotice],
  )

  useEffect(() => {
    if (account) syncCloud(account)
  }, [account, syncCloud])

  /** Envoie le tableau courant en ligne : images d'abord, document ensuite. */
  const pushBoard = useCallback(async (boardId, doc) => {
    const user = accountRef.current
    const entry = boardsRef.current.find((board) => board.id === boardId)
    if (!user || !entry) return

    // Le tableau garde la même place en ligne d'une session à l'autre.
    if (!entry.cloudId) {
      entry.cloudId = cloud.newCloudId()
      const list = boardsRef.current.map((board) =>
        board.id === boardId ? { ...board, cloudId: entry.cloudId } : board,
      )
      boardsRef.current = list
      setBoards(list)
      await saveIndex({ boards: list, currentId: boardIdRef.current })
    }

    const light = await cloud.uploadImages(doc, user.id)
    if (light !== doc) {
      // Les images sont devenues des adresses : la copie locale suit, sinon on
      // renverrait le même base64 à chaque enregistrement.
      if (boardId === boardIdRef.current) {
        docRef.current = { ...docRef.current, items: light.items }
        revision.current += 1
        setDoc(docRef.current)
      } else {
        await saveBoard(boardId, light)
      }
    }
    await cloud.saveBoard({
      id: entry.cloudId,
      owner: user.id,
      name: entry.name,
      doc: { strokes: light.strokes, items: light.items, links: light.links },
      preview: makePreview(light),
    })
  }, [])

  /** Un tableau connu du serveur mais pas encore ici : on va chercher son contenu. */
  const pullBoard = useCallback(async (entry) => {
    if (!entry?.cloudId || !accountRef.current) return null
    try {
      const remote = await cloud.fetchBoard(entry.cloudId)
      return remote?.doc ?? null
    } catch {
      return null
    }
  }, [])

  /** Tout envoyer : chaque tableau d'ici prend (ou reprend) sa place en ligne. */
  const pushAll = useCallback(async () => {
    if (!accountRef.current) throw new Error('Connectez-vous d’abord.')
    let done = 0
    for (const entry of [...boardsRef.current]) {
      const content =
        entry.id === boardIdRef.current ? docRef.current : await loadBoard(entry.id)
      if (!content) continue
      await pushBoard(entry.id, content)
      done += 1
    }
    return done
  }, [pushBoard])

  /** Tout récupérer : les tableaux du compte écrasent leur copie locale. */
  const pullAll = useCallback(async () => {
    if (!accountRef.current) throw new Error('Connectez-vous d’abord.')
    const remote = await cloud.listBoards()
    let list = [...boardsRef.current]
    let done = 0

    for (const board of remote) {
      const full = await cloud.fetchBoard(board.id)
      if (!full?.doc) continue

      const known = list.find((entry) => entry.cloudId === board.id)
      const id = known?.id ?? newBoardId()
      await saveBoard(id, full.doc)
      const entry = { ...known, id, cloudId: board.id, name: board.name, preview: board.preview ?? null }
      list = known ? list.map((item) => (item.id === id ? entry : item)) : [...list, entry]
      // Le tableau ouvert doit montrer ce qu'on vient de récupérer.
      if (id === boardIdRef.current) applyDoc(full.doc)
      done += 1
    }

    boardsRef.current = list
    setBoards(list)
    await saveIndex({ boards: list, currentId: boardIdRef.current })
    return done
  }, [applyDoc])

  /** Les identifiants en ligne ne pointent plus sur rien : on les retire de l'index. */
  const forgetCloudIds = useCallback(async () => {
    const list = boardsRef.current.map(({ cloudId, ...board }) => board)
    boardsRef.current = list
    setBoards(list)
    await saveIndex({ boards: list, currentId: boardIdRef.current })
  }, [])

  /** Efface tout ce que le compte garde en ligne, sans toucher aux tableaux d'ici. */
  const wipeCloud = useCallback(async () => {
    const user = accountRef.current
    if (!user) throw new Error('Connectez-vous d’abord.')
    const count = await cloud.wipeCloud(user.id)
    await forgetCloudIds()
    return count
  }, [forgetCloudIds])

  /** Supprime le compte lui-même. Les tableaux de ce navigateur restent. */
  const deleteAccount = useCallback(async () => {
    if (!accountRef.current) throw new Error('Connectez-vous d’abord.')
    await cloud.deleteAccount()
    await forgetCloudIds()
  }, [forgetCloudIds])

  const publicLink = useCallback(async () => {
    const user = accountRef.current
    const entry = boardsRef.current.find((board) => board.id === boardIdRef.current)
    if (!user || !entry) {
      announceNotice('Connectez-vous pour partager un lien.')
      return
    }
    try {
      await pushBoard(entry.id, docRef.current)
      const id = boardsRef.current.find((board) => board.id === entry.id)?.cloudId
      await cloud.publishBoard(id, true)
      const link = `${window.location.origin}${window.location.pathname}#b=${id}`
      await navigator.clipboard?.writeText(link)
      announceNotice('Lien copié : ce tableau est visible par qui l’ouvre.')
    } catch (error) {
      announceNotice(`Partage impossible : ${error.message}`)
    }
  }, [announceNotice, pushBoard])

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
      if (accountRef.current) {
        pushBoard(boardId, docRef.current).catch((error) =>
          announceNotice(`Enregistrement en ligne impossible : ${error.message}`),
        )
      }
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
      const entry = list.find((board) => board.id === id)
      const saved = (await loadBoard(id)) ?? (await pullBoard(entry))
      boardIdRef.current = id
      setBoardId(id)
      applyDoc(saved)
      await commitIndex(list, id)
    },
    [applyDoc, boards, commitIndex, pullBoard],
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
      if (accountRef.current) pushBoard(boardId, docRef.current).catch(() => {})
    },
    [boards, boardId, commitIndex, pushBoard],
  )

  const duplicateBoard = useCallback(() => {
    const current = boards.find((board) => board.id === boardId)
    createBoard(`${current?.name ?? 'Tableau'} (copie)`, { ...docRef.current })
  }, [boards, boardId, createBoard])

  const removeBoard = useCallback(async () => {
    if (boards.length < 2) return
    const list = boards.filter((board) => board.id !== boardId)
    const cloudId = boards.find((board) => board.id === boardId)?.cloudId
    await deleteBoard(boardId)
    if (cloudId && accountRef.current) cloud.removeBoard(cloudId).catch(() => {})
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
          if (message.items?.length && Date.now() - lastLocalEdit.current > 260) {
            setTween(true)
            clearTimeout(tweenTimer.current)
            tweenTimer.current = setTimeout(() => setTween(false), REMOTE_TWEEN)
          }
          break
        }

        case 'cursor':
          cursorTargets.current.set(from, { x: message.x, y: message.y })
          if (message.tool === 'laser') {
            trace(from, message, peers.find((peer) => peer.id === from)?.color ?? '#ff3b30')
          }
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

        case 'timer':
          setTimer(message.timer)
          setShowTimer(Boolean(message.timer))
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

  const connect = useCallback(
    async ({ host, code, silent }) => {
      setLiveError(null)
      setLiveStatus('connecting')
      try {
        const handle = await openSession({
          // Supabase tient le canal ; le pair-à-pair reste sous l'interrupteur.
          transport: settingsRef.current.p2p ? 'p2p' : 'supabase',
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

  // Un lien partagé ouvre une copie du tableau visé.
  useEffect(() => {
    const shared = window.location.hash.match(/#b=([0-9a-f-]{36})/i)?.[1]
    if (!shared || !cloud.configured()) return
    window.history.replaceState(null, '', window.location.pathname)
    cloud
      .fetchBoard(shared)
      .then((board) => {
        if (!board?.doc) throw new Error('Tableau introuvable ou privé')
        return createBoardRef.current(board.name ?? 'Tableau partagé', board.doc)
      })
      .catch((error) => announceNotice(error.message))
  }, [announceNotice])

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


  /**
   * Envoi au fil de l'eau. Le battement fixe de trois fois par seconde était une
   * précaution du temps du pair-à-pair, où un envoi de trop suffisait à engorger la
   * liaison. Supabase Realtime encaisse sans broncher : on part donc dès qu'il y a
   * quelque chose à dire, avec un écart minimal entre deux envois — une quinzaine par
   * seconde quand ça bouge, et pas un message à l'arrêt.
   */
  useEffect(() => {
    if (!session) return undefined
    let frame = 0
    let last = 0

    const tick = () => {
      frame = requestAnimationFrame(tick)
      // Un invité attend le tableau de l'hôte avant d'émettre le sien (vérifié à chaque
      // image : la valeur arrive après la mise en place de la boucle).
      if (!session.isHost && !gotRemoteDoc.current) return

      // Rien n'a bougé, sauf peut-être le trait en cours de tracé.
      if (revision.current === sentRevision.current && !liveStroke.current) return
      const now = performance.now()
      if (now - last < SYNC_GAP) return

      const mark = revision.current
      const digest = buildDigest()
      sentRevision.current = mark
      if (!digest) return
      session.send({ t: 'sync', ...digest })
      last = now
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
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
    // Grille masquée dans les réglages : le fond reste blanc, le tableau reste infini.
    if (step < 6 || !settingsRef.current.grid) return

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
    if (stroke.tool === 'marker') {
      // Surligneur : translucide et multiplié, comme un feutre sur du papier.
      ctx.globalAlpha = 0.35
      ctx.globalCompositeOperation = 'multiply'
      ctx.strokeStyle = stroke.color
    } else if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
    }
    ctx.fillStyle = ctx.strokeStyle

    const width = Math.max(0.5, stroke.size * scale)
    // La pression suit la projection : c'est elle qui commande l'épaisseur du pinceau.
    const points = pts.map((point) => ({
      x: point.x * scale + x,
      y: point.y * scale + y,
      p: point.p,
    }))
    // La gomme et le surligneur posent toujours un trait plein : leur matière leur
    // vient de leur mode de fusion, pas du pinceau choisi pour le crayon.
    const brushed = stroke.tool === 'pen' ? stroke : { ...stroke, brush: 'plain' }
    paintBrush(ctx, brushed, points, width)

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

    // Le surligneur passe dessous : on peint d'abord les feutres, puis l'encre.
    const ordered = [
      ...doc.strokes.filter((stroke) => stroke.tool === 'marker'),
      ...doc.strokes.filter((stroke) => stroke.tool !== 'marker'),
    ]
    for (const stroke of ordered) {
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
    // `settings.grid` : la grille doit se rallumer sans attendre un déplacement de la vue.
  }, [view, settings.grid, paintGrid, paintStrokes])

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
            // Un cadre emporte la scène qu'il délimite : tout ce dont le centre est dedans.
            if (item.type === 'frame') {
              for (const inside of d.items) {
                if (inside.id === rootId || inside.type === 'frame') continue
                const middle = { x: inside.x + inside.w / 2, y: inside.y + inside.h / 2 }
                if (contains(item, middle)) set.add(inside.id)
              }
            }
          }
          set.delete(id)
          moving = set.size ? set : null
        }

        let items = d.items.map((item) => {
          if (item.id === id) return { ...item, ...patch }
          if (moving?.has(item.id)) return { ...item, x: item.x + dx, y: item.y + dy }
          return item
        })

        // Les nœuds raccordés à ce qui vient de bouger suivent le mouvement.
        if (dx || dy) {
          const carried = new Set([id, ...(moving ?? [])])
          items = followJoins(items, carried, dx, dy)
        }

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

  /**
   * Image de ce qui est dessiné à l'écran, en pixels CSS : les traits tels qu'ils sont
   * déjà peints, les contours des formes, et les blocs opaques. C'est le mur contre
   * lequel le seau vient buter.
   */
  const rasterizeBoard = useCallback(() => {
    const canvas = document.createElement('canvas')
    canvas.width = innerWidth
    canvas.height = innerHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    // Les traits sont déjà peints : on recopie leur calque plutôt que de tout refaire.
    if (drawRef.current) {
      ctx.drawImage(drawRef.current, 0, 0, innerWidth, innerHeight)
    }

    const { x, y, scale } = viewRef.current
    ctx.fillStyle = '#000'
    ctx.strokeStyle = '#000'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (const item of docRef.current.items) {
      // Les zones de groupe, les cadres et les gommettes ne barrent pas le passage.
      if (item.type === 'group' || item.type === 'frame' || item.type === 'dot') continue

      if (item.type === 'shape') {
        const nodes = nodesOf(item)
        if (nodes.length < 2) continue
        const pad = Math.max(1, item.strokeWidth ?? 3) / 2 + 1
        const project = (point) => ({
          x: (item.x + pad + point.x * Math.max(0, item.w - pad * 2)) * scale + x,
          y: (item.y + pad + point.y * Math.max(0, item.h - pad * 2)) * scale + y,
        })
        ctx.lineWidth = Math.max(1, (item.strokeWidth ?? 3) * scale)
        const path = new Path2D(pathData(nodes, isClosed(item), project))
        ctx.stroke(path)
        if (item.filled) ctx.fill(path)
        continue
      }

      ctx.fillRect(item.x * scale + x, item.y * scale + y, item.w * scale, item.h * scale)
    }

    return ctx.getImageData(0, 0, innerWidth, innerHeight)
  }, [])

  /** Le point est-il à l'intérieur du tracé de cette forme, et pas seulement de sa boîte ? */
  const insideShape = useCallback((item, point) => {
    if (item.type !== 'shape' || !isClosed(item)) return false
    const nodes = nodesOf(item)
    if (nodes.length < 3) return false
    const pad = Math.max(1, item.strokeWidth ?? 3) / 2 + 1
    const project = (entry) => ({
      x: item.x + pad + entry.x * Math.max(0, item.w - pad * 2),
      y: item.y + pad + entry.y * Math.max(0, item.h - pad * 2),
    })
    const probe = document.createElement('canvas').getContext('2d')
    return probe.isPointInPath(new Path2D(pathData(nodes, true, project)), point.x, point.y)
  }, [])

  /**
   * Seau. Une forme fermée cliquée en plein milieu se remplit elle-même — c'est son
   * fond, pas une tache posée dessus. Partout ailleurs, la peinture se répand depuis le
   * point cliqué jusqu'à buter sur ce qui est dessiné, et le contour de la tache devient
   * une forme : elle reste nette à tous les zooms, et se retouche comme les autres.
   */
  const fillAt = useCallback(
    (screen, point) => {
      const shape = [...docRef.current.items]
        .reverse()
        .find((item) => insideShape(item, point))
      if (shape) {
        // Le fond a sa propre couleur : le contour de la forme n'est pas repeint.
        // Le seau peint franchement, là où la case « remplir » ne fait que teinter.
        changeItem(shape.id, { fill: colorRef.current, filled: true, solid: true }, true)
        return
      }

      const image = rasterizeBoard()
      const result = floodFill(
        image.data,
        image.width,
        image.height,
        Math.round(screen.x),
        Math.round(screen.y),
      )

      if (result.blocked) return
      if (result.escaped || !result.filled) {
        setNotice('Zone ouverte : la peinture s’échappe')
        setTimeout(() => setNotice(null), 1800)
        return
      }

      // La tache glisse sous les traits qui l'arrêtent : sans cela, un liseré blanc
      // reste visible entre la peinture et le contour.
      const spread = dilateIntoWalls(result.mask, image.data, image.width, image.height)
      const outline = traceOutline(spread, image.width, image.height)
      if (outline.length < 8) return

      // Retour au monde, puis dégrossissage : le contour suit les pixels, il n'a pas
      // besoin d'un point par pixel.
      const { x, y, scale } = viewRef.current
      const world = outline.map((pixel) => ({
        x: (pixel.x - x) / scale,
        y: (pixel.y - y) / scale,
      }))
      const corners = simplifyPoints(world, 1.2 / scale)
      if (corners.length < 3) return

      const xs = corners.map((point_) => point_.x)
      const ys = corners.map((point_) => point_.y)
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const w = Math.max(1, Math.max(...xs) - minX)
      const h = Math.max(1, Math.max(...ys) - minY)

      addItems([
        {
          id: newId(),
          type: 'shape',
          kind: 'free',
          color: colorRef.current,
          strokeWidth: 1,
          filled: true,
          // `solid` : le fond est franc. `paint` : c'est une tache, elle vit derrière
          // les traits qui l'ont arrêtée et ne les recouvre jamais.
          solid: true,
          paint: true,
          closed: true,
          nodes: corners.map((point_) => ({
            x: (point_.x - minX) / w,
            y: (point_.y - minY) / h,
            in: null,
            out: null,
          })),
          x: Math.round(minX),
          y: Math.round(minY),
          w: Math.round(w),
          h: Math.round(h),
        },
      ])
    },
    [addItems, changeItem, insideShape, rasterizeBoard],
  )

  /**
   * Pipette : reprend la couleur de ce qui se trouve sous le curseur — bloc, fil, ou
   * trait — puis rend la main à l'outil précédent.
   */
  const pickColorAt = useCallback((point) => {
    const items = docRef.current.items
    const found = [...items].reverse().find(
      (item) =>
        item.color &&
        point.x >= item.x &&
        point.x <= item.x + item.w &&
        point.y >= item.y &&
        point.y <= item.y + item.h,
    )
    const reach = 12 / viewRef.current.scale
    const stroke = found
      ? null
      : docRef.current.strokes.find((entry) => strokeHit(entry, point, Math.max(entry.size, 8) / viewRef.current.scale + reach))

    const picked = found?.color ?? stroke?.color
    if (picked) setColor(picked)
    setTool(previousTool.current === 'picker' ? 'select' : previousTool.current)
  }, [])

  /**
   * Le trait touche-t-il ce point ? On mesure la distance aux segments et pas seulement
   * aux points enregistrés : entre deux points échantillonnés, il peut y avoir 40 px.
   */
  const strokeHit = (stroke, point, reach) => {
    const points = stroke.points
    if (points.length === 1) return Math.hypot(points[0].x - point.x, points[0].y - point.y) <= reach

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = dx * dx + dy * dy
      const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0
      const nearest = { x: a.x + dx * t, y: a.y + dy * t }
      if (Math.hypot(nearest.x - point.x, nearest.y - point.y) <= reach) return true
    }
    return false
  }

  /** Gomme de trait : efface les traits entiers au passage, en une seule annulation. */
  const eraseStrokes = useCallback(
    (point) => {
      const reach = Math.max(8, sizeRef.current) / viewRef.current.scale
      const doomed = docRef.current.strokes.filter((stroke) => strokeHit(stroke, point, reach))
      if (!doomed.length) return

      const ids = new Set(doomed.map((stroke) => stroke.id))
      const first = !erasing.current
      erasing.current = true
      write((d) => ({ ...d, strokes: d.strokes.filter((stroke) => !ids.has(stroke.id)) }), first)
      painters.current.paintStrokes()
    },
    [write],
  )

  /** Aimante un bloc déplacé seul aux bords et centres des autres. */
  const snap = useCallback((id, x, y) => {
    const item = docRef.current.items.find((candidate) => candidate.id === id)
    // Aimantation coupée dans les réglages : le bloc va exactement où on le pose.
    if (!settingsRef.current.snap || !item || selectionRef.current.items.length > 1) {
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

  const addMarkdown = useCallback(() => {
    const item = markdownItem({ at: viewportCenter(), color: colorRef.current })
    addItems([item])
    setEditingId(item.id)
  }, [addItems, viewportCenter])

  const addMap = useCallback(() => {
    addItems([mapItem({ at: viewportCenter() })])
  }, [addItems, viewportCenter])

  const addTable = useCallback(() => {
    addItems([tableItem({ at: viewportCenter(), color: colorRef.current })])
  }, [addItems, viewportCenter])

  /** Ajoute ou retire une ligne (ou une colonne) au tableau sélectionné. */
  const resizeTable = useCallback(
    (what, delta) => {
      const table = selectionRef.current.items[0]
      if (!table) return
      changeItem(
        table,
        (() => {
          const item = docRef.current.items.find((candidate) => candidate.id === table)
          const cells = item.cells.map((line) => [...line])
          if (what === 'row') {
            if (delta > 0) cells.push(cells[0].map(() => ''))
            else if (cells.length > 1) cells.pop()
          } else if (delta > 0) {
            for (const line of cells) line.push('')
          } else if (cells[0].length > 1) {
            for (const line of cells) line.pop()
          }
          return { cells }
        })(),
        true,
      )
    },
    [changeItem],
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
        style: linkStyleRef.current,
        ...(dashRef.current !== 'solid' ? { dash: dashRef.current } : null),
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

  /**
   * La pression relevée vaut-elle la peine d'être gardée ? Selon son pilote, une tablette
   * graphique s'annonce parfois comme une souris : on se fie donc à la valeur plutôt qu'à
   * l'étiquette. Une souris rapporte exactement 0,5 tant qu'elle est enfoncée, un doigt 0
   * ou 1 — rien de tout cela ne dit quoi que ce soit de la force du geste.
   */
  const usablePressure = (event) => {
    if (event.pointerType === 'touch') return false
    if (event.pointerType === 'pen') return true
    // 0,5 pile, c'est la valeur qu'une souris rapporte tant qu'elle est enfoncée :
    // tout le reste vient d'un appareil qui mesure vraiment quelque chose.
    return event.pressure > 0 && event.pressure !== 0.5
  }

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

    // En présentation, le tableau ne se modifie plus : le pointeur ne fait que montrer.
    if (presentRef.current !== null) {
      pressed.current = true
      return
    }

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

    if (current === 'vote') {
      placeVote(toWorld(event.clientX, event.clientY))
      return
    }

    if (current === 'frame') {
      const rank = docRef.current.items.filter((item) => item.type === 'frame').length
      const frame = frameItem(toWorld(event.clientX, event.clientY), rank)
      commit((d) => ({ ...d, items: [...d.items, frame] }))
      setTool('select')
      setSelection({ items: [frame.id], link: null })
      return
    }

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
            ? { arc: true, from: snapEnd(at), anchor: at, to: at }
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
    // Le bout gomme d'un stylet n'annonce pas le bouton gauche : il a le sien.
    // Le bout gomme s'annonce par le bouton 5, ou par le bit 32 des boutons tenus.
    const penEraser =
      event.pointerType === 'pen' && ((event.buttons & 32) !== 0 || event.button === 5)
    if (event.button !== 0 && !penEraser) return

    if (current === 'eraser' && eraserModeRef.current === 'stroke') {
      erasing.current = false
      eraseStrokes(toWorld(event.clientX, event.clientY))
      erasingRef.current = true
      return
    }

    if (current === 'bucket') {
      const rect = containerRef.current.getBoundingClientRect()
      fillAt(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        toWorld(event.clientX, event.clientY),
      )
      return
    }

    if (current === 'picker') {
      pickColorAt(toWorld(event.clientX, event.clientY))
      return
    }

    // Le bout gomme du stylet efface, quel que soit l'outil choisi.
    liveStroke.current = {
      id: newId(),
      tool: penEraser ? 'eraser' : current,
      color: colorRef.current,
      size: current === 'marker' ? markerRef.current : sizeRef.current,
      // La gomme efface d'un trait plein : des tirets laisseraient des miettes.
      ...(current !== 'eraser' && dashRef.current !== 'solid' ? { dash: dashRef.current } : null),
      ...(current === 'pen' && brushRef.current !== 'plain' ? { brush: brushRef.current } : null),
      // L'inclinaison du stylet à la pose donne l'angle de la plume calligraphique.
      ...(event.tiltX || event.tiltY
        ? { tilt: Math.atan2(event.tiltY, event.tiltX) }
        : null),
      points: [
        usablePressure(event)
          ? { ...toWorld(event.clientX, event.clientY), p: Math.round(event.pressure * 100) / 100 }
          : toWorld(event.clientX, event.clientY),
      ],
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
    } else if (erasingRef.current) {
      eraseStrokes(toWorld(event.clientX, event.clientY))
    } else if (bandRef.current) {
      move.band = toWorld(event.clientX, event.clientY)
    } else if (draftRef.current) {
      move.draft = toWorld(event.clientX, event.clientY)
      move.shift = event.shiftKey
    } else if (liveStroke.current) {
      const coalesced = event.nativeEvent.getCoalescedEvents?.()
      const events = coalesced?.length ? coalesced : [event.nativeEvent]
      const fresh = events.map((e) => {
        const point = toWorld(e.clientX, e.clientY)
        return usablePressure(e) ? { ...point, p: Math.round(e.pressure * 100) / 100 } : point
      })
      liveStroke.current.points.push(...fresh)
      move.paint = true
    }

    // Pendant une présentation, le doigt appuyé montre : c'est le laser, sans changer d'outil.
    if (toolRef.current === 'laser' || (presentRef.current !== null && pressed.current)) {
      trace('self', toWorld(event.clientX, event.clientY), sessionRef.current?.self.color ?? '#ff3b30')
    }

    if (sessionRef.current) move.cursor = toWorld(event.clientX, event.clientY)

    nextMove.current = move
    scheduleFrame()
  }

  const endPointer = (event) => {
    if (event.pointerType === 'pen') penDown.current = false
    pressed.current = false

    // Une image encore en attente conclurait le geste sur des coordonnées périmées :
    // un tracé rapide se retrouverait réduit à un simple clic.
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      flushMove()
    }

    if (erasingRef.current) {
      erasingRef.current = false
      erasing.current = false
    }

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
            ...(dashRef.current !== 'solid' ? { dash: dashRef.current } : null),
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
          dash: dashRef.current,
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
          dash: dashRef.current,
          ends: endsFrom(sketchDraft.from, sketchDraft.to),
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
        const target = move.shift
          ? constrain(current.anchor ?? move.draft, move.draft, 'arc')
          : move.draft
        draftRef.current = { ...current, to: target }
        setDraft({ ...draftRef.current })
      } else if (current.free) {
        const last = current.points.at(-1)
        // On ne garde que les points qui apportent quelque chose.
        if (Math.hypot(move.draft.x - last.x, move.draft.y - last.y) > 3 / viewRef.current.scale) {
          current.points.push(move.draft)
          setDraft({ ...current, points: [...current.points] })
        }
      } else {
        const target = move.shift ? constrain(current.from, move.draft, shapeRef.current) : move.draft
        draftRef.current = { ...current, to: target }
        setDraft({ ...draftRef.current })
      }
    }
    if (move.cursor) {
      sessionRef.current?.send({
        t: 'cursor',
        x: move.cursor.x,
        y: move.cursor.y,
        tool: presentRef.current !== null && pressed.current ? 'laser' : toolRef.current,
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

  /* ---------- chemins éditables ---------- */

  // Nœud visé par la poignée en cours de déplacement, s'il y en a un à portée.
  const pathSnap = useRef(null)

  /**
   * Les nœuds d'une forme, écrits dans le bloc. Les formes d'avant n'en portaient pas :
   * on les fabrique au premier geste, en gardant leur genre — un rectangle reste un
   * rectangle, il a seulement gagné ses poignées.
   */
  const writeNodes = useCallback(
    (id, nodes, recordHistory) => {
      write((d) => ({
        ...d,
        items: d.items.map((item) =>
          item.id === id ? { ...item, nodes, closed: isClosed(item) } : item,
        ),
      }), recordHistory)
    },
    [write],
  )

  /**
   * Poignée déplacée : en continu, sans entrée d'historique. Un nœud passé près de
   * celui d'une autre forme le vise — le raccord se fera au lâcher.
   */
  const dragPath = useCallback(
    (id, index, key, point, breakSmooth) => {
      const item = docRef.current.items.find((candidate) => candidate.id === id)
      if (!item) return
      writeNodes(id, moveHandle(nodesOf(item), index, key, point, breakSmooth), false)

      if (key !== 'point') return
      const board = projector(item).toBoard(point)
      const target = nearestNode(
        docRef.current.items,
        id,
        board,
        snapReach(viewRef.current.scale),
      )
      pathSnap.current = target
      setArcSnap(target ? { x: target.x, y: target.y } : null)
    },
    [writeNodes],
  )

  /**
   * Poignée lâchée : la boîte du bloc épouse à nouveau son chemin. Sans ce recadrage,
   * un nœud tiré au loin laisserait une boîte de sélection démesurée.
   */
  const dropPath = useCallback(
    (id, index) => {
      const target = pathSnap.current
      pathSnap.current = null
      setArcSnap(null)

      commit((d) => ({
        ...d,
        items: d.items.map((item) => {
          if (item.id !== id) return item

          let nodes = nodesOf(item)
          let joins = { ...item.joins }

          if (target && index !== undefined) {
            // Le nœud rejoint exactement celui qu'il visait, et le suivra désormais.
            const entry = nodes[index]
            const unit = projector(item).toUnit(target)
            const dx = unit.x - entry.x
            const dy = unit.y - entry.y
            nodes = nodes.map((candidate, i) =>
              i === index
                ? {
                    x: unit.x,
                    y: unit.y,
                    in: candidate.in ? { x: candidate.in.x + dx, y: candidate.in.y + dy } : null,
                    out: candidate.out ? { x: candidate.out.x + dx, y: candidate.out.y + dy } : null,
                  }
                : candidate,
            )
            joins[index] = { id: target.id, node: target.index }
          } else if (index !== undefined) {
            // Déplacé ailleurs : le nœud reprend sa liberté.
            delete joins[index]
          }

          return {
            ...item,
            closed: isClosed(item),
            joins: Object.keys(joins).length ? joins : undefined,
            ...normalizePath({ ...item, nodes }, nodes),
          }
        }),
      }))
    },
    [commit],
  )

  const addPathNode = useCallback(
    (id, index) => {
      const item = docRef.current.items.find((candidate) => candidate.id === id)
      if (!item) return
      writeNodes(id, splitSegment(nodesOf(item), index, 0.5, isClosed(item)), true)
    },
    [writeNodes],
  )

  const removePathNode = useCallback(
    (id, index) => {
      const item = docRef.current.items.find((candidate) => candidate.id === id)
      if (!item) return
      const nodes = removeNode(nodesOf(item), index)
      commit((d) => ({
        ...d,
        items: d.items.map((entry) =>
          entry.id === id
            ? { ...entry, nodes, closed: isClosed(entry), ...normalizePath(entry, nodes) }
            : entry,
        ),
      }))
    },
    [commit],
  )

  /* ---------- style repris d'un bloc à l'autre ---------- */

  const styleClip = useRef(null)
  const [styleReady, setStyleReady] = useState(false)

  /** Retient l'allure du bloc sélectionné : couleur, épaisseur, remplissage, taille. */
  const copyStyle = useCallback(() => {
    const item = docRef.current.items.find(
      (candidate) => candidate.id === selectionRef.current.items[0],
    )
    if (!item) return
    styleClip.current = {
      color: item.color,
      strokeWidth: item.strokeWidth,
      filled: item.filled,
      dash: item.dash,
      size: item.size,
      variant: item.variant,
    }
    setStyleReady(true)
  }, [])

  /** Applique l'allure retenue, en ne gardant que ce qui a un sens pour chaque bloc. */
  const pasteStyle = useCallback(() => {
    const style = styleClip.current
    if (!style) return
    const chosen = new Set(selectionRef.current.items)
    commit((d) => ({
      ...d,
      items: d.items.map((item) => {
        // Un bloc verrouillé garde son allure, comme il garde sa place.
        if (!chosen.has(item.id) || item.locked) return item
        const patch = { color: style.color ?? item.color }
        if (item.type === 'shape' && style.strokeWidth !== undefined) {
          patch.dash = style.dash ?? 'solid'
          patch.strokeWidth = style.strokeWidth
          patch.filled = Boolean(style.filled) && CLOSED.has(item.kind)
        }
        if (item.type === 'text' && style.size !== undefined) patch.size = style.size
        return { ...item, ...patch }
      }),
    }))
  }, [commit])

  /* ---------- gommettes de vote ---------- */

  const VOTE_SIZE = 26

  /**
   * Une gommette par clic, à la couleur de la personne. Cliquer sur la sienne la retire :
   * on change d'avis sans changer d'outil.
   */
  const placeVote = useCallback(
    (point) => {
      const color = sessionRef.current?.self.color ?? colorRef.current
      const half = VOTE_SIZE / 2
      const mine = docRef.current.items.find(
        (item) =>
          item.type === 'dot' &&
          item.color === color &&
          Math.hypot(item.x + half - point.x, item.y + half - point.y) < half + 4,
      )
      if (mine) {
        commit((d) => ({ ...d, items: d.items.filter((item) => item.id !== mine.id) }))
        return
      }
      commit((d) => ({
        ...d,
        items: [
          ...d.items,
          {
            id: newId(),
            type: 'dot',
            color,
            x: Math.round(point.x - half),
            y: Math.round(point.y - half),
            w: VOTE_SIZE,
            h: VOTE_SIZE,
          },
        ],
      }))
    },
    [commit],
  )

  /* ---------- minuteur partagé ---------- */

  /** Le minuteur suit la même horloge pour tout le monde : seule la date de fin circule. */
  const shareTimer = useCallback((next) => {
    setTimer(next)
    setShowTimer(Boolean(next))
    sessionRef.current?.send({ t: 'timer', timer: next })
  }, [])

  const startTimer = useCallback((duration) => shareTimer({ endsAt: Date.now() + duration }), [shareTimer])

  /** En marche on retient le temps restant ; en pause on repart de ce temps-là. */
  const pauseTimer = useCallback(() => {
    setTimer((current) => {
      if (!current) return current
      const next =
        current.left === undefined
          ? { left: Math.max(0, current.endsAt - Date.now()) }
          : { endsAt: Date.now() + current.left }
      sessionRef.current?.send({ t: 'timer', timer: next })
      return next
    })
  }, [])

  /* ---------- cadres et présentation ---------- */

  const flight = useRef(0)

  /** Amène la vue à destination en douceur : la grille et les fils sont redessinés à chaque image. */
  const flyTo = useCallback((target, duration = 480) => {
    cancelAnimationFrame(flight.current)
    const from = viewRef.current
    const start = performance.now()

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration)
      // Départ et arrivée adoucis : le mouvement n'a ni à-coup ni freinage brutal.
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      setView({
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        scale: from.scale + (target.scale - from.scale) * eased,
      })
      if (t < 1) flight.current = requestAnimationFrame(step)
    }
    flight.current = requestAnimationFrame(step)
  }, [])

  const frames = useMemo(() => orderFrames(doc.items), [doc.items])

  /** Gommettes rapportées au bloc qui les porte : le compte s'affiche sur le bloc. */
  const votes = useMemo(() => {
    const dots = doc.items.filter((item) => item.type === 'dot')
    if (!dots.length) return null
    const targets = doc.items.filter((item) => item.type !== 'dot' && item.type !== 'frame')
    const counts = new Map()
    for (const dot of dots) {
      const middle = { x: dot.x + dot.w / 2, y: dot.y + dot.h / 2 }
      // Le bloc le plus haut dans la pile emporte la voix.
      const target = [...targets].reverse().find((item) => contains(item, middle))
      if (target) counts.set(target.id, (counts.get(target.id) ?? 0) + 1)
    }
    return counts
  }, [doc.items])
  const framesRef = useRef(frames)
  framesRef.current = frames

  /** Montre une scène : la vue vient cadrer le rectangle, plein écran. */
  const showFrame = useCallback(
    (index) => {
      const frame = framesRef.current[index]
      if (!frame) return
      setPresent(index)
      setSelection({ items: [], link: null })
      setEditingId(null)
      flyTo(fitView(frame, { w: innerWidth, h: innerHeight }, 0))
    },
    [flyTo],
  )

  const leavePresent = useCallback(() => setPresent(null), [])
  presentRef.current = present

  /** Centre la vue sur un bloc, sans changer le niveau de zoom. */
  const goToItem = useCallback(
    (id) => {
      const item = docRef.current.items.find((candidate) => candidate.id === id)
      if (!item) return
      const { scale } = viewRef.current
      flyTo({
        scale,
        x: innerWidth / 2 - (item.x + item.w / 2) * scale,
        y: innerHeight / 2 - (item.y + item.h / 2) * scale,
      })
      setSelection({ items: [id], link: null })
      setSearching(false)
    },
    [flyTo],
  )

  /* ---------- clavier, glisser-déposer, presse-papiers ---------- */

  const isTyping = (target) =>
    target instanceof HTMLElement &&
    (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)

  const deleteSelection = useCallback(() => {
    if (selection.link) deleteLink(selection.link)
    // Le verrou protège aussi de la suppression : c'est tout son intérêt.
    const locked = new Set(
      docRef.current.items.filter((item) => item.locked).map((item) => item.id),
    )
    for (const id of selection.items) if (!locked.has(id)) deleteItem(id)
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
        if (key === 'f') {
          event.preventDefault()
          setSearching((open) => !open)
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

      // Pendant la présentation, le clavier ne sert plus qu'à passer d'une scène à l'autre.
      if (present !== null) {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.code === 'Space') {
          event.preventDefault()
          showFrame(Math.min(framesRef.current.length - 1, present + 1))
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault()
          showFrame(Math.max(0, present - 1))
        }
        if (event.key === 'Escape') leavePresent()
        return
      }

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
        f: () => setTool('frame'),
        s: () => chooseTool('shape'),
        m: () => chooseTool('marker'),
        i: () => chooseTool('picker'),
        b: () => chooseTool('bucket'),
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
        setSearching(false)
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
    present,
    showFrame,
    leavePresent,
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

  if (import.meta.env.DEV) {
    window.__debug = { tool, eraserMode, erasing: erasingRef, draft: draftRef }
  }

  /** Un réglage change : il est retenu pour les prochaines visites. */
  const changeSetting = (key, value) => {
    setSettings((current) => {
      const next = { ...current, [key]: value }
      saveSettings(next)
      return next
    })
  }

  const resetView = () => setView({ x: 0, y: 0, scale: 1 })
  const linking = tool === 'link'
  const interactive = present === null && (tool === 'select' || linking)
  const selectedIds = selection.items
  const selectedItemId = selectedIds.length === 1 ? selectedIds[0] : null
  const selectedLinkId = selection.link
  const showArrows = linking || Boolean(selectedLinkId)
  const selectedItem = useMemo(
    () => doc.items.find((item) => item.id === selectedItemId) ?? null,
    [doc.items, selectedItemId],
  )
  const selectedLink = useMemo(
    () => doc.links.find((link) => link.id === selectedLinkId) ?? null,
    [doc.links, selectedLinkId],
  )

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
    const behind = doc.items.filter(
      (item) =>
        item.type === 'frame' ||
        item.type === 'group' ||
        (item.type === 'shape' && item.paint),
    )
    if (!behind.length) return doc.items
    // Les cadres passent tout derrière, puis les zones de groupe, puis les taches de
    // peinture : une tache ne doit jamais recouvrir le contour qui l'a arrêtée.
    const frames = behind.filter((item) => item.type === 'frame')
    const groups = behind.filter((item) => item.type === 'group')
    const paint = behind.filter((item) => item.type === 'shape')
    return [...frames, ...groups, ...paint, ...doc.items.filter((item) => !behind.includes(item))]
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
    } else if (selectedItem && ['markdown', 'table'].includes(selectedItem.type)) {
      changeItem(selectedItem.id, { color: value }, true)
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
        // Choisir une autre forme repart de sa géométrie : les nœuds retouchés sautent.
        { kind, nodes: null, filled: selectedShape.filled && CLOSED.has(kind) },
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

  /** Le type de trait s'applique à ce qui est sélectionné, ou devient le choix par défaut. */
  const pickDash = (value) => {
    setDash(value)
    if (selectedLinkId) changeLink(selectedLinkId, { dash: value })
    else if (selectedShape) changeItem(selectedShape.id, { dash: value }, true)
  }

  const pickLinkStyle = (value) => {
    setLinkStyle(value)
    if (selectedLinkId) changeLink(selectedLinkId, { style: value })
  }

  /** Un bloc verrouillé reste visible et sélectionnable, mais plus rien ne le déplace. */
  const toggleLock = () => {
    if (!selectedItem) return
    changeItem(selectedItem.id, { locked: !selectedItem.locked }, true)
  }

  /** Le gribouillis devient la forme nette qu'il dessinait — ou reste tel quel. */
  const straightenShape = () => {
    if (!selectedShape) return
    const patch = straighten(selectedShape)
    if (!patch) {
      setTip({ label: 'Tracé non reconnu', x: innerWidth / 2, y: innerHeight - 150 })
      setTimeout(() => setTip(null), 1400)
      return
    }
    animated(() => changeItem(selectedShape.id, patch, true))
  }

  // Infobulles maison : un petit texte qui suit la souris, à la place des raccourcis
  // autrefois affichés en permanence sur le tableau.
  const tipProps = (label, shortcut) => ({
    // Les boutons n'ont qu'une icône : sans nom accessible, ils sont muets au lecteur d'écran.
    'aria-label': shortcut ? `${label} (${shortcut})` : label,
    onPointerEnter: (event) => setTip({ label, shortcut, x: event.clientX, y: event.clientY }),
    onPointerMove: (event) =>
      setTip((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current)),
    onPointerLeave: () => setTip(null),
  })

  return (
    <div className={`board ${present !== null ? 'is-presenting' : ''}`}>
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
        <canvas ref={gridRef} className="board__canvas board__canvas--grid" />

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
              draggable={tool === 'select' && !item.locked && present === null}
              locked={Boolean(item.locked)}
              rank={item.type === 'frame' ? frames.findIndex((f) => f.id === item.id) + 1 : 0}
              votes={votes?.get(item.id) ?? 0}
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

          {/* Une forme sélectionnée montre ses nœuds, comme un arc montre les siens. */}
          {tool === 'select' && selectedShape && !selectedShape.locked && (
            <PathHandles
              item={selectedShape}
              snap={arcSnap}
              toWorld={toWorld}
              onDrag={(index, key, point, alt) =>
                dragPath(selectedShape.id, index, key, point, alt)
              }
              onDrop={(index) => dropPath(selectedShape.id, index)}
              onAdd={(index) => addPathNode(selectedShape.id, index)}
              onRemove={(index) => removePathNode(selectedShape.id, index)}
            />
          )}

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
                ends: endsFrom(draft.from, draft.to),
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

        <Laser trails={lasers} view={viewRef} />
      </div>

      <AccountDialog
        open={accountOpen}
        user={account}
        onClose={() => setAccountOpen(false)}
        onSignIn={cloud.signIn}
        onSignUp={cloud.signUp}
        onLink={cloud.signInWithLink}
        onSignOut={cloud.signOut}
        onPushAll={pushAll}
        onPullAll={pullAll}
        onWipeCloud={wipeCloud}
        onDeleteAccount={deleteAccount}
      />

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
        settings={settings}
        onSetting={changeSetting}
        supabaseReady={supabaseConfigured()}
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
        account={account}
        cloudReady={cloud.configured()}
        onAccount={() => setAccountOpen(true)}
        onPublicLink={publicLink}
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
        markerSize={markerSize}
        eraserMode={eraserMode}
        arrow={arrow}
        linkStyle={selectedLink?.style ?? linkStyle}
        dash={selectedLink?.dash ?? selectedShape?.dash ?? dash}
        brush={brush}
        isArc={selectedLink?.kind === 'arc'}
        filled={filled}
        textSizes={TEXT_SIZES}
        history={history}
        tipProps={tipProps}
        selectedCount={selectedIds.length}
        selectedItem={selectedItem}
        frameCount={frames.length}
        timerOpen={showTimer}
        settings={settings}
        onSetting={changeSetting}
        scale={view.scale}
        styleReady={styleReady}
        selectedTable={selectedItem?.type === 'table' ? selectedItem : null}
        selectedMarkdown={selectedItem?.type === 'markdown' ? selectedItem : null}
        selectedShape={selectedShape}
        canFill={selectedShape ? isClosed(selectedShape) : null}
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
          pickMarkerSize: setMarkerSize,
          setEraserMode,
          pickTextSize,
          pickArrow,
          pickLinkStyle,
          pickDash,
          pickBrush: setBrush,
          toggleLock,
          straightenShape,
          present: () => showFrame(0),
          toggleTimer: () => setShowTimer((open) => !open),
          zoomIn: () => zoomAt(innerWidth / 2, innerHeight / 2, 1.2),
          zoomOut: () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.2),
          resetView,
          addMarkdown,
          addMap,
          addTable,
          resizeTable,
          copyStyle,
          pasteStyle,
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

      {(showTimer || timer) && present === null && (
        <Timer
          state={timer}
          onStart={startTimer}
          onPause={pauseTimer}
          onStop={() => shareTimer(null)}
          onClose={() => setShowTimer(false)}
        />
      )}

      {searching && present === null && (
        <Search items={doc.items} onGo={goToItem} onClose={() => setSearching(false)} />
      )}

      {present !== null && (
        <Present
          index={present}
          total={frames.length}
          onPrevious={() => showFrame(present - 1)}
          onNext={() => showFrame(present + 1)}
          onExit={leavePresent}
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
