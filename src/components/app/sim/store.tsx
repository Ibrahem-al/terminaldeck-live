import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react'
import { A, L, s, type Line } from '../Terminal'
import type { Badge, Block, Deck, LayoutNode, Overlay, PaneKind, SimPane, SimState } from './types'
import {
  balancedTree,
  gridTree,
  hasPane,
  leafPaneIds,
  removeLeaf,
  setRatio as setRatioTree,
  splitLeaf,
  uid
} from './tree'

/* ───────────────────────── Pane factories ───────────────────────── */

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

export function blk(b: DistributiveOmit<Block, 'id'>): Block {
  return { ...b, id: uid('blk') } as Block
}

const HINT = (): Block =>
  blk({
    kind: 'out',
    line: L(s('TerminalDeck preview — type ', A(8)), s('help', 'var(--accent)'), s(' or just start typing.', A(8)))
  })

let _p = 0
const paneId = (): string => `pane-${++_p}`

export function termPane(opts: {
  title?: string
  cwd: string
  root?: string
  badge?: Badge
  intro?: string
  kind?: PaneKind
  seedHint?: boolean
}): SimPane {
  return {
    id: paneId(),
    kind: opts.kind ?? 'terminal',
    title: opts.title ?? 'pwsh',
    cwd: opts.cwd,
    root: opts.root ?? opts.cwd,
    badge: opts.badge,
    blocks: opts.seedHint === false ? [] : [HINT()],
    input: '',
    history: [],
    histIndex: -1,
    busy: false,
    intro: opts.intro,
    seeded: true
  }
}

const EDITOR_RATELIMIT: Line[] = [
  L(s(' 1  ', A(8)), s('export ', A(5)), s('function ', A(4)), s('tokenBucket', A(3)), s('(opts) {', A(7))),
  L(s(' 2  ', A(8)), s('  const ', A(4)), s('hits = ', A(7)), s('new Map', A(3)), s('<string, number>()', A(7))),
  L(s(' 3  ', A(8)), s('  const ', A(4)), s('{ rate, burst } = opts', A(7))),
  L(s(' 4  ', A(8)), s('  return ', A(5)), s('(req, res, next) => {', A(7))),
  L(s(' 5  ', A(8)), s('    const ', A(4)), s('key = req.ip', A(7))),
  L(s(' 6  ', A(8)), s('    const ', A(4)), s('n = ', A(7)), s('(hits.get(key) ?? burst) - ', A(7)), s('1', A(3))),
  L(s(' 7  ', A(8)), s('    if ', A(5)), s('(n < ', A(7)), s('0', A(3)), s(') return res.', A(7)), s('sendStatus', A(3)), s('(', A(7)), s('429', A(3)), s(')', A(7))),
  L(s(' 8  ', A(8)), s('    hits.set(key, n)', A(7))),
  L(s(' 9  ', A(8)), s('    next()', A(7))),
  L(s('10  ', A(8)), s('  }', A(7))),
  L(s('11  ', A(8)), s('}', A(7)))
]

/** A starter body for editor panes created on the fly (so they're never blank). */
export const EDITOR_SCAFFOLD: Line[] = [
  L(s(' 1  ', A(8)), s('// untitled.ts', A(8))),
  L(s(' 2  ', A(8)), s('// editor panes are a read-only preview in this demo', A(8))),
  L(s(' 3  ', A(8))),
  L(s(' 4  ', A(8)), s('export ', A(5)), s('const ', A(4)), s('hello = ', A(7)), s('"edit me in the real app"', A(2))),
  L(s(' 5  ', A(8)), s('}', A(7)))
]

export function editorPane(opts: { title: string; cwd: string; root?: string; lines?: Line[] }): SimPane {
  return {
    id: paneId(),
    kind: 'editor',
    title: opts.title,
    cwd: opts.cwd,
    root: opts.root ?? opts.cwd,
    blocks: [],
    input: '',
    history: [],
    histIndex: -1,
    busy: false,
    editorLines: opts.lines ?? EDITOR_RATELIMIT,
    seeded: true
  }
}

/* ───────────────────────── Initial state ───────────────────────── */

export function createInitialState(): SimState {
  const panes: Record<string, SimPane> = {}
  const add = (p: SimPane): SimPane => {
    panes[p.id] = p
    return p
  }

  // Deck 1 — my-app: terminal (tests) + Claude Code agent.
  const term1 = add(
    termPane({
      title: 'pwsh',
      cwd: '~\\dev\\my-app',
      badge: { label: 'Test Runner', color: '#4cc38a' },
      intro: 'npm test'
    })
  )
  const claude1 = add(
    termPane({
      title: 'claude',
      kind: 'agent',
      cwd: '~\\dev\\my-app',
      badge: { label: 'Claude Code', color: '#d8a956' },
      intro: 'claude "add a token-bucket rate limiter to the API and cover it with a test"'
    })
  )
  const deck1: Deck = {
    id: uid('deck'),
    name: 'my-app',
    color: '#4cc38a',
    project: { name: 'my-app', color: '#4cc38a' },
    tree: {
      id: uid('split'),
      type: 'split',
      dir: 'row',
      ratio: 0.52,
      a: { id: uid('leaf'), type: 'leaf', paneId: term1.id },
      b: { id: uid('leaf'), type: 'leaf', paneId: claude1.id }
    },
    activePaneId: claude1.id
  }

  // Deck 2 — job-search: a single shell.
  const term2 = add(
    termPane({
      title: 'pwsh',
      cwd: '~\\dev\\job-search',
      badge: { label: 'Git', color: '#e8b130' },
      intro: 'git status'
    })
  )
  const deck2: Deck = {
    id: uid('deck'),
    name: 'job-search',
    color: '#5b9dd9',
    project: { name: 'job-search', color: '#5b9dd9' },
    tree: { id: uid('leaf'), type: 'leaf', paneId: term2.id },
    activePaneId: term2.id
  }

  // Deck 3 — scratch: editor beside a shell.
  const ed3 = add(editorPane({ title: 'rateLimit.ts', cwd: '~\\scratch' }))
  const term3 = add(
    termPane({ title: 'pwsh', cwd: '~\\scratch', intro: 'echo "edit on the left, run on the right"' })
  )
  const deck3: Deck = {
    id: uid('deck'),
    name: 'scratch',
    color: '#b583d9',
    project: { name: 'scratch', color: '#b583d9' },
    tree: {
      id: uid('split'),
      type: 'split',
      dir: 'row',
      ratio: 0.5,
      a: { id: uid('leaf'), type: 'leaf', paneId: ed3.id },
      b: { id: uid('leaf'), type: 'leaf', paneId: term3.id }
    },
    activePaneId: term3.id
  }

  return {
    decks: [deck1, deck2, deck3],
    activeDeckId: deck1.id,
    panes,
    overlay: null,
    maximized: false,
    touched: false,
    rev: 0
  }
}

/* ───────────────────────── Actions + reducer ───────────────────────── */

export type Action =
  | { type: 'setActiveDeck'; deckId: string }
  | { type: 'setActivePane'; paneId: string }
  | { type: 'addDeck'; rows: number; cols: number; label: string }
  | { type: 'renameDeck'; deckId: string; name: string }
  | { type: 'closeDeck'; deckId: string }
  | { type: 'splitPane'; paneId: string; dir: 'row' | 'col'; pane: SimPane }
  | { type: 'swapPanes'; a: string; b: string }
  | { type: 'closePane'; paneId: string }
  | { type: 'togglePin'; paneId: string }
  | { type: 'setBadge'; paneId: string; badge?: Badge }
  | { type: 'setKind'; paneId: string; kind: PaneKind; title: string; badge?: Badge }
  | { type: 'setRatio'; nodeId: string; ratio: number }
  | { type: 'setInput'; paneId: string; input: string; histIndex?: number }
  | { type: 'appendBlocks'; paneId: string; blocks: Block[] }
  | { type: 'clearBlocks'; paneId: string }
  | { type: 'setBusy'; paneId: string; busy: boolean }
  | { type: 'setCwd'; paneId: string; cwd: string }
  | { type: 'setTitle'; paneId: string; title: string }
  | { type: 'pushHistory'; paneId: string; cmd: string }
  | { type: 'setOverlay'; overlay: Overlay }
  | { type: 'setMaximized'; maximized: boolean }
  | { type: 'markTouched' }

let _deckSeq = 0

function patchPane(state: SimState, id: string, patch: Partial<SimPane>): SimState {
  const cur = state.panes[id]
  if (!cur) return state
  return { ...state, panes: { ...state.panes, [id]: { ...cur, ...patch } }, rev: state.rev + 1 }
}

function mapDeck(state: SimState, deckId: string, fn: (d: Deck) => Deck): SimState {
  return { ...state, decks: state.decks.map((d) => (d.id === deckId ? fn(d) : d)) }
}

function deckOfPane(state: SimState, pid: string): Deck | undefined {
  return state.decks.find((d) => hasPane(d.tree, pid))
}

export function reducer(state: SimState, action: Action): SimState {
  switch (action.type) {
    case 'setActiveDeck':
      return { ...state, activeDeckId: action.deckId, overlay: null }

    case 'setActivePane': {
      const deck = deckOfPane(state, action.paneId)
      if (!deck) return state
      return mapDeck(state, deck.id, (d) => ({ ...d, activePaneId: action.paneId }))
    }

    case 'markTouched':
      return state.touched ? state : { ...state, touched: true }

    case 'setOverlay':
      return { ...state, overlay: action.overlay }

    case 'setMaximized':
      return { ...state, maximized: action.maximized }

    case 'setInput':
      return patchPane(state, action.paneId, {
        input: action.input,
        ...(action.histIndex !== undefined ? { histIndex: action.histIndex } : {})
      })

    case 'appendBlocks': {
      const cur = state.panes[action.paneId]
      if (!cur) return state
      return patchPane(state, action.paneId, { blocks: [...cur.blocks, ...action.blocks] })
    }

    case 'clearBlocks':
      return patchPane(state, action.paneId, { blocks: [] })

    case 'setBusy':
      return patchPane(state, action.paneId, { busy: action.busy })

    case 'setCwd':
      return patchPane(state, action.paneId, { cwd: action.cwd })

    case 'setTitle':
      return patchPane(state, action.paneId, { title: action.title })

    case 'togglePin': {
      const cur = state.panes[action.paneId]
      if (!cur) return state
      return patchPane(state, action.paneId, { pinned: !cur.pinned })
    }

    case 'setBadge':
      return patchPane(state, action.paneId, { badge: action.badge })

    case 'setKind':
      return patchPane(state, action.paneId, {
        kind: action.kind,
        title: action.title,
        badge: action.badge ?? state.panes[action.paneId]?.badge
      })

    case 'pushHistory': {
      const cur = state.panes[action.paneId]
      if (!cur) return state
      const history = cur.history[cur.history.length - 1] === action.cmd ? cur.history : [...cur.history, action.cmd]
      return patchPane(state, action.paneId, { history, histIndex: -1 })
    }

    case 'setRatio': {
      // ratio lives on whichever deck's tree owns the dragged divider node.
      const owner = state.decks.find((d) => containsNode(d.tree, action.nodeId))
      if (!owner) return state
      return mapDeck(state, owner.id, (d) => ({ ...d, tree: setRatioTree(d.tree, action.nodeId, action.ratio) }))
    }

    case 'splitPane': {
      const deck = deckOfPane(state, action.paneId)
      if (!deck) return state
      const panes = { ...state.panes, [action.pane.id]: action.pane }
      const tree = splitLeaf(deck.tree, action.paneId, action.dir, action.pane.id)
      return {
        ...state,
        panes,
        decks: state.decks.map((d) => (d.id === deck.id ? { ...d, tree, activePaneId: action.pane.id } : d)),
        rev: state.rev + 1
      }
    }

    case 'swapPanes': {
      if (action.a === action.b) return state
      const swap = (n: LayoutNode): LayoutNode => {
        if (n.type === 'leaf') {
          if (n.paneId === action.a) return { ...n, paneId: action.b }
          if (n.paneId === action.b) return { ...n, paneId: action.a }
          return n
        }
        return { ...n, a: swap(n.a), b: swap(n.b) }
      }
      return { ...state, decks: state.decks.map((d) => ({ ...d, tree: swap(d.tree) })), rev: state.rev + 1 }
    }

    case 'closePane': {
      const cur = state.panes[action.paneId]
      if (!cur || cur.pinned) return state
      const deck = deckOfPane(state, action.paneId)
      if (!deck) return state
      const remaining = leafPaneIds(deck.tree)
      if (remaining.length <= 1) return state // keep at least one pane per deck
      const tree = removeLeaf(deck.tree, action.paneId)
      if (!tree) return state
      const panes = { ...state.panes }
      delete panes[action.paneId]
      const nextActive =
        deck.activePaneId === action.paneId ? leafPaneIds(tree)[0] : deck.activePaneId
      return {
        ...state,
        panes,
        decks: state.decks.map((d) => (d.id === deck.id ? { ...d, tree, activePaneId: nextActive } : d)),
        rev: state.rev + 1
      }
    }

    case 'addDeck': {
      const n = Math.max(1, action.rows * action.cols)
      const newPanes: SimPane[] = []
      for (let i = 0; i < n; i++) {
        newPanes.push(
          termPane({
            title: i % 3 === 1 ? 'git-bash' : 'pwsh',
            cwd: `~\\dev\\${action.label}`,
            seedHint: i === 0
          })
        )
      }
      const panes = { ...state.panes }
      newPanes.forEach((p) => (panes[p.id] = p))
      const ids = newPanes.map((p) => p.id)
      const tree: LayoutNode =
        action.rows * action.cols === 1 ? { id: uid('leaf'), type: 'leaf', paneId: ids[0] } : gridTree(ids, action.rows, action.cols)
      const color = DECK_COLORS[(state.decks.length + _deckSeq++) % DECK_COLORS.length]
      const deck: Deck = {
        id: uid('deck'),
        name: action.label,
        color,
        project: { name: action.label, color },
        tree,
        activePaneId: ids[0]
      }
      return { ...state, decks: [...state.decks, deck], activeDeckId: deck.id, panes, overlay: null }
    }

    case 'renameDeck': {
      const name = action.name.trim().slice(0, 22) || 'deck'
      return mapDeck(state, action.deckId, (d) => ({ ...d, name, project: { ...d.project, name } }))
    }

    case 'closeDeck': {
      if (state.decks.length <= 1) return state
      const deck = state.decks.find((d) => d.id === action.deckId)
      if (!deck) return state
      const panes = { ...state.panes }
      leafPaneIds(deck.tree).forEach((pid) => delete panes[pid])
      const decks = state.decks.filter((d) => d.id !== action.deckId)
      const activeDeckId = state.activeDeckId === action.deckId ? decks[0].id : state.activeDeckId
      return { ...state, decks, activeDeckId, panes }
    }

    default:
      return state
  }
}

function containsNode(node: LayoutNode, nodeId: string): boolean {
  if (node.id === nodeId) return true
  if (node.type === 'leaf') return false
  return containsNode(node.a, nodeId) || containsNode(node.b, nodeId)
}

export const DECK_COLORS = ['#4cc38a', '#5b9dd9', '#b583d9', '#e8913a', '#4fb8c9', '#ed5d5d', '#e8b130']

/* ───────────────────────── Context ───────────────────────── */

interface SimApi {
  state: SimState
  dispatch: React.Dispatch<Action>
  activeDeck: Deck
}

const Ctx = createContext<SimApi | null>(null)

export function SimProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const activeDeck = useMemo(
    () => state.decks.find((d) => d.id === state.activeDeckId) ?? state.decks[0],
    [state.decks, state.activeDeckId]
  )
  const value = useMemo<SimApi>(() => ({ state, dispatch, activeDeck }), [state, activeDeck])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSim(): SimApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSim must be used within SimProvider')
  return ctx
}
