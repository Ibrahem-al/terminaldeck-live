/**
 * Line diffs for `git diff` and the agents' edit previews. Myers' O(ND)
 * algorithm on lines; fine for the few-hundred-line files of the scenario.
 */

export type DiffOp = { op: 'equal' | 'delete' | 'insert'; line: string }

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  /** Each line prefixed ' ', '-' or '+'. */
  lines: string[]
}

export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split(/\r?\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function diffLines(oldText: string, newText: string): DiffOp[] {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  const n = a.length
  const m = b.length
  const max = n + m
  const v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  const off = max + 1
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[off + k] = x
      if (x >= n && y >= m) break outer
    }
  }
  // Walk the trace backwards to recover the edit script.
  const ops: DiffOp[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d]
    const k = x - y
    const prevK = k === -d || (k !== d && vd[off + k - 1] < vd[off + k + 1]) ? k + 1 : k - 1
    const prevX = vd[off + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      ops.push({ op: 'equal', line: a[--x] })
      y--
    }
    if (d > 0) {
      if (x === prevX) ops.push({ op: 'insert', line: b[--y] })
      else ops.push({ op: 'delete', line: a[--x] })
    }
  }
  return ops.reverse()
}

/** Group an edit script into unified hunks with `context` lines around changes. */
export function hunks(ops: DiffOp[], context = 3): DiffHunk[] {
  const out: DiffHunk[] = []
  let oldNo = 1
  let newNo = 1
  let cur: DiffHunk | null = null
  let trailing = 0
  for (let i = 0; i < ops.length; i++) {
    const { op, line } = ops[i]
    if (op === 'equal') {
      if (cur) {
        const nextChange = ops.slice(i, i + context * 2 + 1).some((o) => o.op !== 'equal')
        if (trailing < context || nextChange) {
          cur.lines.push(' ' + line)
          cur.oldLines++
          cur.newLines++
          trailing = nextChange ? 0 : trailing + 1
        } else {
          out.push(cur)
          cur = null
        }
      }
      oldNo++
      newNo++
      continue
    }
    if (!cur) {
      const lead = Math.min(context, i, oldNo - 1)
      const start = i - lead
      cur = { oldStart: oldNo - lead, newStart: newNo - lead, oldLines: lead, newLines: lead, lines: [] }
      for (let j = start; j < i; j++) cur.lines.push(' ' + ops[j].line)
    }
    trailing = 0
    if (op === 'delete') {
      cur.lines.push('-' + line)
      cur.oldLines++
      oldNo++
    } else {
      cur.lines.push('+' + line)
      cur.newLines++
      newNo++
    }
  }
  if (cur) out.push(cur)
  return out
}

/** `git diff`-style text (no colour) for one file. */
export function unifiedDiff(path: string, oldText: string | null, newText: string | null, context = 3): string {
  const header = [
    `diff --git a/${path} b/${path}`,
    oldText === null ? 'new file mode 100644' : newText === null ? 'deleted file mode 100644' : '',
    `--- ${oldText === null ? '/dev/null' : `a/${path}`}`,
    `+++ ${newText === null ? '/dev/null' : `b/${path}`}`
  ].filter(Boolean)
  const body = hunks(diffLines(oldText ?? '', newText ?? ''), context).flatMap((h) => [
    `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
    ...h.lines
  ])
  return [...header, ...body].join('\n')
}

/** Added / removed line counts ("Updated with 38 additions and 12 removals"). */
export function diffStat(oldText: string, newText: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const o of diffLines(oldText, newText)) {
    if (o.op === 'insert') added++
    else if (o.op === 'delete') removed++
  }
  return { added, removed }
}
