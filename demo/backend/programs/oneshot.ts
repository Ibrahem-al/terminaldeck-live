/**
 * Non-interactive forms (`claude -p`, `codex exec`, `--version`, `--help`):
 * print, then exit. These never take the terminal over, so the renderer sees
 * an ordinary command (agentDetect classifies them as `other`).
 */
import type { Program, ProgramIO } from '../contracts'
import { stripAnsi } from '../util/ansi'
import { emptyResults, plan, type AgentName, type Step } from './brain'
import { World } from './world'

/** A program that prints `text` (optionally after a "thinking" pause) and exits. */
export function printProgram(text: string | ((io: ProgramIO) => string), opts: { delayMs?: number; code?: number } = {}): Program {
  let io: ProgramIO | null = null
  return {
    start(programIo) {
      io = programIo
      const run = (): void => {
        if (!io || io.exited) return
        const body = typeof text === 'function' ? text(io) : text
        io.write(body.replace(/\r?\n/g, '\r\n') + (body.endsWith('\n') ? '' : '\r\n'))
        io.exit(opts.code ?? 0)
      }
      if (opts.delayMs) io.timers.setTimeout(run, opts.delayMs)
      else run()
    },
    input(data) {
      if (data.includes('\x03') && io && !io.exited) {
        io.write('^C\r\n')
        io.exit(130)
      }
    },
    kill() {
      io = null
    }
  }
}

/**
 * The prose a plan would say, without running tools: good enough for a
 * one-shot answer. Markdown is flattened the way `claude -p` prints it.
 */
export function oneshotAnswer(io: ProgramIO, agent: AgentName, prompt: string): string {
  const world = new World(io.backend, io.session, io.cwd)
  const r = emptyResults()
  const p = plan({ prompt, agent, world, oneshot: true })
  const said: string[] = []
  // Reads and searches are side-effect free, so a one-shot does them for real;
  // edits, commands and messages are what `-p` / `exec` leave to an interactive session.
  const walk = (steps: Step[], depth: number): void => {
    for (const step of steps) {
      try {
        if (step.t === 'read') for (const path of step.paths) r.reads[path] = world.read(path)
        else if (step.t === 'search') r.searches[step.pattern] = world.grep(step.pattern, step.path ?? '.')
        else if (step.t === 'say') said.push(step.text(r))
        else if (step.t === 'then' && depth < 4) walk(step.next(r), depth + 1)
      } catch {
        /* a step that needs results a one-shot doesn't produce */
      }
    }
  }
  const edits = p.steps.filter((s): s is Extract<Step, { t: 'edit' }> => s.t === 'edit')
  if (edits.length) {
    const how = agent === 'codex' ? 'This exec session runs in a read-only sandbox, so I made no changes. Re-run with `--sandbox workspace-write`' : "Print mode can't ask for permission, so I made no changes. Re-run with `--permission-mode acceptEdits`"
    return [`${how}, or start an interactive session. The plan:`, ...edits.map((e, i) => `${i + 1}. ${e.why} (${e.path})`)].join('\n')
  }
  walk(p.steps, 0)
  const text = said.length ? said[said.length - 1] : "I'd need to run tools for that; start an interactive session instead."
  return stripAnsi(text).replace(/\*\*([^*]+)\*\*/g, '$1')
}

/** Split `argv` into flags and the first positional (prompt) — quotes already removed by the shell. */
export function positional(argv: string[], flagsWithValue: string[] = []): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (flagsWithValue.includes(a)) {
      i++
      continue
    }
    if (a.startsWith('-')) continue
    return argv.slice(i).join(' ').replace(/^["']|["']$/g, '')
  }
  return null
}

/** Value of `--flag value` or `--flag=value`. */
export function flagValue(argv: string[], ...names: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    for (const n of names) {
      if (argv[i] === n) return argv[i + 1] ?? ''
      if (argv[i].startsWith(`${n}=`)) return argv[i].slice(n.length + 1)
    }
  }
  return null
}
