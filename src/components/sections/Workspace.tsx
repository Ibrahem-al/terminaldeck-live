import { useState } from 'react'
import { Section, SectionHeading } from '../ui/Section'
import { Reveal } from '../ui/Reveal'
import { AppWindow } from '../app/AppWindow'
import { PaneFrame, type PaneKind, type Badge } from '../app/PaneFrame'
import { A, L, s, type Line } from '../app/Terminal'
import { cn } from '../../lib/cn'

interface Template {
  id: string
  label: string
  rows: number
  cols: number
}
const TEMPLATES: Template[] = [
  { id: 'single', label: 'Single', rows: 1, cols: 1 },
  { id: 'split', label: 'Split', rows: 1, cols: 2 },
  { id: 'quad', label: 'Quad', rows: 2, cols: 2 },
  { id: 'six', label: 'Six', rows: 2, cols: 3 },
  { id: 'eight', label: 'Eight', rows: 2, cols: 4 }
]

interface PaneDef {
  kind: PaneKind
  title: string
  cwd?: string
  badge?: Badge
  lines: Line[]
}

const PANES: PaneDef[] = [
  {
    kind: 'agent',
    title: 'Agent Chat',
    badge: { label: 'Claude Code', color: '#d8a956' },
    lines: [
      L(s('◆ ', 'var(--accent)'), s('CLAUDE', A(8))),
      L(s('Refactoring the auth middleware', A(7))),
      L(s('✓ ', A(2)), s('Edit src/auth.ts', A(8))),
      L(s('✓ ', A(2)), s('28 tests pass', A(8)))
    ]
  },
  {
    kind: 'terminal',
    title: 'pwsh',
    cwd: 'web',
    badge: { label: 'Dev Server', color: '#4cc38a' },
    lines: [
      L(s('VITE ', A(2)), s('v6.0.5 ready', A(8))),
      L(s('➜ ', A(2)), s('http://localhost:5173', A(4))),
      L(s('  hmr update /App.tsx', A(8)))
    ]
  },
  {
    kind: 'terminal',
    title: 'git-bash',
    cwd: 'api',
    badge: { label: 'Git', color: '#e8b130' },
    lines: [
      L(s('$ ', A(3)), s('git push origin main', A(7))),
      L(s('Enumerating objects: 12, done.', A(8))),
      L(s('To github.com:me/api.git', A(8))),
      L(s('   9c4f1a2..b71c0de  main', A(2)))
    ]
  },
  {
    kind: 'terminal',
    title: 'pwsh',
    cwd: 'worker',
    badge: { label: 'Test Runner', color: '#b583d9' },
    lines: [
      L(s('RUN ', A(8)), s('v2.1.4', A(8))),
      L(s('✓ ', A(2)), s('queue.test.ts (11)', A(7))),
      L(s('✓ ', A(2)), s('retry.test.ts (7)', A(7))),
      L(s('Tests  18 passed', A(2)))
    ]
  },
  {
    kind: 'agent',
    title: 'Agent Chat',
    cwd: 'docs',
    badge: { label: 'Claude Code', color: '#d8a956' },
    lines: [
      L(s('◆ ', 'var(--accent)'), s('CLAUDE', A(8))),
      L(s('Writing the API reference', A(7))),
      L(s('● Read src/router.ts', A(6)))
    ]
  },
  {
    kind: 'terminal',
    title: 'pwsh',
    cwd: 'infra',
    lines: [
      L(s('PS ', A(8)), s('docker compose up', A(7))),
      L(s(' ✔ db', A(2)), s('  Started', A(8))),
      L(s(' ✔ redis', A(2)), s('  Started', A(8)))
    ]
  },
  {
    kind: 'editor',
    title: 'rateLimit.ts',
    lines: [
      L(s('export ', A(5)), s('function ', A(4)), s('tokenBucket', A(3)), s('(opts) {', A(7))),
      L(s('  const ', A(4)), s('hits = ', A(7)), s('new Map()', A(6))),
      L(s('  return', A(5)), s(' (req, res, next) => {', A(7))),
      L(s('}', A(7)))
    ]
  },
  {
    kind: 'terminal',
    title: 'cmd',
    cwd: 'scripts',
    lines: [
      L(s('C:\\scripts>', A(8)), s(' node seed.js', A(7))),
      L(s('seeded 1,204 rows', A(2))),
      L(s('done in 0.8s', A(8)))
    ]
  }
]

function MiniBody({ lines }: { lines: Line[] }): React.JSX.Element {
  return (
    <div
      className="h-full overflow-hidden bg-term px-2.5 py-2 font-mono text-[10.5px] leading-[1.6]"
      style={{ color: 'var(--term-ink)' }}
    >
      {lines.map((line, i) => (
        <div key={i} className="truncate">
          {line.map((sg, j) => (
            <span key={j} style={{ color: sg.c ?? 'var(--term-ink)' }}>
              {sg.t}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

export function Workspace(): React.JSX.Element {
  const [tpl, setTpl] = useState<Template>(TEMPLATES[2])
  const count = tpl.rows * tpl.cols
  const panes = PANES.slice(0, count)

  return (
    <Section className="py-24 sm:py-32">
      <SectionHeading
        title="Command a fleet at a glance."
        sub="One to sixteen resizable panes per tab. Lay them out, badge them, pin them, and tell which agent is which without squinting."
      />

      <Reveal delay={80} className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {TEMPLATES.map((t) => {
          const isActive = t.id === tpl.id
          return (
            <button
              key={t.id}
              onClick={() => setTpl(t)}
              aria-pressed={isActive}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border px-3.5 py-2.5 transition-colors duration-100',
                isActive ? 'border-accent/60 bg-accent-soft' : 'border-edge-2 hover:border-edge'
              )}
            >
              <span
                className="grid gap-[2px]"
                style={{
                  width: 40,
                  height: 26,
                  gridTemplateRows: `repeat(${t.rows}, 1fr)`,
                  gridTemplateColumns: `repeat(${t.cols}, 1fr)`
                }}
              >
                {Array.from({ length: t.rows * t.cols }).map((_, i) => (
                  <span
                    key={i}
                    className={cn('rounded-[2px]', isActive ? 'bg-accent/70' : 'bg-edge')}
                  />
                ))}
              </span>
              <span
                className={cn(
                  'font-ui text-[11.5px] font-medium',
                  isActive ? 'text-accent' : 'text-ink-3'
                )}
              >
                {t.label}
              </span>
            </button>
          )
        })}
      </Reveal>

      <Reveal delay={120} className="mt-8">
        <AppWindow
          project={{ name: 'monorepo', color: '#46c79c' }}
          decks={[
            { name: 'monorepo', color: '#46c79c', active: true },
            { name: 'experiments', color: '#cca3e8' }
          ]}
          className="h-[clamp(380px,46vw,520px)]"
        >
          <div
            className="grid h-full gap-2 p-2"
            style={{
              gridTemplateRows: `repeat(${tpl.rows}, minmax(0, 1fr))`,
              gridTemplateColumns: `repeat(${tpl.cols}, minmax(0, 1fr))`
            }}
          >
            {panes.map((p, i) => (
              <PaneFrame
                key={`${tpl.id}-${i}`}
                kind={p.kind}
                title={p.title}
                cwd={count <= 4 ? p.cwd : undefined}
                badge={count <= 6 ? p.badge : undefined}
                active={i === 0}
              >
                <MiniBody lines={p.lines} />
              </PaneFrame>
            ))}
          </div>
        </AppWindow>
      </Reveal>
    </Section>
  )
}
