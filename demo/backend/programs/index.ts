/**
 * The program registry, with every simulated agent registered: Claude Code,
 * Codex and Gemini as full TUIs, and the lighter aider / opencode / copilot /
 * qwen / cursor-agent / amp. The shell resolves names (and `npx <package>`)
 * here; it may register its own long runners too.
 */
import type { Backend, ModuleInstance, ProgramRegistry, ProgramSpec } from '../contracts'
import { claudeSpec } from './claude'
import { codexSpec } from './codex'
import { geminiSpec } from './gemini'
import { otherSpecs } from './others'

export function createPrograms(_backend: Backend): ModuleInstance<ProgramRegistry> {
  const specs = new Map<string, ProgramSpec>()

  const normalize = (name: string): string =>
    name
      .toLowerCase()
      .replace(/^.*[\\/](?=[^\\/]+$)/, (m) => (m.startsWith('@') ? m : ''))
      .replace(/\.(exe|cmd|ps1|bat)$/, '')
      .replace(/@(latest|next|[\d.]+)$/, '')

  const service: ProgramRegistry = {
    register(spec) {
      const names = [spec.name, ...(spec.aliases ?? [])].map(normalize)
      for (const n of names) specs.set(n, spec)
      return () => {
        for (const n of names) if (specs.get(n) === spec) specs.delete(n)
      }
    },
    get: (name) => specs.get(normalize(name)),
    list: () => [...new Set(specs.values())]
  }

  for (const spec of [claudeSpec, codexSpec, geminiSpec, ...otherSpecs]) service.register(spec)

  return { service, commands: {} }
}
