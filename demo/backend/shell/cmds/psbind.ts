/**
 * PowerShell parameter binding, small: named parameters (prefix-matched,
 * case-insensitive), switches and positionals — with the real error when a
 * name matches nothing (`ls -la` in PowerShell is an error, as it should be).
 */
import { psError } from '../dialect'
import type { Ctx } from './context'

export interface PsSpec {
  /** Parameters that take a value, in positional order first (`Path`, `Destination`). */
  params: string[]
  /** How many of `params` bind positionally. */
  positional?: number
  switches?: string[]
  /** Aliases → canonical name (`fo` → `Force`). */
  aliases?: Record<string, string>
}

export interface PsBound {
  values: Record<string, string>
  switches: Set<string>
  /** Positionals beyond the declared ones (wildcards, extra paths). */
  rest: string[]
}

export function fqid(cmdlet: string, id: string): string {
  return `${id},Microsoft.PowerShell.Commands.${cmdlet.replace('-', '')}Command`
}

/** Bind `ctx.argv`, or print the binding error and return null. */
export function bindPs(ctx: Ctx, cmdlet: string, spec: PsSpec): PsBound | null {
  const all = [...spec.params, ...(spec.switches ?? [])]
  const values: Record<string, string> = {}
  const switches = new Set<string>()
  const rest: string[] = []
  let pos = 0
  const words = ctx.words.slice(1)
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (!w.quoted && /^-[A-Za-z]/.test(w.value)) {
      const raw = w.value.slice(1).replace(/:$/, '')
      const lower = raw.toLowerCase()
      const alias = spec.aliases?.[lower]
      const matches = alias ? [alias] : all.filter((n) => n.toLowerCase().startsWith(lower))
      const exact = all.find((n) => n.toLowerCase() === lower)
      const name = exact ?? (matches.length === 1 ? matches[0] : null)
      if (!name) {
        ctx.write(
          psError(ctx.d.ps7, {
            source: cmdlet,
            message:
              matches.length > 1
                ? `Parameter cannot be processed because the parameter name '${raw}' is ambiguous. Possible matches include: ${matches.map((m) => '-' + m).join(' ')}.`
                : `A parameter cannot be found that matches parameter name '${raw}'.`,
            line: ctx.line,
            offset: w.start,
            length: w.raw.length,
            category: `InvalidArgument: (:) [${cmdlet}], ParameterBindingException`,
            fqid: fqid(cmdlet, matches.length > 1 ? 'AmbiguousParameter' : 'NamedParameterNotFound')
          })
        )
        return null
      }
      if (spec.switches?.includes(name)) switches.add(name)
      else {
        const v = words[i + 1]
        if (!v) {
          ctx.write(
            psError(ctx.d.ps7, {
              source: cmdlet,
              message: `Missing an argument for parameter '${name}'. Specify a parameter of type 'System.String' and try again.`,
              line: ctx.line,
              offset: w.start,
              length: w.raw.length,
              category: `InvalidArgument: (:) [${cmdlet}], ParameterBindingException`,
              fqid: fqid(cmdlet, 'MissingArgument')
            })
          )
          return null
        }
        values[name] = v.value
        i++
      }
      continue
    }
    const positional = spec.params.slice(0, spec.positional ?? 1).filter((p) => !(p in values))
    if (pos < (spec.positional ?? 1) && positional.length > 0) {
      values[positional[0]] = w.value
      pos++
    } else rest.push(w.value)
  }
  return { values, switches, rest }
}
