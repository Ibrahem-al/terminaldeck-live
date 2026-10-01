/**
 * Test outcomes that follow the code under test. The scenario ships one real
 * bug (`formatWeight` keeps the `.0` of whole kilos), so its test fails until
 * the source is fixed — by the visitor in the editor or by an agent — and
 * passes from then on, with no marker in the test file giving it away.
 */

export interface CheckedFailure {
  /** The assertion message vitest prints. */
  message: string
  /** 1-based line in the test file the failure points at. */
  line: number
}

interface Check {
  test: RegExp
  name: RegExp
  /** The module under test, relative to the test file's folder. */
  source: string
  fails: (source: string) => string | null
  /** The assertion that trips, to point the code frame at. */
  at: RegExp
}

const CHECKS: Check[] = [
  {
    test: /(^|\/)src\/format\.test\.tsx?$/,
    name: /^formats weights/,
    source: 'format.ts',
    fails: (src) =>
      /\$\{\(grams \/ 1000\)\.toFixed\(1\)\} kg/.test(src) ? "expected '2.0 kg' to be '2 kg' // Object.is equality" : null,
    at: /formatWeight\(2000\)/
  }
]

export function checkedFailure(
  rel: string,
  testName: string,
  lines: string[],
  from: number,
  to: number,
  readBeside: (name: string) => string | null
): CheckedFailure | null {
  for (const c of CHECKS) {
    if (!c.test.test(rel) || !c.name.test(testName)) continue
    const src = readBeside(c.source)
    const message = src === null ? null : c.fails(src)
    if (!message) return null
    let line = from + 1
    for (let i = from; i < to; i++)
      if (c.at.test(lines[i])) {
        line = i + 1
        break
      }
    return { message, line }
  }
  return null
}
