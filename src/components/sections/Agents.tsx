import { Bot, Coins, Hand, ShieldQuestion, Workflow, Zap } from 'lucide-react'
import { Section } from '../ui/Section'
import { Reveal } from '../ui/Reveal'
import { AppWindow } from '../app/AppWindow'
import { PaneFrame } from '../app/PaneFrame'
import { AgentChat } from '../app/AgentChat'
import { Terminal } from '../app/Terminal'
import { featureAgent, featureTerminal } from '../../content/scripts'

const points = [
  {
    icon: Zap,
    title: 'Streamed, not scraped',
    body: 'Driven over Claude Code’s stream-json protocol. You see typed events and tool calls, not a scraped TUI.'
  },
  {
    icon: ShieldQuestion,
    title: 'Permission modes',
    body: 'Ask, Accept edits, Plan only, or Bypass. Approve or deny a tool call inline, mid-conversation.'
  },
  {
    icon: Coins,
    title: 'Per-session cost',
    body: 'Every turn’s cost in USD and duration, surfaced live in the footer of each agent pane.'
  },
  {
    icon: Workflow,
    title: 'Parallel agents',
    body: 'Open many agent panes across tabs. Run several Claude Code sessions at once, each in its own repo.'
  }
]

const modes = ['Ask', 'Accept edits', 'Plan only', 'Bypass']

export function Agents(): React.JSX.Element {
  return (
    <Section id="agents" className="py-24 sm:py-32">
      <div className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14">
        {/* Copy */}
        <div>
          <Reveal as="span" className="inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.22em] text-accent uppercase">
            <Bot size={14} /> AI agents
          </Reveal>
          <Reveal as="h2" delay={60} className="mt-4 max-w-[16ch] font-ui text-[clamp(1.9rem,4vw,2.9rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-ink text-balance">
            Claude Code, as a real chatbox.
          </Reveal>
          <Reveal as="p" delay={110} className="mt-5 max-w-[46ch] font-ui text-[1.05rem] leading-relaxed text-ink-2 text-pretty">
            Launch Claude Code in any pane as a true terminal, or as a streaming chat with
            tool-activity cards, permission prompts, and a stop button. Same agent, your choice of surface.
          </Reveal>

          <div className="mt-7 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {points.map((p, i) => (
              <Reveal key={p.title} delay={140 + i * 60} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <p.icon size={16} />
                </span>
                <span>
                  <span className="block font-ui text-[14px] font-semibold text-ink">{p.title}</span>
                  <span className="mt-1 block font-ui text-[13px] leading-relaxed text-ink-3">
                    {p.body}
                  </span>
                </span>
              </Reveal>
            ))}
          </div>

          <Reveal delay={360} className="mt-7 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-ui text-[12px] text-ink-3">
              <Hand size={13} className="text-accent" /> permissions
            </span>
            {modes.map((m, i) => (
              <span
                key={m}
                className={`rounded-md border px-2 py-1 font-ui text-[11.5px] font-medium ${
                  i === 1 ? 'border-accent/50 bg-accent-soft text-accent' : 'border-edge text-ink-2'
                }`}
              >
                {m}
              </span>
            ))}
          </Reveal>
        </div>

        {/* Live agent + terminal */}
        <Reveal delay={120}>
          <AppWindow
            project={{ name: 'api-gateway', color: '#5b9dd9' }}
            decks={[
              { name: 'api-gateway', color: '#5b9dd9', active: true },
              { name: 'infra', color: '#46c79c' }
            ]}
            className="h-[clamp(440px,56vw,540px)]"
          >
            <div className="grid h-full grid-rows-[1.55fr_1fr] gap-2 p-2">
              <PaneFrame kind="agent" title="Agent Chat" badge={{ label: 'Claude Code', color: '#d8a956' }} active>
                <AgentChat script={featureAgent} />
              </PaneFrame>
              <PaneFrame kind="terminal" title="pwsh" cwd="api-gateway">
                <Terminal script={featureTerminal} defaultCwd="C:\\repos\\api" />
              </PaneFrame>
            </div>
          </AppWindow>
        </Reveal>
      </div>
    </Section>
  )
}
