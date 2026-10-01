/**
 * Feature requests and bug reports beyond the tour's rate limiter: the ones a
 * visitor is most likely to type get a real build (read, edit with a diff, run
 * the tests), everything else a plan that names the files it would touch.
 */
import type { BrainInput, Plan, Step } from './brain'
import { commitPlan } from './brain-git'
import { appFile, joinNames, listFiles, runTests, say, testLine, then, think } from './brain-util'
import { testSummary, vitestRun } from './canned'
import {
  CSV_MODULE,
  CSV_TEST,
  WEIGHT_BUG_RE,
  ZERO_WEIGHT_RE,
  addCsvButton,
  addReadiness,
  addReadinessTests,
  addReferenceTest,
  addZeroWeightTest,
  fixFormatWeight,
  requirePositiveWeight,
  validateShipments
} from './feature-snippets'
import { stripAnsi } from '../util/ansi'
import type { World } from './world'

const HEALTH = 'api/src/routes/health.ts'
const HEALTH_TEST = 'api/tests/health.test.ts'
const SHIPMENTS = 'api/src/routes/shipments.ts'
const SHIPMENTS_TEST = 'api/tests/shipments.test.ts'
const RATES = 'api/src/routes/rates.ts'
const RATES_TEST = 'api/tests/rates.test.ts'
const APP_TSX = 'web/src/App.tsx'
const FORMAT = 'web/src/format.ts'
const FORMAT_TEST = 'web/src/format.test.ts'

const commitOffer = { what: 'commit', accept: (i: BrainInput) => commitPlan(i) }

/* ═════════════════════════════ health and readiness ═════════════════════════════ */

export function healthPlan({ world }: BrainInput): Plan {
  const exists = world.exists(HEALTH)
  const ready = (world.read(HEALTH) ?? '').includes("'/ready'")
  return {
    title: 'Health check',
    steps: [
      think(900),
      { t: 'read', paths: exists ? [HEALTH, appFile(world)] : [appFile(world)] },
      think(1200),
      say(() => {
        if (!exists)
          return `There's no health route yet. I'd add \`${HEALTH}\` answering \`GET /health\` with a database ping, and mount it before auth in \`${appFile(world)}\`.`
        const lines = [
          `There's one already: \`GET /health\` in \`${HEALTH}\` pings the database and answers 200, or 503 when the database is unreachable, with the uptime and the package version. It's mounted before \`requireAuth\` in \`${appFile(world)}\`, so monitors don't need a token.`
        ]
        lines.push(
          '',
          ready
            ? '`GET /health/ready` is there too, for readiness probes: it gives the database one second to answer.'
            : "If you deploy behind a load balancer or on Kubernetes, a separate readiness probe helps: `/health/ready` would fail fast when the database is slow, not just when it's down. Want me to add it?"
        )
        return lines.join('\n')
      })
    ],
    offer: exists && !ready ? { what: 'add a readiness probe', accept: (i) => readinessPlan(i) } : undefined
  }
}

export function readinessPlan(input: BrainInput): Plan {
  const { world } = input
  if (!world.exists(HEALTH)) return healthPlan(input)
  return {
    title: 'Add readiness check',
    steps: [
      think(1100),
      say("I'll add a readiness route next to the health check. Let me see how that one is built and tested."),
      { t: 'read', paths: [HEALTH, HEALTH_TEST, 'api/src/db.ts'] },
      think(1600, 'Adding /health/ready'),
      { t: 'edit', path: HEALTH, why: 'Add GET /health/ready', apply: (old) => (old === null ? null : addReadiness(old)) },
      think(1200, 'Writing the readiness tests'),
      { t: 'edit', path: HEALTH_TEST, why: 'Cover /health/ready', apply: (old) => (old === null ? null : addReadinessTests(old)) },
      runTests(world),
      say((r) =>
        [
          `\`GET /health/ready\` is in \`${HEALTH}\`${r.declined.length ? '' : `, and ${testLine(r) || 'the tests pass'}`}.`,
          '',
          '- It answers `200 { ready: true }` when the database responds to a ping within a second, and `503` otherwise, so a load balancer stops routing traffic here while the database is slow or down.',
          '- `GET /health` is unchanged. Keep using it as the liveness check.',
          `- Two new tests in \`${HEALTH_TEST}\` cover the ready and not-ready cases with the in-memory database.`
        ].join('\n')
      )
    ],
    offer: commitOffer
  }
}

/* ═════════════════════════════ validation ═════════════════════════════ */

export function validationPlan(input: BrainInput, lower: string): Plan {
  const { world } = input
  if (/\b(quote|rates?|parcel|weight|zip)\b/.test(lower)) return quoteValidationPlan()
  const tracking = /tracking|reference/.test(lower)
  return {
    title: 'Validate shipment input',
    steps: [
      think(1100),
      say("Let me look at what the shipments route accepts today and how it's tested."),
      { t: 'read', paths: [SHIPMENTS, 'api/src/middleware/validate.ts', SHIPMENTS_TEST] },
      think(1800, 'Tightening the schemas'),
      say(
        tracking
          ? "Shipments don't store a separate carrier tracking number: what clients send is `reference` (like `PO-2201`), and lookups go by the shipment's `:id`. Neither is really validated. `reference` takes any 1–64 characters, and `:id` goes straight to Postgres, where a malformed UUID fails the cast and comes back as a 500. I'll tighten both."
          : "`reference` accepts any 1–64 characters, and `:id` goes straight to Postgres, where a malformed UUID fails the cast and comes back as a 500. I'll tighten both."
      ),
      { t: 'edit', path: SHIPMENTS, why: 'Validate the reference and the :id', apply: (old) => (old === null ? null : validateShipments(old)) },
      { t: 'edit', path: SHIPMENTS_TEST, why: 'Cover a malformed reference', apply: (old) => (old === null ? null : addReferenceTest(old)) },
      runTests(world),
      say((r) =>
        [
          `Done${r.declined.length ? '' : `, and ${testLine(r) || 'the tests pass'}`}:`,
          '',
          '- `reference` is trimmed and must be 3–64 letters, digits or dashes. Anything else is a `400` from `validateBody`, with the field named in `details`.',
          '- `GET /shipments/:id` and `PATCH /shipments/:id/status` check that `:id` is a UUID first, so a bad id is a `404` instead of a database error.',
          `- A new test in \`${SHIPMENTS_TEST}\` posts \`PO 22/01\` and expects the \`400\`.`
        ].join('\n')
      )
    ],
    offer: commitOffer
  }
}

function quoteValidationPlan(): Plan {
  return {
    title: 'Quote validation',
    steps: [
      think(1000),
      { t: 'read', paths: [RATES, 'api/src/middleware/validate.ts'] },
      think(1400),
      say(
        "`POST /rates/quote` is already validated with zod through `validateBody`: both ZIPs must be 5 digits, `weightGrams` a positive integer up to 70 kg, each dimension positive and at most 270 cm, and `carriers` (optional) one of the four known ids. A bad request is a `400` whose `details` name the field. I don't see a gap there. Is there a specific input that gets through?"
      )
    ]
  }
}

/* ═════════════════════════════ CSV export ═════════════════════════════ */

export function csvExportPlan({ world }: BrainInput): Plan {
  return {
    title: 'Export shipments CSV',
    steps: [
      think(1200),
      say("I'll add the export on the client: the table already has every shipment it shows, so no new endpoint is needed. Let me see how the table is put together."),
      { t: 'read', paths: [APP_TSX, 'web/src/components/ShipmentTable.tsx', 'web/src/types.ts'] },
      think(1800, 'Writing the CSV helper'),
      { t: 'edit', path: 'web/src/csv.ts', why: 'Add toCsv and downloadCsv', apply: (old) => old ?? CSV_MODULE },
      { t: 'edit', path: APP_TSX, why: 'Add an Export CSV button to the shipments panel', apply: (old) => (old === null ? null : addCsvButton(old)) },
      think(1200, 'Writing the CSV tests'),
      { t: 'edit', path: 'web/src/csv.test.ts', why: 'Cover toCsv', apply: (old) => old ?? CSV_TEST },
      runTests(world, 'Run the dashboard tests', 'web'),
      then((r) => {
        const run = r.runs[r.runs.length - 1]
        const s = run ? testSummary(run.output) : null
        const otherFailure = !!s && s.failed > 0 && !(run?.output ?? '').includes('csv.test.ts >')
        return [
          say(
            [
              `There's an **Export CSV** button in the shipments panel now (\`${APP_TSX}\`).`,
              '',
              '- `web/src/csv.ts` turns the shipments into RFC 4180 CSV (reference, carrier, service, status, ZIPs, weight, price in dollars, ETA), quoting any field with a comma or a quote, and downloads it through an object URL.',
              '- The button exports whatever the table shows, so it follows the status filter, and is disabled while the list is empty.',
              `- \`web/src/csv.test.ts\` covers the header, a row and the quoting.${r.declined.length ? '' : otherFailure ? ` The new tests pass, but ${testLine(r)}: the failure is in \`src/format.test.ts\`, which was already failing before this change.` : ` ${cap(testLine(r) || 'the tests pass')}.`}`
            ].join('\n')
          )
        ]
      })
    ],
    offer: commitOffer
  }
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/* ═════════════════════════════ bugs ═════════════════════════════ */

/** "the quote endpoint returns 500 when weight is 0": read, find the cause, pin it with a test. */
export function bugPlan(input: BrainInput, lower: string): Plan {
  const { world } = input
  if (/\b(quote|rates?)\b/.test(lower) && /\b(weight|0|zero)\b/.test(lower)) return zeroWeightPlan(world)
  const area = areaOf(world, lower)
  return {
    title: `Investigate ${area.name} bug`,
    steps: [
      think(1200),
      say(`Let me read the ${area.name} code path first.`),
      { t: 'read', paths: area.files },
      think(2200, 'Tracing the code path'),
      say(
        `I read ${joinNames(area.files.map((f) => `\`${f}\``))} and don't see an obvious path to that. Inputs go through zod in \`validateBody\` (a \`400\`), \`HttpError\` covers the 404s, and \`errorHandler\` turns anything else into a \`500\` and logs the stack. Can you paste the error, or the request that triggers it? With the stack trace from the API log I can go straight to the line.`
      )
    ]
  }
}

function zeroWeightPlan(world: World): Plan {
  const schemaOk = ZERO_WEIGHT_RE.test(world.read(RATES) ?? '')
  const steps: Step[] = [
    think(1100),
    say("Let me follow a quote request from the route to the pricing code."),
    { t: 'read', paths: [RATES, 'api/src/services/quote.ts', 'api/src/middleware/errors.ts'] },
    think(2000, 'Tracing the zero-weight request')
  ]
  if (!schemaOk) {
    steps.push(
      say("Found it: `weightGrams` in `QuoteRequest` no longer requires a positive number, so `0` gets past validation and is priced as if the parcel weighed something. That request should be a `400`. I'll put the `.positive()` back and pin it with a test."),
      { t: 'edit', path: RATES, why: 'Reject a zero weight again', apply: (old) => (old === null ? null : requirePositiveWeight(old)) }
    )
  } else {
    steps.push(
      say(
        "The schema already stops this: `weightGrams` is `z.number().int().positive()`, so `0` fails validation and `validateBody` answers `400` before `quoteAll` ever runs. I'll add a regression test to prove it and keep it that way."
      )
    )
  }
  steps.push(
    { t: 'edit', path: RATES_TEST, why: 'Pin the zero-weight case', apply: (old) => (old === null ? null : addZeroWeightTest(old)) },
    runTests(world),
    say((r) => {
      const tests = r.declined.length ? '' : testLine(r)
      return schemaOk
        ? `The new test posts \`weightGrams: 0\` and gets a \`400\`${tests ? `, and ${tests}` : ''}. So a zero weight can't reach a \`500\` in this code. If you're still seeing one, it's coming from somewhere else (a proxy in front of the API, or an older deploy). Paste the response or the API log line and I'll trace it.`
        : `Fixed: \`weightGrams: 0\` is a \`400\` again, with \`details\` naming the field, and the new test in \`${RATES_TEST}\` pins it${tests ? `. ${cap(tests)}` : ''}.`
    })
  )
  return { title: 'Fix zero-weight quote', steps, offer: commitOffer }
}

/** "fix the failing test": run everything, find what fails, fix the side that's wrong. */
export function fixFailingPlan({ world }: BrainInput): Plan {
  return {
    title: 'Fix failing tests',
    steps: [
      think(1100),
      say("Let me run the whole test suite to see what's failing."),
      { t: 'run', command: 'npm test', description: "Run every workspace's tests", fallback: () => vitestRun(world), safe: true },
      then((r) => {
        if (r.declined.length) return [say("I need to run the tests to see what's failing. Let me know when that's OK.")]
        const run = r.runs[r.runs.length - 1]
        const failures = run ? failingTests(world, run.output) : []
        if (!run || failures.length === 0)
          return [say(`Everything passes right now (${testLine(r) || 'no failures'}), so there's nothing to fix. If a test fails on your machine or in CI, paste the output and I'll dig in.`)]
        const first = failures[0]
        if (first.path === FORMAT_TEST && WEIGHT_BUG_RE.test(world.read(FORMAT) ?? '')) return formatWeightFix(world)
        return [
          { t: 'read', paths: [first.path] },
          think(2600, 'Tracing the failure'),
          say(`\`${first.path}\` fails in "${first.name}". The assertion and the code under test disagree, and the output above shows the exact values. Which one is right, the test or the implementation? I'll change the other.`)
        ]
      })
    ],
    offer: commitOffer
  }
}

function formatWeightFix(world: World): Step[] {
  return [
    { t: 'read', paths: [FORMAT_TEST, FORMAT] },
    think(2200, 'Tracing the failure'),
    say(
      "One failure, in the web workspace: `formatWeight(2000)` returns `2.0 kg`, but the test expects `2 kg`. `toFixed(1)` always keeps one decimal, so every whole kilo shows a trailing `.0` in the shipments table's Weight column. The test describes what we want, so I'll fix the formatter, not the test."
    ),
    { t: 'edit', path: FORMAT, why: 'Drop the trailing .0 on whole kilos', apply: (old) => (old === null ? null : fixFormatWeight(old)) },
    runTests(world, 'Run the dashboard tests', 'web'),
    say((r) =>
      r.declined.length
        ? `The fix is in \`${FORMAT}\`. Run \`npm test -w web\` to check it.`
        : `Fixed in \`${FORMAT}\`: \`Number(… .toFixed(1))\` drops the trailing zero, so it's \`2 kg\` and still \`2.3 kg\`. ${cap(testLine(r) || 'the web tests pass')}, and the API suite was already green.`
    )
  ]
}

/** `FAIL src/format.test.ts > format > formats weights…` lines, resolved to project paths. */
function failingTests(world: World, output: string): Array<{ path: string; name: string }> {
  const out: Array<{ path: string; name: string }> = []
  for (const m of stripAnsi(output).matchAll(/FAIL\s+(\S+\.test\.tsx?)\s+>\s+(.+)/g)) {
    const file = m[1].replace(/^(api|web)\//, '')
    const path = ['web', 'api'].map((ws) => `${ws}/${file}`).find((p) => world.exists(p)) ?? file
    if (!out.some((f) => f.path === path)) out.push({ path, name: m[2].trim() })
  }
  return out
}

/* ═════════════════════════════ anything else: a plan ═════════════════════════════ */

interface Area {
  name: string
  api: string[]
  web: string[]
  test: string
}

function areas(world: World): Array<Area & { re: RegExp }> {
  return [
    {
      re: /shipment|tracking|parcel|deliver|status|booking|\bbook\b/,
      name: 'shipments',
      api: [SHIPMENTS, 'api/src/db.ts'],
      web: ['web/src/components/ShipmentTable.tsx', 'web/src/hooks/useShipments.ts'],
      test: SHIPMENTS_TEST
    },
    {
      re: /quote|rates?\b|pric|carrier|zip|weight/,
      name: 'quotes',
      api: [RATES, 'api/src/services/quote.ts'],
      web: ['web/src/components/QuoteForm.tsx', 'web/src/components/RateCard.tsx'],
      test: RATES_TEST
    },
    {
      re: /auth|token|login|sign.?in|user|account|permission/,
      name: 'auth',
      api: ['api/src/middleware/auth.ts', appFile(world)],
      web: ['web/src/api.ts'],
      test: 'api/tests/auth.test.ts'
    },
    {
      re: /log(ging|s)?\b|metric|monitor|trace/,
      name: 'logging',
      api: ['api/src/middleware/logger.ts', appFile(world)],
      web: ['web/src/api.ts'],
      test: 'api/tests/'
    }
  ]
}

function areaOf(world: World, lower: string): Area & { files: string[] } {
  const hit = areas(world).find((a) => a.re.test(lower))
  const web = /\b(button|page|ui|screen|dashboard|form|table|filter|chart|view|column|modal|component)\b/.test(lower)
  if (hit) return { ...hit, files: (web ? [...hit.web, APP_TSX] : hit.api).filter((f) => world.exists(f)) }
  return { name: 'API', api: [appFile(world)], web: [APP_TSX], test: 'api/tests/', files: [web ? APP_TSX : appFile(world)] }
}

export function featurePlan({ world }: BrainInput, lower: string): Plan {
  const what = lower.replace(/^(add|implement|create|build|make|support|introduce|set up|setup|write)\s+(an? |the |some )?/, '').replace(/[.!?]+$/, '')
  const web = /\b(button|page|ui|screen|dashboard|form|table|filter|chart|view|column|modal|component|dark|colou?r)\b/.test(what)
  const area = areaOf(world, what)
  const titleWords = what.split(' ').slice(0, 4).map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  const routes = listFiles(world, 'api/src/routes').length
  return {
    title: `Plan ${titleWords.join(' ')}`,
    steps: [
      think(1400),
      say('Let me look at where this would fit.'),
      { t: 'read', paths: area.files },
      think(2600, 'Sketching a plan'),
      say(() => {
        const steps = web
          ? [
              area.web.length && area.name !== 'API'
                ? `Build it into ${joinNames(area.web.filter((f) => world.exists(f)).map((f) => `\`${f}\``))}, which already render the ${area.name}.`
                : 'Add a component under `web/src/components/` and render it from `web/src/App.tsx`.',
              'Fetch anything new through `web/src/api.ts`, next to `api.quote` and `api.shipments`, so errors and auth are handled in one place.',
              'Keep the formatting logic in plain functions and cover them with a Vitest test next to `web/src/format.test.ts`.'
            ]
          : [
              area.name !== 'API'
                ? `Extend ${joinNames(area.api.map((f) => `\`${f}\``))}, where the ${area.name} logic lives.`
                : `Add a router under \`api/src/routes/\` next to the ${routes} existing ones, and mount it in \`${appFile(world)}\` after \`requireAuth\`.`,
              'Validate the input with a zod schema through `validateBody`, and throw `HttpError` for the 4xx cases.',
              `Cover the happy path and one failure case in \`${area.test}\`, using the in-memory database from \`api/tests/helpers.ts\`.`
            ]
        return [
          `Here's how I'd add ${what}:`,
          '',
          ...steps.map((s, i) => `${i + 1}. ${s}`),
          '',
          "That's more than this demo scripts end to end, so I'll stop at the plan. Changes I can make for real here: rate limiting, a readiness check, CSV export of shipments, validation on the shipments route, pagination, a light theme, and writing or fixing tests."
        ].join('\n')
      })
    ]
  }
}
