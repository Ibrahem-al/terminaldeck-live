import { useEffect, useRef } from 'react'
import { cn } from '../../../lib/cn'
import { PhoneFrame, PhoneBar } from '../Phone'
import type { SimPane } from './types'
import { leafPaneIds } from './tree'
import { useSim } from './store'
import { useRunner } from './runner'
import { PromptRow, renderBlock } from './termRender'

// Every key here maps to a real action in onKey — no dead buttons.
const KEYS: { k: string; accent?: boolean }[] = [
  { k: 'Run ↵', accent: true },
  { k: '^C' },
  { k: 'Esc' },
  { k: '↑' },
  { k: '↓' },
  { k: 'Clear' },
  { k: 'Paste' }
]

/**
 * The RemoteDeck phone, mirroring the *same* active terminal as the desktop.
 * Because it reads the shared store, typing on the desktop shows up here live;
 * the key bar drives the same pane (Run, Ctrl-C, history, clear, paste).
 */
export function SimPhone({ width = 208 }: { width?: number }): React.JSX.Element {
  const { state, activeDeck, dispatch } = useSim()
  const { run, interrupt } = useRunner()
  const scrollRef = useRef<HTMLDivElement>(null)

  const direct = state.panes[activeDeck.activePaneId]
  // Only ever mirror a terminal/agent pane; if the deck has none, show the
  // empty state rather than "driving" an editor pane that ignores the input.
  const mirror: SimPane | undefined =
    direct && direct.kind !== 'editor'
      ? direct
      : leafPaneIds(activeDeck.tree)
          .map((id) => state.panes[id])
          .find((p) => p && p.kind !== 'editor')

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mirror?.blocks, mirror?.input, mirror?.busy])

  const navHistory = (delta: number): void => {
    if (!mirror) return
    const h = mirror.history
    if (h.length === 0) return
    let idx = mirror.histIndex === -1 ? h.length : mirror.histIndex
    idx += delta
    if (idx < 0) idx = 0
    if (idx >= h.length) {
      dispatch({ type: 'setInput', paneId: mirror.id, input: '', histIndex: -1 })
      return
    }
    dispatch({ type: 'setInput', paneId: mirror.id, input: h[idx], histIndex: idx })
  }

  const onKey = (k: string): void => {
    if (!mirror) return
    dispatch({ type: 'markTouched' })
    switch (k) {
      case 'Run ↵':
        if (!mirror.busy) void run(mirror.id, mirror.input)
        break
      case '^C':
        interrupt(mirror.id)
        break
      case 'Esc':
        dispatch({ type: 'setInput', paneId: mirror.id, input: '', histIndex: -1 })
        break
      case '↑':
        navHistory(-1)
        break
      case '↓':
        navHistory(1)
        break
      case 'Clear':
        dispatch({ type: 'clearBlocks', paneId: mirror.id })
        break
      case 'Paste':
        dispatch({ type: 'setInput', paneId: mirror.id, input: mirror.input + 'npm test', histIndex: -1 })
        break
      default:
        break
    }
  }

  return (
    <PhoneFrame width={width}>
      <PhoneBar
        title={mirror ? `${mirror.title} · ${activeDeck.project.name}` : 'no session'}
        status={mirror?.busy ? 'busy' : 'idle'}
        back
        bell
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-term px-3 py-2 font-mono text-[11px] leading-[1.6]" style={{ color: 'var(--term-ink)' }}>
        {mirror ? (
          <>
            {mirror.blocks.map(renderBlock)}
            {mirror.busy ? (
              <div className="flex items-center gap-2 py-0.5 text-ink-3">
                <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
                <span className="font-ui text-[10px]">running…</span>
              </div>
            ) : (
              <PromptRow cwd={mirror.cwd} text={mirror.input} caret />
            )}
          </>
        ) : (
          <p className="text-ink-3">No terminal in this deck.</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-edge bg-raised p-2">
        {KEYS.map((key) => (
          <button
            key={key.k}
            onClick={() => onKey(key.k)}
            className={cn(
              'flex h-9 min-w-[42px] shrink-0 items-center justify-center rounded-lg border border-edge bg-overlay px-2 font-mono text-[12px] transition-colors active:bg-accent active:text-ink-inverse',
              key.accent ? 'text-accent' : 'text-ink'
            )}
          >
            {key.k}
          </button>
        ))}
      </div>
    </PhoneFrame>
  )
}
