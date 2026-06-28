import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Check,
  ChevronDown,
  CornerDownLeft,
  FilePen,
  FileText,
  Globe,
  Loader2,
  Search,
  Square,
  Terminal as TerminalIcon,
  Wrench
} from 'lucide-react'
import { useInView } from '../../lib/useInView'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { cn } from '../../lib/cn'
import { Markdown } from './Markdown'

type ToolIcon = 'bash' | 'read' | 'edit' | 'search' | 'web' | 'tool'
const toolIcons: Record<ToolIcon, typeof Wrench> = {
  bash: TerminalIcon,
  read: FileText,
  edit: FilePen,
  search: Search,
  web: Globe,
  tool: Wrench
}

export interface ToolSpec {
  name: string
  icon?: ToolIcon
  summary?: string
  preview?: string
  ms?: number
}

export type ChatStep =
  | { user: string }
  | { say: string }
  | { tool: ToolSpec }
  | { wait: number }

type Seg =
  | { kind: 'text'; text: string; streaming: boolean }
  | { kind: 'tool'; spec: ToolSpec; status: 'running' | 'ok' }

type Item =
  | { type: 'user'; text: string }
  | { type: 'assistant'; segs: Seg[] }

function ToolCard({ spec, status }: { spec: ToolSpec; status: 'running' | 'ok' }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const Icon = toolIcons[spec.icon ?? 'tool']
  return (
    <div className="overflow-hidden rounded-md border border-edge-2 bg-raised">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-100 hover:bg-overlay"
      >
        <Icon size={13} className="shrink-0 text-ink-3" />
        <span className="shrink-0 font-ui text-[12px] font-medium text-ink-2">{spec.name}</span>
        {spec.summary && (
          <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-3">
            {spec.summary}
          </code>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {status === 'running' ? (
            <Loader2 size={13} className="spin text-accent" />
          ) : (
            <Check size={13} className="text-ok" />
          )}
          <ChevronDown
            size={12}
            className={cn('text-ink-3 transition-transform duration-150', open && 'rotate-180')}
          />
        </span>
      </button>
      {open && spec.preview && (
        <div className="border-t border-edge-2 px-2.5 py-2">
          <pre className="max-h-44 overflow-auto rounded border border-edge-2 bg-term p-2 font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap text-term-ink">
            {spec.preview}
          </pre>
        </div>
      )}
    </div>
  )
}

function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [text]
}

/**
 * Scripted Agent Chat — drives a Claude Code conversation over a faux
 * stream-json feed: streamed assistant text, live tool-activity cards, a
 * working indicator, cost + permission footer. Mirrors agent/AgentChatPane.tsx.
 */
export function AgentChat({
  script,
  loop = true,
  className
}: {
  script: ChatStep[]
  loop?: boolean
  className?: string
}): React.JSX.Element {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [cost, setCost] = useState(0)
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 })
  const reduced = useReducedMotion()
  const scrollRef = useRef<HTMLDivElement>(null)
  const alive = useRef(true)

  useEffect(() => {
    if (!inView) return
    alive.current = true
    const timers: number[] = []
    const wait = (ms: number): Promise<void> =>
      new Promise((res) => {
        const id = window.setTimeout(res, reduced ? Math.min(ms, 24) : ms)
        timers.push(id)
      })

    async function run(): Promise<void> {
      const acc: Item[] = []
      let localCost = 0
      const sync = (): void => {
        if (alive.current) setItems([...acc])
      }
      const ensureAssistant = (): Extract<Item, { type: 'assistant' }> => {
        const last = acc[acc.length - 1]
        if (last && last.type === 'assistant') return last
        const a: Item = { type: 'assistant', segs: [] }
        acc.push(a)
        return a
      }

      for (const step of script) {
        if (!alive.current) return
        if ('user' in step) {
          setBusy(false)
          acc.push({ type: 'user', text: step.user })
          sync()
          await wait(650)
          setBusy(true)
          await wait(520)
        } else if ('say' in step) {
          const a = ensureAssistant()
          const seg: Seg = { kind: 'text', text: '', streaming: true }
          a.segs.push(seg)
          sync()
          if (reduced) {
            seg.text = step.say
            seg.streaming = false
            sync()
          } else {
            const toks = tokenize(step.say)
            let buf = ''
            for (const tk of toks) {
              if (!alive.current) return
              buf += tk
              seg.text = buf
              sync()
              await wait(34 + Math.random() * 38)
            }
            seg.streaming = false
            sync()
          }
          await wait(200)
        } else if ('tool' in step) {
          const a = ensureAssistant()
          const seg: Seg = { kind: 'tool', spec: step.tool, status: 'running' }
          a.segs.push(seg)
          sync()
          await wait(step.tool.ms ?? 1100)
          if (!alive.current) return
          seg.status = 'ok'
          sync()
          localCost += 0.012 + Math.random() * 0.02
          setCost(Number(localCost.toFixed(2)))
          await wait(220)
        } else if ('wait' in step) {
          await wait(step.wait)
        }
      }
      setBusy(false)
      if (loop && alive.current) {
        await wait(3200)
        if (!alive.current) return
        setItems([])
        setCost(0)
        acc.length = 0
        void run()
      }
    }
    void run()
    return () => {
      alive.current = false
      timers.forEach((t) => window.clearTimeout(t))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items, busy])

  const empty = items.length === 0

  return (
    <div ref={ref} className={cn('flex h-full min-h-0 flex-col bg-base', className)}>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-hidden">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Bot size={20} className="text-accent" />
            <p className="font-ui text-[15px] font-medium text-ink-2">Claude is standing by</p>
            <p className="max-w-[40ch] font-ui text-[12.5px] leading-relaxed text-ink-3">
              Ask anything below. File edits, commands, and searches show up as activity cards in the
              conversation.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[820px] flex-col gap-4 px-5 py-4">
            {items.map((item, i) =>
              item.type === 'user' ? (
                <div key={i} className="block-enter flex justify-end">
                  <div className="max-w-[85%] rounded-xl rounded-br-sm bg-block-cmd px-3.5 py-2.5 font-ui text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink">
                    {item.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="block-enter flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rotate-45 bg-accent" aria-hidden />
                    <span className="font-ui text-[10.5px] font-medium tracking-[0.12em] text-ink-3 uppercase">
                      Claude
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 pl-3.5">
                    {item.segs.map((seg, j) =>
                      seg.kind === 'text' ? (
                        seg.streaming ? (
                          <div
                            key={j}
                            className="font-ui text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink"
                          >
                            {seg.text}
                            <span className="caret">&nbsp;</span>
                          </div>
                        ) : (
                          <Markdown key={j} text={seg.text} />
                        )
                      ) : (
                        <ToolCard key={j} spec={seg.spec} status={seg.status} />
                      )
                    )}
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className="flex items-center gap-2 pl-3.5 text-ink-3">
                <Loader2 size={13} className="spin text-accent" />
                <span className="font-ui text-[12px]">Working…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 pb-2">
        <div className="rounded-xl border border-edge bg-term focus-within:border-accent/50">
          <div className="px-3.5 pt-3 pb-1 font-ui text-[13.5px] leading-relaxed text-ink-3">
            Message Claude — / for commands, Enter to send
          </div>
          <div className="flex items-center justify-between px-2.5 pb-2">
            <span className="pl-1 font-ui text-[10.5px] text-ink-3">
              {busy ? 'Claude is working…' : ' '}
            </span>
            {busy ? (
              <span className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 font-ui text-[11.5px] font-medium text-ink-2">
                <Square size={11} /> Stop
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 font-ui text-[11.5px] font-semibold text-ink-inverse">
                <CornerDownLeft size={11} /> Send
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-edge-2 px-4">
        <span className="truncate font-ui text-[10.5px] text-ink-3">claude-opus-4-8</span>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-ui text-[10.5px] text-ink-3 tabular-nums">${cost.toFixed(2)}</span>
          <span className="flex items-center gap-1.5 font-ui text-[10.5px] text-ink-3">
            permissions
            <span className="rounded border border-edge bg-raised px-1 py-0.5 text-ink-2">
              Accept edits
            </span>
          </span>
        </div>
      </footer>
    </div>
  )
}
