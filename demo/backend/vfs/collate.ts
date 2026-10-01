/**
 * The file tree's name order — a port of `collation_key` in
 * src-tauri/src/fsx/mod.rs: CLDR-root classes (whitespace < punctuation <
 * digits < letters), case and Latin diacritics folded. So `_docs`, `[id]`,
 * `2024`, `apple` list in the same order as in the app.
 */

const PUNCT_ORDER = [
  '_', '-', ',', ';', ':', '!', '?', '.', "'", '"', '(', ')', '[', ']', '{', '}', '@', '*', '/',
  '\\', '&', '#', '%', '`', '´', '^', '¨', '°', '©', '®', '+', '±', '÷', '×', '<', '=', '>', '¬',
  '|', '~', '¤', '¢', '$', '£', '¥', '€'
]
const PUNCT_RANK = new Map(PUNCT_ORDER.map((c, i) => [c, i]))

type Weight = [cls: number, weight: number]

function weights(name: string): Weight[] {
  const out: Weight[] = []
  // NFD + dropping combining marks is the fold the Rust table spells out by hand.
  for (const ch of name.normalize('NFD')) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0x300 && cp <= 0x36f) continue
    const c = ch.toLowerCase()
    const code = c.codePointAt(0) ?? 0
    if (/\s/u.test(c) || /\p{Cc}/u.test(c)) out.push([0, code])
    else if (/\p{N}/u.test(c)) out.push([2, code])
    else if (/\p{L}/u.test(c)) out.push([3, code])
    else out.push([1, PUNCT_RANK.get(c) ?? 0x10000 + code])
  }
  return out
}

const cache = new Map<string, Weight[]>()
function cachedWeights(name: string): Weight[] {
  let w = cache.get(name)
  if (!w) {
    w = weights(name)
    if (cache.size > 5000) cache.clear()
    cache.set(name, w)
  }
  return w
}

export function collate(a: string, b: string): number {
  const wa = cachedWeights(a)
  const wb = cachedWeights(b)
  const n = Math.min(wa.length, wb.length)
  for (let i = 0; i < n; i++) {
    const d = wa[i][0] - wb[i][0] || wa[i][1] - wb[i][1]
    if (d) return d
  }
  return wa.length - wb.length
}

/** fs_read_dir's order: directories first, then collation. */
export function compareEntries(a: { name: string; isDir: boolean }, b: { name: string; isDir: boolean }): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  return collate(a.name, b.name)
}
