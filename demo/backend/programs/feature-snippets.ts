/**
 * The code the agents write for the features and fixes beyond the tour: each
 * transform takes the file's current text and returns it changed, or the same
 * text when the change is already there (so a second run reads, not rewrites).
 */

/* ── readiness probe: GET /health/ready ── */

export function addReadiness(text: string): string {
  if (text.includes("'/ready'")) return text
  const withTimeout = text.replace(
    /(const startedAt = Date\.now\(\)\n)/,
    '$1\n/** Resolves false after `ms`: a database that answers slowly is not ready either. */\nconst timeout = (ms: number) => new Promise<false>((resolve) => setTimeout(() => resolve(false), ms))\n'
  )
  return withTimeout.replace(
    /\n {2}return router\n\}/,
    [
      '',
      '  // Readiness, unlike /health: fail fast while the database is slow or down, so the',
      '  // load balancer stops routing traffic here until it recovers.',
      "  router.get('/ready', async (_req, res) => {",
      '    const database = await Promise.race([db.ping().catch(() => false), timeout(1000)])',
      '    res.status(database ? 200 : 503).json({ ready: database, database })',
      '  })',
      '',
      '  return router',
      '}'
    ].join('\n')
  )
}

export function addReadinessTests(text: string): string {
  if (text.includes('/health/ready')) return text
  return (
    text.replace(/\n*$/, '\n') +
    [
      '',
      "describe('GET /health/ready', () => {",
      "  it('is ready when the database answers', async () => {",
      "    const res = await request(testApp()).get('/health/ready')",
      '    expect(res.status).toBe(200)',
      '    expect(res.body).toEqual({ ready: true, database: true })',
      '  })',
      '',
      "  it('is not ready while the database is down', async () => {",
      '    const db = { ...createMemoryDb(), ping: async () => false }',
      "    const res = await request(testApp(db)).get('/health/ready')",
      '    expect(res.status).toBe(503)',
      '    expect(res.body.ready).toBe(false)',
      '  })',
      '})',
      ''
    ].join('\n')
  )
}

/* ── shipments: validate the reference and the :id ── */

export function validateShipments(text: string): string {
  if (text.includes('ShipmentId')) return text
  return text
    .replace(
      /( {2})reference: z\.string\(\)\.min\(1\)\.max\(64\),/,
      [
        '$1// As printed on the label: letters, digits and dashes.',
        '$1reference: z',
        '$1  .string()',
        '$1  .trim()',
        "$1  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{2,63}$/, 'must be 3–64 letters, digits or dashes'),"
      ].join('\n')
    )
    .replace(
      /(const StatusBody = z\.object\(\{[\s\S]*?\n\}\)\n)/,
      '$1\n// Ids are UUIDs: anything else is a 404 here, not a Postgres cast error (a 500).\nconst ShipmentId = z.string().uuid()\n'
    )
    .replace(
      /( {4}const shipment = await db\.getShipment\(req\.params\.id\)\n)/,
      '    if (!ShipmentId.safeParse(req.params.id).success) throw new HttpError(404, `shipment ${req.params.id} not found`)\n$1'
    )
    .replace(
      /( {4}const \{ status, note \} = req\.body as z\.infer<typeof StatusBody>\n)/,
      '    if (!ShipmentId.safeParse(req.params.id).success) throw new HttpError(404, `shipment ${req.params.id} not found`)\n$1'
    )
}

export function addReferenceTest(text: string): string {
  if (text.includes('rejects a malformed reference')) return text
  return text.replace(
    /\n\}\)\n*$/,
    [
      '',
      '',
      "  it('rejects a malformed reference', async () => {",
      "    const res = await request(testApp()).post('/shipments').set(auth).send({ ...makeShipment(), reference: 'PO 22/01' })",
      '    expect(res.status).toBe(400)',
      '  })',
      '})',
      ''
    ].join('\n')
  )
}

/* ── web: export the shipments table as CSV ── */

export const CSV_MODULE = `import { CARRIER_NAMES, type Shipment } from './types'

const COLUMNS: Array<[header: string, value: (s: Shipment) => string | number]> = [
  ['Reference', (s) => s.reference],
  ['Carrier', (s) => CARRIER_NAMES[s.carrier]],
  ['Service', (s) => s.service],
  ['Status', (s) => s.status],
  ['Origin ZIP', (s) => s.originZip],
  ['Destination ZIP', (s) => s.destZip],
  ['Weight (g)', (s) => s.weightGrams],
  ['Price (USD)', (s) => (s.priceCents / 100).toFixed(2)],
  ['ETA', (s) => s.eta]
]

/** RFC 4180: a field is quoted when it holds a comma, a quote or a line break. */
const field = (v: string | number): string => {
  const s = String(v)
  return /[",\\r\\n]/.test(s) ? \`"\${s.replace(/"/g, '""')}"\` : s
}

export function toCsv(shipments: Shipment[]): string {
  const rows = [COLUMNS.map(([header]) => header), ...shipments.map((s) => COLUMNS.map(([, value]) => value(s)))]
  return rows.map((row) => row.map(field).join(',')).join('\\r\\n') + '\\r\\n'
}

/** Saves \`csv\` through a temporary object URL: no server round trip. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  link.click()
  URL.revokeObjectURL(url)
}
`

export const CSV_TEST = `import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'
import type { Shipment } from './types'

const shipment: Shipment = {
  id: 's1',
  reference: 'PO-1042',
  carrier: 'ups',
  service: 'ground',
  status: 'in_transit',
  originZip: '94107',
  destZip: '10001',
  weightGrams: 2300,
  priceCents: 1874,
  eta: '2026-10-02',
  createdAt: '2026-09-25T15:04:00.000Z'
}

describe('toCsv', () => {
  it('writes a header row and one row per shipment', () => {
    const [header, row] = toCsv([shipment]).trimEnd().split('\\r\\n')
    expect(header).toBe('Reference,Carrier,Service,Status,Origin ZIP,Destination ZIP,Weight (g),Price (USD),ETA')
    expect(row).toBe('PO-1042,UPS,ground,in_transit,94107,10001,2300,18.74,2026-10-02')
  })

  it('quotes fields that hold commas or quotes', () => {
    expect(toCsv([{ ...shipment, reference: 'PO "7", rush' }])).toContain('"PO ""7"", rush"')
  })
})
`

export function addCsvButton(text: string): string {
  if (text.includes('downloadCsv')) return text
  return text
    .replace(/(import \{ useShipments \} from '\.\/hooks\/useShipments'\n)/, "$1import { downloadCsv, toCsv } from './csv'\n")
    .replace(
      /^( *)<h2>Shipments<\/h2>\n/m,
      (_m, indent: string) =>
        `${indent}<h2>Shipments</h2>\n${indent}<button className="chip" disabled={shipments.length === 0} onClick={() => downloadCsv('shipments.csv', toCsv(shipments))}>\n${indent}  Export CSV\n${indent}</button>\n`
    )
}

/* ── bug reports ── */

export const ZERO_WEIGHT_RE = /weightGrams:\s*z\.number\(\)[^,\n]*\.positive\(\)/

/** Rejects a zero weight again when the schema lost `.positive()`. */
export function requirePositiveWeight(text: string): string {
  if (ZERO_WEIGHT_RE.test(text)) return text
  return text.replace(/weightGrams:\s*z\.number\(\)[^,\n]*/, 'weightGrams: z.number().int().positive().max(70_000)')
}

export function addZeroWeightTest(text: string): string {
  if (text.includes('rejects a zero weight')) return text
  return text.replace(
    /(\n\}\)\n\ndescribe\('GET \/rates\/carriers')/,
    [
      '',
      '',
      "  it('rejects a zero weight with a 400, not a 500', async () => {",
      '    const res = await request(app)',
      "      .post('/rates/quote')",
      '      .set(auth)',
      "      .send({ originZip: '94107', destZip: '10001', parcel: { ...parcel, weightGrams: 0 } })",
      '    expect(res.status).toBe(400)',
      '  })$1'
    ].join('\n')
  )
}

/** The scenario's seeded bug: whole kilos keep their `.0`. */
export const WEIGHT_BUG_RE = /\$\{\(grams \/ 1000\)\.toFixed\(1\)\} kg/

export function fixFormatWeight(text: string): string {
  return text.replace(WEIGHT_BUG_RE, '${Number((grams / 1000).toFixed(1))} kg')
}
