import { useEffect, useState, type ReactNode } from 'react'
import { Section } from '../ui/Section'
import { Kbd } from '../ui/Kbd'
import { cn } from '../../lib/cn'
import { ISSUES_URL } from '../../lib/links'
import { INSTALLER, MESSAGING, REQUIREMENTS, SHELLS, SINGLE_FACTS } from '../../lib/facts'

/**
 * Questions: honest, specific answers from the brief and the feature reports.
 * Accessible disclosure: each question is an h3 holding a button with aria-expanded / aria-controls;
 * the answer follows its button and uses `hidden` when closed (no region role; the APG disclosure pattern needs none).
 * Opening /#faq-<id> (or following an in-page link to it) opens that answer.
 */

interface QA {
  id: string
  q: string
  a: ReactNode
}

const QUESTIONS: QA[] = [
  {
    id: 'agents',
    q: 'Which coding agents work in it?',
    a: (
      <>
        <p>
          Anything that runs in a terminal. Every pane is a real shell ({SHELLS.join(', ').replace(/, ([^,]*)$/, ' or $1')}), so
          Claude Code, Codex, Gemini CLI, aider or your own scripts run exactly as they do anywhere else.
        </p>
        <p>
          Claude Code and Codex get the most out of it. Every <code>claude</code> and <code>codex</code> you start in a pane is
          handed TerminalDeck&rsquo;s tools, so they can see the other panes and message each other, and Claude Code can tell
          the Notch exactly when it has a question. Other CLIs still light up the Notch through the terminal bell, OSC 9
          notifications and a scan of the screen, and their panes still name themselves.
        </p>
      </>
    )
  },
  {
    id: 'free',
    q: 'Is it free?',
    a: (
      <p>
        Yes. The download is free, and there&rsquo;s no account to create and nothing to sign in to. The installer is{' '}
        {INSTALLER.sizeLabel} and comes straight from the project&rsquo;s GitHub releases.
      </p>
    )
  },
  {
    id: 'privacy',
    q: 'Does anything leave my machine?',
    a: (
      <>
        <p>
          TerminalDeck has no account, no cloud and no telemetry. Your decks, settings and projects stay on your PC, and
          project environment variables are stored encrypted. Your agents talk to their own providers, as they would in
          any terminal.
        </p>
        <p>The app itself only reaches out in three cases:</p>
        <ul>
          <li>It checks GitHub for a new version when it starts.</li>
          <li>
            If you turn on Phone access, it downloads the phone server ({SINGLE_FACTS.phoneServerMb}) once. Your phone then
            connects to your PC over your own Wi-Fi or Tailscale.
          </li>
          <li>
            If you switch pane names to Smart (the default is Auto), it runs <code>claude -p</code> now and then to title
            busy panes, which uses your own Claude account. Auto never calls out.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'smartscreen',
    q: 'Why does Windows SmartScreen warn me when I install it?',
    a: (
      <p>
        The installer isn&rsquo;t Authenticode-signed, so SmartScreen doesn&rsquo;t recognise it yet and warns you the first
        time. Choose <b>More info</b>, then <b>Run anyway</b>. Updates are a different story: each one is signed with
        minisign and checked with SHA-512 before it installs, and the signature file sits next to the installer on the
        releases page.
      </p>
    )
  },
  {
    id: 'phone',
    q: 'Can I use it from my phone?',
    a: (
      <>
        <p>
          Yes, if you turn it on. In Settings, switch on Phone access and pair the T3 Code mobile app with a QR code, over
          Wi-Fi or Tailscale. Your panes show up on the phone as threads grouped by folder, and the phone drives the very
          same terminal sessions as your desktop.
        </p>
        <p>
          Phone access is off by default. When you turn it on, the phone server ({SINGLE_FACTS.phoneServerMb}) downloads
          once, which is why the installer itself is only {INSTALLER.sizeLabel}. At your desk, the app can also show a
          desktop notification when a task finishes (Settings, then Notch).
        </p>
      </>
    )
  },
  {
    id: 'typing',
    q: 'Can agents type into my shells without asking?',
    a: (
      <>
        <p>
          They can type into another pane&rsquo;s shell, and that is on by default, but only within limits. An agent can
          never type into its own pane, an editor, or a pane where another agent is running; agents talk to each other with
          messages instead. A shell that&rsquo;s busy running something is refused unless the agent explicitly overrides
          that.
        </p>
        <p>
          Codex is set up to ask you before it types into a pane or sends a message. Claude Code applies its own permission
          rules, as it does for any tool.
        </p>
        <p>
          A message is typed into an agent only when that agent is idle with an empty input
          box, and never into one running without approvals unless you allow it. If two agents go back and forth 8 times in
          2 minutes, the pair is paused. Everything is logged in the Messages drawer (<Kbd>Ctrl+Shift+X</Kbd>).
        </p>
        <p>
          To turn it off, go to Settings, then Deck tools, and switch off <b>Allow sending to panes</b>, or switch off{' '}
          <b>Let agents work with the other panes</b> to hand them no tools at all.
        </p>
      </>
    )
  },
  {
    id: 'hooks',
    q: 'How do I get the Claude Code hooks?',
    a: (
      <>
        <p>
          In Settings, open Notch and choose <b>Install hooks</b>. That adds four entries (SessionStart, Notification, Stop
          and SessionEnd) to <code>~/.claude/settings.json</code> and keeps any hooks you already have. From then on, new{' '}
          <code>claude</code> sessions tell the Notch exactly when they ask a question or finish a turn.
        </p>
        <p>
          The hooks only do something inside TerminalDeck; a <code>claude</code> you run anywhere else is unaffected. The
          same button removes them. Without hooks, the Notch falls back to its heuristics.
        </p>
      </>
    )
  },
  {
    id: 'wsl',
    q: 'Does it work with WSL?',
    a: (
      <p>
        Not as a shell of its own in 0.3.9. The shell picker offers {SHELLS.join(', ').replace(/, ([^,]*)$/, ' and $1')}.
        You can run <code>wsl</code> inside any of them and use it as a terminal, but agent messaging only works for{' '}
        <code>claude</code> and <code>codex</code> started directly in {MESSAGING.shells}, not inside WSL.
      </p>
    )
  },
  {
    id: 'platforms',
    q: 'Is there a Mac or Linux version?',
    a: (
      <p>
        No. TerminalDeck ships for {REQUIREMENTS.osShort} only, as a {INSTALLER.arch} installer, and uses the WebView2 that
        Windows already has.
      </p>
    )
  }
]

const idFor = (id: string) => `faq-${id}`

export function Faq() {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())

  // Deep links: /#faq-wsl opens (and scrolls to) that answer.
  useEffect(() => {
    const fromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1))
      const hit = QUESTIONS.find((item) => idFor(item.id) === hash)
      if (hit) setOpen((prev) => new Set(prev).add(hit.id))
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Section id="faq" labelledBy="faq-title" grid>
      <div className="col-span-12 min-[1100px]:col-span-4">
        <div className="flex flex-col gap-4 min-[1100px]:sticky min-[1100px]:top-[calc(var(--nav-h)+40px)]">
          <h2 id="faq-title" className="h2 h2-sm">
            Questions
          </h2>
          <p className="sec-lede max-w-[24em]">
            Straight answers, including what the agents are allowed to do and what leaves your PC. Something missing?{' '}
            <a className="textlink" href={ISSUES_URL}>
              Ask on GitHub
            </a>
            .
          </p>
        </div>
      </div>

      <div className="col-span-12 mt-12 border-t border-line-strong min-[1100px]:col-span-7 min-[1100px]:col-start-6 min-[1100px]:mt-0 max-[640px]:mt-10">
        {QUESTIONS.map((item) => (
          <Item key={item.id} item={item} open={open.has(item.id)} onToggle={() => toggle(item.id)} />
        ))}
      </div>
    </Section>
  )
}

function Item({ item, open, onToggle }: { item: QA; open: boolean; onToggle: () => void }) {
  const panelId = `${idFor(item.id)}-answer`
  const buttonId = `${idFor(item.id)}-q`
  return (
    <div id={idFor(item.id)} className="scroll-mt-[calc(var(--nav-h)+24px)] border-b border-line">
      <h3 className="m-0">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={cn(
            'group flex w-full cursor-pointer items-center justify-between gap-8 bg-transparent py-7 text-left text-fg',
            'text-[1.375rem] leading-[1.3] font-semibold [font-stretch:104%]',
            'max-[640px]:gap-4 max-[640px]:py-5 max-[640px]:text-[1.1875rem]'
          )}
        >
          <span className="text-pretty decoration-line-strong decoration-1 underline-offset-[6px] group-hover:underline">
            {item.q}
          </span>
          <Toggle open={open} />
        </button>
      </h3>
      <div
        id={panelId}
        hidden={!open}
        className={cn(
          'max-w-[65ch] pr-16 pb-9 text-18 leading-[1.65] text-fg text-pretty max-[640px]:pr-0 max-[640px]:pb-7',
          '[&_p+p]:mt-4 [&_p+ul]:mt-3 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5 [&_li+li]:mt-2 [&_li::marker]:text-fg-2',
          '[&_b]:font-semibold [&_b]:text-fg [&_code]:text-fg'
        )}
      >
        {item.a}
      </div>
    </div>
  )
}

/** Plus / minus in a hairline circle: the vertical stroke folds away when the answer is open. */
function Toggle({ open }: { open: boolean }) {
  return (
    <span
      className={cn(
        'grid size-9 flex-none place-items-center rounded-full border border-line-strong transition-colors duration-150',
        'group-hover:border-fg max-[640px]:size-8',
        open && 'border-fg'
      )}
      aria-hidden="true"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" className="overflow-visible">
        <path d="M1 8h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
        <path
          d="M8 1v14"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="square"
          className={cn('origin-center transition-transform duration-200 ease-chart', open && 'scale-y-0')}
          style={{ transformBox: 'fill-box' }}
        />
      </svg>
    </span>
  )
}
