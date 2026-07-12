import { useEffect, useRef } from 'react'
import type { SimPane } from './types'
import { useSim } from './store'
import { useRunner } from './runner'
import { PromptRow, renderBlock } from './termRender'

/**
 * A genuinely typeable terminal pane body. Renders committed scrollback, then a
 * live prompt backed by a transparent input that captures keystrokes, history
 * (↑/↓), Ctrl-C (interrupt), and Ctrl-L (clear). Commands run through the shared
 * interpreter, so what you type actually does something.
 */
export function SimTerminal({
  pane,
  active,
  className
}: {
  pane: SimPane
  active: boolean
  className?: string
}): React.JSX.Element {
  const { dispatch } = useSim()
  const { run, interrupt, cancel } = useRunner()
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the latest output in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [pane.blocks, pane.input, pane.busy])

  // Focus the capture input when this pane is the active one.
  useEffect(() => {
    if (active) inputRef.current?.focus({ preventScroll: true })
  }, [active])

  const navHistory = (delta: number): void => {
    const h = pane.history
    if (h.length === 0) return
    let idx = pane.histIndex === -1 ? h.length : pane.histIndex
    idx += delta
    if (idx < 0) idx = 0
    if (idx >= h.length) {
      dispatch({ type: 'setInput', paneId: pane.id, input: '', histIndex: -1 })
      return
    }
    dispatch({ type: 'setInput', paneId: pane.id, input: h[idx], histIndex: idx })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    dispatch({ type: 'markTouched' })
    cancel(pane.id) // a real keystroke ends any autoplay still typing here
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!pane.busy) void run(pane.id, pane.input)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      navHistory(-1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      navHistory(1)
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      interrupt(pane.id)
    } else if ((e.key === 'l' || e.key === 'k') && e.ctrlKey) {
      e.preventDefault()
      dispatch({ type: 'clearBlocks', paneId: pane.id })
    } else if (e.key === 'Escape') {
      dispatch({ type: 'setInput', paneId: pane.id, input: '' })
    } else if (e.key === 'Tab') {
      // Keep focus inside the terminal instead of leaking it to the page.
      e.preventDefault()
    }
  }

  const focusInput = (): void => {
    dispatch({ type: 'markTouched' })
    dispatch({ type: 'setActivePane', paneId: pane.id })
    cancel(pane.id) // clicking a pane that's auto-demoing hands you the prompt
    inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <div
      className={`relative flex h-full flex-col bg-term ${className ?? ''}`}
      onMouseDown={focusInput}
      role="presentation"
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 font-mono text-[12.5px] leading-[1.65]"
        style={{ color: 'var(--term-ink)' }}
      >
        {pane.blocks.map(renderBlock)}

        {pane.busy ? (
          <div className="flex items-center gap-2 py-0.5 text-ink-3">
            <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
            <span className="font-ui text-[11px]">running… (Ctrl-C to stop)</span>
          </div>
        ) : (
          <PromptRow cwd={pane.cwd} text={pane.input} caret={active} />
        )}
      </div>

      {/* Touch run bar — below xl the phone mirror (which carries the key bar) is
          hidden, so this is the on-screen way to submit / interrupt / clear. */}
      {active && (
        <div className="flex shrink-0 gap-1.5 border-t border-edge-2 bg-raised/70 px-2 py-1.5 xl:hidden">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!pane.busy) void run(pane.id, pane.input)
            }}
            className="rounded-md bg-accent px-2.5 py-1 font-mono text-[11px] font-semibold text-ink-inverse"
          >
            Run ↵
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => interrupt(pane.id)}
            className="rounded-md border border-edge bg-overlay px-2 py-1 font-mono text-[11px] text-ink"
          >
            ^C
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => dispatch({ type: 'clearBlocks', paneId: pane.id })}
            className="rounded-md border border-edge bg-overlay px-2 py-1 font-mono text-[11px] text-ink"
          >
            Clear
          </button>
          <span className="ml-auto self-center font-ui text-[10px] text-ink-3">tap above to type</span>
        </div>
      )}

      {/* Transparent capture input — clicking the pane focuses it; text renders above. */}
      <input
        ref={inputRef}
        value={pane.input}
        onChange={(e) => {
          dispatch({ type: 'markTouched' })
          dispatch({ type: 'setInput', paneId: pane.id, input: e.target.value, histIndex: -1 })
        }}
        onKeyDown={onKeyDown}
        onFocus={() => dispatch({ type: 'setActivePane', paneId: pane.id })}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={`${pane.title} terminal input`}
        className="absolute bottom-0 left-0 h-8 w-px opacity-0"
        style={{ caretColor: 'transparent' }}
      />
    </div>
  )
}
