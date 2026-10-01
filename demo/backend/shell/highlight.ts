/**
 * PSReadLine's default token colours for the line being typed: command
 * yellow, parameters and operators grey, strings dark cyan, variables green,
 * numbers white. Returns one SGR prefix per character (same length as the line).
 */
const COMMAND = '\x1b[93m'
const PARAM = '\x1b[90m'
const STRING = '\x1b[36m'
const VARIABLE = '\x1b[92m'
const NUMBER = '\x1b[97m'
const OPERATOR = '\x1b[90m'
const DEFAULT = '\x1b[39m'

export function highlightPs(line: string): string[] {
  const chars = [...line]
  const out: string[] = new Array(chars.length).fill(DEFAULT)
  let i = 0
  let expectCommand = true
  while (i < chars.length) {
    const c = chars[i]
    if (c === ' ' || c === '\t') {
      i++
      continue
    }
    if (c === '|' || c === ';' || c === '&' || c === '>' || c === '<' || c === '=') {
      out[i] = OPERATOR
      if (c !== '>' && c !== '<' && c !== '=') expectCommand = true
      i++
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < chars.length && chars[j] !== c) j++
      for (let k = i; k <= Math.min(j, chars.length - 1); k++) out[k] = STRING
      i = j + 1
      expectCommand = false
      continue
    }
    // A bare word up to the next separator.
    let j = i
    while (j < chars.length && !' \t|;&<>="\''.includes(chars[j])) j++
    const word = chars.slice(i, j).join('')
    const colour = c === '$'
      ? VARIABLE
      : expectCommand
        ? /^[\d.]+$/.test(word)
          ? NUMBER
          : COMMAND
        : c === '-' && word.length > 1 && !/^-?\d/.test(word)
          ? PARAM
          : /^\d+(\.\d+)?$/.test(word)
            ? NUMBER
            : DEFAULT
    for (let k = i; k < j; k++) out[k] = colour
    // `$x = …` is an assignment, not a command.
    expectCommand = false
    i = j
  }
  return out
}
