/**
 * The agents' "model": a deterministic intent matcher that turns a prompt into
 * a plan of primitive steps (think, read, search, edit, run, message, say).
 * The TUIs execute the plan and render each step in their own style, so the
 * same prompt looks like Claude Code in one pane and Codex in the other.
 *
 * Paths inside plans are project-relative with `/`. Edits are real Vfs writes;
 * `apply` receives the file's current text, so re-running a plan (a second
 * tour, a reload) builds on whatever is there instead of clobbering it.
 *
 * A plan may end with an offer ("Want me to apply these?"). The TUI keeps it
 * for one turn, so "yes" / "go ahead" carries on with what was offered.
 */
import type { FramedMessage, SendMessageResult } from '../contracts'
import { bugPlan, csvExportPlan, featurePlan, fixFailingPlan, healthPlan, readinessPlan, validationPlan } from './brain-features'
import { commitPlan, reviewPlan } from './brain-git'
import {
  STOP,
  appFile,
  constName,
  esmJs,
  exportsOf,
  framework,
  importersOf,
  importsOf,
  joinNames,
  lineCount,
  listFiles,
  mentionedFile,
  projectName,
  runTests,
  say,
  testLine,
  then,
  think
} from './brain-util'
import { testSummary } from './canned'
import { explainKnown } from './knowledge'
import type { GrepHit, RunResult, World } from './world'
import { RATE_LIMIT_EXPRESS, RATE_LIMIT_HONO, RATE_LIMIT_TEST, wireRateLimit } from './snippets'

export type AgentName = 'claude' | 'codex' | 'gemini' | 'other'

export interface TodoItem {
  content: string
  activeForm: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface EditRecord {
  path: string
  created: boolean
  added: number
  removed: number
}

/** What a turn has produced so far; later steps read it. */
export interface Results {
  runs: RunResult[]
  /** Commands the user declined at the permission prompt. */
  declined: string[]
  edits: EditRecord[]
  reads: Record<string, string | null>
  /** Search results by pattern — what the Search call showed, so the answer quotes the same files. */
  searches: Record<string, GrepHit[]>
  sent: Array<SendMessageResult & { to: string }>
}

export const emptyResults = (): Results => ({ runs: [], declined: [], edits: [], reads: {}, searches: {}, sent: [] })

export type Step =
  | { t: 'think'; ms: number; activity?: string }
  | { t: 'todos'; items: TodoItem[] }
  | { t: 'read'; paths: string[] }
  | { t: 'search'; pattern: string; path?: string }
  | { t: 'list'; path: string }
  | { t: 'edit'; path: string; apply: (old: string | null) => string | null; why: string }
  | { t: 'run'; command: string; description: string; fallback: () => RunResult | null; safe?: boolean }
  | { t: 'say'; text: (r: Results) => string }
  | { t: 'message'; to: () => string | undefined; toName: string; text: (r: Results) => string; replyTo?: number }
  | { t: 'then'; next: (r: Results) => Step[] }

/** Something the agent offered at the end of a turn, and what "yes" does. */
export interface Offer {
  what: string
  accept: (input: BrainInput) => Plan
  /** "No" / "leave them". Default: a short acknowledgement. */
  decline?: (input: BrainInput) => Plan
}

export interface Plan {
  /** A 2–5 word task summary (Claude's window title while it works). Empty: keep the previous one. */
  title: string
  steps: Step[]
  offer?: Offer
}

export interface BrainInput {
  prompt: string
  agent: AgentName
  world: World
  /** A deck message submitted into the composer, parsed. */
  peer?: FramedMessage | null
  /** What the previous turn offered, if anything. */
  offer?: Offer | null
  /** `claude -p` / `codex exec`: nothing can follow up, so nothing is offered. */
  oneshot?: boolean
  /** Which lighter agent is talking (`aider`, `amp`…), for small talk in its own voice. */
  voice?: string
}

/* ═════════════════════════════ entry ═════════════════════════════ */

const AFFIRM =
  /^((y|yes|yeah|yep|yup|sure|ok|okay)\b.*|go ahead\b.*|go for it|do it|do that|please do|proceed|continue|sounds good|let'?s do it|ship it|make the change|(apply|handle|fix|do) (them|it|all|these|those|both|the (first|first one|changes?|suggestions?|follow.?ups?|fix(es)?))( now)?)$/
const DECLINE = /^(n|no|nope|nah|not now|leave (it|them)( for later| for a follow.?up( pr)?)?|skip( it| them)?|later|no thanks)\b/

/** Politeness and filler off the front, so "can you please add X" reads as "add X". */
export function normalize(prompt: string): string {
  let s = prompt.trim().toLowerCase().replace(/\s+/g, ' ')
  const lead = /^(hey|hi claude|ok|okay|so|now|and|also|please|pls|can you|could you|would you|will you|would you mind|i want you to|i'?d like you to|i would like you to|i need you to|i want to|i'?d like to|let'?s|go and|claude,|codex,)\s+/
  for (let i = 0; i < 6 && lead.test(s); i++) s = s.replace(lead, '')
  return s.replace(/\s*(please|pls|thanks|thank you)[.!?]*$/, '').replace(/[.!?]+$/, '').trim()
}

export function plan(input: BrainInput): Plan {
  if (input.peer) return peerPlan(input, input.peer)
  const p = input.prompt.trim()
  const lower = normalize(p)
  if (AFFIRM.test(lower) && lower.split(' ').length <= 6) return input.offer ? input.offer.accept(input) : affirmPlan()
  if (DECLINE.test(lower) && lower.split(' ').length <= 8) return input.offer?.decline?.(input) ?? declinePlan()
  for (const intent of INTENTS) {
    if (intent.match.test(lower)) {
      const made = intent.build(input, lower, p)
      if (made) return made
    }
  }
  return fallbackPlan(input, p)
}

interface Intent {
  match: RegExp
  build: (input: BrainInput, lower: string, original: string) => Plan | null
}

const INTENTS: Intent[] = [
  { match: /^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b|^what'?s up/, build: greetPlan },
  { match: /^(thanks|thank you|thx|ty|cheers|great|nice|perfect|awesome|cool)\b/, build: thanksPlan },
  { match: /who are you|what (model|are you)|which model/, build: whoPlan },
  { match: /\b(ask|tell|message|ping|have|get)\s+(codex|claude|gemini|the other agent|pane p?\d+|p\d+)\b|\bsend (a )?(message|note) to\b/, build: messagePlan },
  { match: /rate.?limit|throttl/, build: rateLimitPlan },
  { match: /\bcommit\b/, build: (i) => commitPlan(i) },
  // Before the health check: "add a readiness endpoint /health/ready" asks for something new.
  { match: /readiness|\/ready\b|\bready(ness)? (check|endpoint|probe|route)|liveness/, build: readinessPlan },
  { match: /fix.*\b(tests?|specs?)\b|failing|tests? (are )?(failing|broken)|\bred (build|ci)\b/, build: fixFailingPlan },
  { match: /^(fix|debug|investigate)\b|\bbugs?\b|returns? (an? )?(500|5\d\d)\b|\b500s?\b|\bcrash(es|ing)?\b|doesn'?t work|not working|is broken/, build: bugPlan },
  { match: /review|\bdiff\b|what changed|uncommitted|my changes/, build: (i) => reviewPlan(i) },
  { match: /(write|add|create|cover|generate).*(tests?|spec)\b|test coverage/, build: writeTestsPlan },
  { match: /\b(run|check|execute|rerun|re-run)\b( the| all| my)?( \w+)? (tests?|suite|specs?)\b|npm (run )?test/, build: runTestsPlan },
  { match: /refactor|clean ?up|simplify|tidy/, build: refactorPlan },
  { match: /^(cat|type|gc|get-content|less|more|open|show( me)?|read|print)\s+\S+\.\w+$/, build: readFilePlan },
  { match: /paginat|page size|next page|\bpages?\b.*shipments|shipments.*\bpages?\b/, build: paginationPlan },
  { match: /\bcsv\b|export (the )?(shipments|table|list|data)/, build: csvExportPlan },
  { match: /validat|sanitiz/, build: validationPlan },
  { match: /health ?(check|endpoint|route)|healthz|\/health\b/, build: healthPlan },
  { match: /dark mode|light mode|light theme|dark theme|\btheme\b|colou?r scheme/, build: themePlan },
  { match: /explain|overview|walk me|tell me about|what is this|what'?s this|how does .* work|summari[sz]e|what does|what'?s in|describe/, build: explainPlan },
  { match: /list (the )?files|what'?s in (this|the) (folder|repo|directory)|show (me )?the (files|structure)/, build: listPlan },
  { match: /^(add|implement|create|build|make|support|introduce|set up|setup|write)\b/, build: featurePlan }
]

/* ═════════════════════════════ small talk ═════════════════════════════ */

const AGENT_TITLE: Record<AgentName, string> = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', other: 'the agent' }

const EXAMPLES = [
  '- "add rate limiting to the API and cover it with a test"',
  '- "explain this repo" or "what does api/src/db.ts do?"',
  '- "add pagination to the shipments list", "review my changes", "commit this"',
  '- "run the tests", "write tests for rates.ts", "ask codex to check the web tests"'
]

/** Each agent's own voice; the lighter agents pass their name as `voice`. */
function greetPlan({ world, agent, voice }: BrainInput): Plan {
  const name = projectName(world)
  const where = world.show(world.root)
  const lines: Record<string, string> = {
    claude: `Hi! I'm working in **${name}**, a TypeScript monorepo with an API in \`api/\` and a Vite + React dashboard in \`web/\`. What would you like to work on? For example: "add rate limiting to the API and cover it with a test", "explain this repo", or "review my uncommitted changes".`,
    codex: `Hi! I'm in \`${where}\`, the ${name} monorepo (an API in \`api/\` and a React dashboard in \`web/\`). What should we work on?`,
    gemini: `Hello! I'm ready to help with **${name}**. It's a TypeScript monorepo: an Express API in \`api/\` and a React dashboard in \`web/\`. What would you like to do?`,
    aider: `Hi. I can see the ${name} repo. Add files to the chat with /add, or just tell me what to change.`,
    opencode: `Hey! Working in ${where}. What are we building?`,
    copilot: `Hi! I'm GitHub Copilot, working in ${name}. Ask me to explain, fix or change something in this repo.`,
    qwen: `Hello! I'm Qwen Code. I'm in the ${name} project (api/ and web/). How can I help?`,
    'cursor-agent': `Hi! I'm in ${where}. Tell me what to build or fix and I'll get started.`,
    amp: `Hey. ${name} is loaded: API in api/, dashboard in web/. What's the task?`
  }
  return { title: '', steps: [think(900), say(lines[voice ?? agent] ?? lines.claude)] }
}

function thanksPlan(): Plan {
  return { title: '', steps: [think(600), say("You're welcome! Anything else you'd like me to look at?")] }
}

function whoPlan({ agent }: BrainInput): Plan {
  const text: Record<AgentName, string> = {
    claude:
      "I'm Claude Code, Anthropic's agentic coding tool, running here inside TerminalDeck's web demo. Everything I read, edit or run in this pane happens in a simulated Windows machine, so feel free to try things.",
    codex: "I'm Codex, OpenAI's coding agent, running in this pane of the TerminalDeck web demo against a simulated copy of the Harbor repo.",
    gemini: "I'm Gemini CLI, Google's open-source coding agent. In this demo I work on a simulated copy of the Harbor repo.",
    other: "I'm a coding agent running inside the TerminalDeck web demo, working on a simulated copy of the Harbor repo."
  }
  return { title: '', steps: [think(700), say(text[agent])] }
}

function affirmPlan(): Plan {
  return {
    title: '',
    steps: [think(700), say(['Sure. What would you like me to do? For example:', '', ...EXAMPLES].join('\n'))]
  }
}

function declinePlan(): Plan {
  return { title: '', steps: [think(500), say("OK, I'll leave it there. What would you like to do next?")] }
}

/* ═════════════════════════════ the tour: rate limiting ═════════════════════════════ */

const LIMITER = 'api/src/middleware/rateLimit.ts'
const LIMITER_TEST = 'api/tests/rateLimit.test.ts'

function rateLimitPlan(input: BrainInput): Plan {
  const { world, agent } = input
  const fw = framework(world)
  const app = appFile(world)
  const js = esmJs(world) ? '.js' : ''
  const hasLogger = world.exists('api/src/middleware/logger.ts')
  const todos = (step: number): TodoItem[] => {
    const items: Array<[string, string]> = [
      ['Create a rate-limit middleware', 'Creating the rate-limit middleware'],
      [`Wire it into ${app}`, 'Wiring it into the app'],
      ['Cover it with a test', 'Writing the rate-limit tests'],
      ['Run the API test suite', 'Running the API tests']
    ]
    return items.map(([content, activeForm], i) => ({
      content,
      activeForm,
      status: i < step ? 'completed' : i === step ? 'in_progress' : 'pending'
    }))
  }
  const peerKind = agent === 'codex' ? 'claude' : 'codex'
  const peerTitle = peerKind === 'codex' ? 'Codex' : 'Claude Code'
  const reviewRequest = (r: Results): string => {
    const tests = testLine(r)
    return [
      'Please review the rate limiter I just added to the Harbor API.',
      `- ${LIMITER}: fixed window per client IP, 100 requests/min, RateLimit-* headers, 429 + Retry-After when the budget is spent.`,
      `- Mounted in ${app}, after /health and before auth, so every API route is covered.`,
      `- Tests in ${LIMITER_TEST}${tests ? ` (${tests})` : ''}.`,
      'Look for edge cases (proxies, memory growth, header names) and reply with anything I should change.'
    ].join('\n')
  }

  const steps: Step[] = [
    think(1600),
    say("I'll add a rate-limiting middleware to the API. Let me first look at how the app and its middleware are put together."),
    { t: 'read', paths: [...new Set(['api/src/server.ts', app]), 'api/package.json'] },
    { t: 'search', pattern: 'app.use', path: 'api/src' },
    ...(hasLogger ? [{ t: 'read', paths: ['api/src/middleware/logger.ts'] } as Step] : []),
    { t: 'list', path: 'api/tests' },
    think(1800, 'Planning'),
    { t: 'todos', items: todos(0) },
    think(2400, todos(0)[0].activeForm),
    { t: 'edit', path: LIMITER, why: 'Create the rate-limit middleware', apply: () => (fw === 'hono' ? RATE_LIMIT_HONO : RATE_LIMIT_EXPRESS) },
    { t: 'todos', items: todos(1) },
    think(1500, todos(1)[1].activeForm),
    { t: 'edit', path: app, why: 'Mount the limiter before the routes', apply: (old) => (old === null ? null : wireRateLimit(old, fw)) },
    { t: 'todos', items: todos(2) },
    think(2000, todos(2)[2].activeForm),
    { t: 'edit', path: LIMITER_TEST, why: 'Cover the limiter with tests', apply: () => RATE_LIMIT_TEST.replace("'../src/middleware/rateLimit'", `'../src/middleware/rateLimit${js}'`) },
    { t: 'todos', items: todos(3) },
    think(900, todos(3)[3].activeForm),
    runTests(world),
    then((r) => {
      if (r.declined.length > 0)
        return [say(`OK, I didn't run the tests. The limiter is in \`${LIMITER}\`, mounted in \`${app}\`, with tests in \`${LIMITER_TEST}\`. Run \`npm test -w api\` whenever you're ready.`)]
      const peer = input.oneshot ? undefined : world.findAgentPane(peerKind)
      const after: Step[] = [{ t: 'todos', items: todos(4) }]
      if (peer) {
        after.push(think(1200, `Asking ${peerTitle} for a review`), {
          t: 'message',
          to: () => world.findAgentPane(peerKind)?.paneId,
          toName: peerTitle,
          text: reviewRequest
        })
      }
      after.push(
        say((res) => {
          const tests = testLine(res)
          const sent = res.sent[res.sent.length - 1]
          const lines = [
            `Rate limiting is in place${tests ? `, and ${tests}` : ''}.`,
            '',
            `- **\`${LIMITER}\`**: a fixed-window limiter keyed by client IP (100 requests/min by default). It sets \`RateLimit-Limit\`, \`RateLimit-Remaining\` and \`RateLimit-Reset\` on every response and answers \`429\` with \`Retry-After\` once the budget is spent.`,
            `- **\`${app}\`**: mounted after \`/health\` and before auth, so every API route is covered and health checks never get a 429.`,
            `- **\`${LIMITER_TEST}\`**: 4 tests for under the limit, the 429, the window reset, and per-client counting.`
          ]
          if (sent?.ok) lines.push('', `I've asked ${peerTitle} in pane ${sent.to} to review the limiter. Its reply will show up here.`)
          else if (sent && !sent.ok) lines.push('', `I couldn't reach ${peerTitle} for a review: ${sent.error ?? 'the message was refused'}.`)
          return lines.join('\n')
        })
      )
      return after
    })
  ]
  return { title: 'Add API rate limiting', steps }
}

/** The two follow-ups a review of the limiter suggests, as real edits. */
function limiterFollowUpsPlan({ world }: BrainInput): Plan {
  const app = appFile(world)
  return {
    title: 'Rate limiter follow-ups',
    steps: [
      think(1100),
      say("I'll sweep expired buckets so memory tracks active clients, and make `req.ip` the real client behind a proxy."),
      { t: 'read', paths: [LIMITER, app] },
      think(1600, 'Sweeping stale buckets'),
      { t: 'edit', path: LIMITER, why: 'Sweep expired buckets once per window', apply: (old) => (old === null ? null : sweepBuckets(old)) },
      think(1200, 'Trusting the proxy'),
      { t: 'edit', path: app, why: "Set 'trust proxy' so req.ip is the client", apply: (old) => (old === null ? null : trustProxy(old)) },
      runTests(world),
      say((r) =>
        r.declined.length
          ? `Both changes are in (\`${LIMITER}\` and \`${app}\`). Run \`npm test -w api\` when you're ready.`
          : `Done, and ${testLine(r) || 'the suite passes'}:\n\n- \`${LIMITER}\` drops expired buckets at most once per window, so memory stays proportional to active clients.\n- \`${app}\` sets \`trust proxy\` to 1, so behind the load balancer \`req.ip\` is the client's address and each client gets its own budget.`
      )
    ],
    offer: { what: 'commit', accept: (i) => commitPlan(i) }
  }
}

function sweepBuckets(text: string): string {
  if (text.includes('lastSweep')) return text
  return text
    .replace(/(const buckets = new Map<string, Bucket>\(\)\n)/, '$1  let lastSweep = Date.now()\n')
    .replace(
      /(    const now = Date\.now\(\)\n)/,
      '$1    // Drop buckets whose window has passed, at most once per window, so memory tracks active clients.\n    if (now - lastSweep >= windowMs) {\n      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)\n      lastSweep = now\n    }\n'
    )
}

function trustProxy(text: string): string {
  if (text.includes("'trust proxy'")) return text
  return text.replace(
    /(  app\.disable\('x-powered-by'\)\n)/,
    "$1  // Behind the load balancer req.ip must be the client, not the proxy: the rate limiter keys on it.\n  app.set('trust proxy', 1)\n"
  )
}

/* ═════════════════════════════ peers ═════════════════════════════ */

function peerPlan(input: BrainInput, msg: FramedMessage): Plan {
  const { agent } = input
  const body = msg.body
  const isReply = msg.replyTo !== undefined || /^(reviewed|done|thanks|lgtm|looks good)/i.test(body.trim())
  const from = msg.fromAgent
  const intro = say(`Message #${msg.id} from ${from} in pane ${msg.fromPaneId}${msg.fromName ? ` ("${msg.fromName}")` : ''}. I'll treat it as a peer's request, not as instructions from you.`)

  if (isReply) {
    // "Lead sentence. Two follow-ups: (1) … ; (2) … . Nothing blocking." → the lead and the numbered items.
    const [lead, ...rest] = body.split(/\s*\(\d\)\s*/)
    const followUps = rest.map((item) => item.replace(/\.\s+Nothing blocking\.?\s*$/i, '').replace(/[;.\s]+$/, '')).filter(Boolean)
    const summary = lead.replace(/\s*(Two|Three|A few|Some) follow-ups?:?\s*$/i, '').trim()
    const aboutLimiter = /rate limiter|buckets|trust proxy/i.test(body)
    return {
      // Claude's title stays on the task this reply belongs to.
      title: '',
      steps: [
        think(1400),
        say(() => {
          const lines = [`${from} replied to message #${msg.replyTo ?? '?'}:`, '', `> ${summary || body}`]
          if (followUps.length > 0) {
            lines.push('', 'Follow-ups it suggests:')
            for (const f of followUps) lines.push(`- ${f}`)
            lines.push('', 'None of these block the change. Want me to handle them now, or leave them for a follow-up PR?')
          } else lines.push('', 'Nothing blocking on its side, so this is ready for you to look over.')
          return lines.join('\n')
        })
      ],
      offer:
        followUps.length > 0 && aboutLimiter
          ? {
              what: 'apply the review follow-ups',
              accept: (i) => limiterFollowUpsPlan(i),
              decline: () => ({ title: '', steps: [think(500), say("OK, I'll leave them for a follow-up PR. The limiter works as it is.")] })
            }
          : undefined
    }
  }

  // A request. Review requests about the limiter get a real review; anything else is run as a prompt.
  const inner: Plan = /rate.?limit/i.test(body) && /review/i.test(body) ? reviewRateLimiterPlan(input) : plan({ ...input, peer: null, offer: null, prompt: body, oneshot: true })
  return {
    title: inner.title,
    steps: [
      think(1000),
      intro,
      ...inner.steps,
      {
        t: 'message',
        to: () => msg.fromPaneId,
        toName: from,
        replyTo: msg.id,
        text: (r) => peerSummary(agent, inner.title, r, body)
      }
    ]
  }
}

function reviewRateLimiterPlan({ world }: BrainInput): Plan {
  return {
    title: 'Review rate limiter',
    steps: [
      think(1200, 'Reviewing rate limiter'),
      say("I'll read the new limiter and its tests, then run the suite."),
      { t: 'read', paths: [LIMITER, LIMITER_TEST] },
      { t: 'search', pattern: 'rateLimit', path: 'api/src' },
      think(1600, 'Reviewing rate limiter'),
      runTests(world, 'Run the API tests to check the rate limiter'),
      then((r) => {
        if (!r.reads[LIMITER]) return [say(`I couldn't find \`${LIMITER}\`. Has it been written yet? Nothing to review.`)]
        const tests = testLine(r)
        return [
          think(1400, 'Writing up the review'),
          say(
            [
              `The limiter looks correct: a fixed window per client, \`RateLimit-*\` headers on every response, and \`429\` with \`Retry-After\` once the budget is spent. The tests cover the limit, the reset and per-client counting${tests ? `, and ${tests}` : ''}.`,
              '',
              'Two things worth a follow-up:',
              '- `buckets` never drops stale keys, so memory grows with the number of distinct clients. Sweep expired buckets when a window rolls over, or use an LRU.',
              "- Behind a proxy, `req.ip` is the proxy's address. Set `app.set('trust proxy', 1)` where the app is created, or key on the forwarded client IP."
            ].join('\n')
          )
        ]
      })
    ]
  }
}

function peerSummary(agent: AgentName, title: string, r: Results, body: string): string {
  if (/rate.?limit/i.test(body) && /review/i.test(body)) {
    const tests = testLine(r)
    return `Reviewed the rate limiter: the logic and headers look right${tests ? `, and ${tests} on my side` : ''}. Two follow-ups: (1) buckets never evicts stale keys, so memory grows with distinct clients — sweep expired buckets or use an LRU; (2) behind a proxy req.ip is the proxy — set app.set('trust proxy', 1) or key on the forwarded IP. Nothing blocking.`
  }
  const edits = r.edits.map((e) => e.path)
  const tests = testLine(r)
  const run = [...r.runs].reverse().find((x) => /test/.test(x.command))
  const parts: string[] = []
  if (run && tests) parts.push(`Ran \`${run.command}\`: ${tests}.`)
  else parts.push(`Done with ${(title || 'your request').toLowerCase()}.`)
  if (edits.length) parts.push(`I changed ${edits.join(', ')}.`)
  if (run && /fail/.test(tests)) parts.push('The failing assertion is in my pane.')
  if (!edits.length && !tests) parts.push(`The full answer is in my pane (${AGENT_TITLE[agent]}).`)
  return parts.join(' ')
}

/** "ask codex in pane p2 to check the web tests" → deck tools send_message. */
function messagePlan({ world, agent }: BrainInput, lower: string): Plan | null {
  const explicit = /\b(?:pane\s+)?(p\d+)\b/.exec(lower)?.[1]
  const kind = /\bcodex\b/.test(lower) ? 'codex' : /\bclaude\b/.test(lower) ? 'claude' : /\bgemini\b/.test(lower) ? 'gemini' : null
  const target = explicit ? world.pane(explicit) : kind ? world.findAgentPane(kind) : undefined
  const name = kind === 'codex' ? 'Codex' : kind === 'claude' ? 'Claude Code' : kind === 'gemini' ? 'Gemini' : explicit ? `pane ${explicit}` : 'the other agent'
  let task = lower.replace(/^.*?\b(?:ask|tell|message|ping|have|get|send)\b.*?\b(?:to|if|whether|about|that)\b\s*/, '')
  if (task === lower) task = lower.replace(/^.*?\b(?:codex|claude|gemini|p\d+)\b\s*/, '')
  task = task.replace(/[.!?]+$/, '').trim()
  if (!task) return null
  const request = `Please ${task}${/\b(report|tell me|let me know|reply)\b/.test(task) ? '' : ' and tell me what you find'}.`
  const title = `Ask ${name} to ${task.split(' ').slice(0, 4).join(' ')}`
  if (target && target.paneId === world.myPaneId())
    return { title: '', steps: [think(600), say(`That's this pane (${target.paneId}), so I'll just do it myself. Ask me directly: "${task}".`)] }
  if (!target)
    return {
      title,
      steps: [
        think(900),
        say(
          `There's no ${name} pane open in this window, so I can't message it. Start \`${kind ?? 'codex'}\` in another pane (or pick a pane id from the pane headers) and ask again.`
        )
      ]
    }
  return {
    title,
    steps: [
      think(1100, `Asking ${name}`),
      { t: 'message', to: () => target.paneId, toName: name, text: () => request },
      say((r) => {
        const sent = r.sent[r.sent.length - 1]
        if (!sent?.ok) return `The message to pane ${target.paneId} didn't go through: ${sent?.error ?? sent?.reason ?? 'it was refused'}.`
        return `I've asked ${name} in pane ${target.paneId} to ${task}. TerminalDeck delivers it once ${agent === 'codex' ? 'that agent' : 'it'} is idle with an empty input box, and its reply will show up here.`
      })
    ]
  }
}

/* ═════════════════════════════ everyday intents ═════════════════════════════ */

function explainPlan(input: BrainInput, lower: string, original: string): Plan {
  const { world } = input
  const file = /\b(repo|project|codebase|this folder|monorepo)\b/i.test(lower) ? null : mentionedFile(world, original)
  if (file) return explainFilePlan(input, file)
  const name = projectName(world)
  return {
    title: `Explain ${name}`,
    steps: [
      think(1200),
      say(`I'll take a look around ${name} to see how it fits together.`),
      { t: 'read', paths: ['README.md', 'package.json'] },
      { t: 'list', path: 'api/src' },
      { t: 'list', path: 'web/src' },
      { t: 'read', paths: [appFile(world)] },
      think(2200),
      say(() => {
        const fw = framework(world)
        const routes = listFiles(world, 'api/src/routes').map((f) => f.replace(/\.tsx?$/, ''))
        const mids = listFiles(world, 'api/src/middleware').map((f) => f.replace(/\.tsx?$/, ''))
        const tests = listFiles(world, 'api/tests', /\.test\.tsx?$/)
        const comps = listFiles(world, 'web/src/components').map((f) => f.replace(/\.tsx?$/, ''))
        let scripts: string[] = []
        try {
          scripts = Object.keys((JSON.parse(world.read('package.json') ?? '{}') as { scripts?: Record<string, string> }).scripts ?? {})
        } catch {
          scripts = []
        }
        const fwName = { express: 'Express', hono: 'Hono', fastify: 'Fastify', node: 'Node' }[fw]
        const lines = [`**${name}** is a TypeScript monorepo with two npm workspaces:`, '']
        lines.push(
          `- **\`api/\`**: an ${fwName} HTTP API. \`${appFile(world)}\` builds the app${routes.length ? ` and mounts the ${joinNames(routes.map((r) => `\`${r}\``))} routes` : ''}.${mids.length ? ` Middleware: ${joinNames(mids.map((m) => `\`${m}\``))}.` : ''} Data access lives in \`api/src/db.ts\`.${tests.length ? ` Tests use Vitest (${tests.length} files in \`api/tests\`).` : ''}`
        )
        lines.push(
          `- **\`web/\`**: a Vite + React dashboard. \`web/src/App.tsx\` composes${comps.length ? ` ${joinNames(comps.map((c) => `\`${c}\``))}` : ' the components'}, which call the API through \`web/src/api.ts\`.`
        )
        if (scripts.length) lines.push('', `Root scripts: ${scripts.map((s) => `\`npm run ${s}\``).join(', ')}.`)
        if (world.exists('.github/workflows/ci.yml')) lines.push('CI (`.github/workflows/ci.yml`) runs the API tests on every push.')
        lines.push('', `Good places to start: \`${appFile(world)}\` for the request pipeline, \`web/src/App.tsx\` for the UI.`)
        return lines.join('\n')
      })
    ]
  }
}

function explainFilePlan({ world }: BrainInput, file: string): Plan {
  const name = file.split('/').pop() ?? file
  return {
    title: `Explain ${name}`,
    steps: [
      think(1000),
      { t: 'read', paths: [file] },
      think(1800),
      say((r) => {
        const text = r.reads[file] ?? world.read(file)
        if (text === null || text === undefined) return `I couldn't read \`${file}\`. Does it exist?`
        const lines = [explainKnown(file, text) ?? explainGeneric(file, text)]
        if (/\.(tsx?|jsx?)$/.test(file)) {
          const users = importersOf(world, file)
          if (users.length) {
            const shown = users.slice(0, 3).map((u) => `\`${u}\``)
            const more = users.length - shown.length
            lines.push('', `It's imported by ${more > 0 ? `${shown.join(', ')} and ${more} other file${more === 1 ? '' : 's'}` : joinNames(shown)}.`)
          }
        }
        return lines.join('\n')
      })
    ]
  }
}

/** Prose from the code's shape, for files the agent has no notes on. */
function explainGeneric(file: string, text: string): string {
  const name = file.split('/').pop() ?? file
  if (/\.json$/.test(file)) {
    try {
      const pkg = JSON.parse(text) as { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string> }
      if (pkg.name || pkg.scripts) {
        const scripts = Object.keys(pkg.scripts ?? {})
        const deps = Object.keys(pkg.dependencies ?? {})
        return `It's the package manifest for \`${pkg.name ?? name}\`.${scripts.length ? ` Its scripts are ${joinNames(scripts.map((s) => `\`${s}\``))}.` : ''}${deps.length ? ` It depends on ${joinNames(deps.map((d) => `\`${d}\``))}.` : ''}`
      }
    } catch {
      /* not JSON after all */
    }
    return `It's a JSON configuration file (${lineCount(text)} lines).`
  }
  if (/\.md$/.test(file)) {
    const title = /^#\s+(.+)$/m.exec(text)?.[1]
    return `It's documentation${title ? `, titled "${title}"` : ''}. ${lineCount(text)} lines of Markdown.`
  }
  if (/\.ya?ml$/.test(file)) return `It's a YAML config${/jobs:/.test(text) ? ' for a CI workflow' : ''}.`
  if (/\.css$/.test(file)) return `It's the stylesheet: ${(text.match(/^[.#:\w][^{]*\{/gm) ?? []).length} rule blocks${/--[\w-]+:/.test(text) ? ', with the colours defined as CSS variables on `:root`' : ''}.`
  const ex = exportsOf(text)
  const pkgs = importsOf(text).filter((i) => !i.startsWith('.'))
  const routes = [...text.matchAll(/\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`)
  const isTest = /\.test\.tsx?$/.test(file)
  if (isTest) {
    const cases = [...text.matchAll(/\bit\(\s*['"`]([^'"`]+)/g)].map((m) => m[1])
    return `It's a Vitest file with ${cases.length} test${cases.length === 1 ? '' : 's'}${cases.length ? `: ${joinNames(cases.slice(0, 4).map((c) => `"${c}"`))}${cases.length > 4 ? ', …' : ''}` : ''}.`
  }
  const parts: string[] = []
  if (routes.length) parts.push(`it defines ${routes.length === 1 ? 'the endpoint' : 'the endpoints'} ${joinNames(routes.map((x) => `\`${x}\``))}`)
  if (ex.length) parts.push(`it exports ${joinNames(ex.slice(0, 5).map((e) => `\`${e}\``))}`)
  if (pkgs.length) parts.push(`it builds on ${joinNames(pkgs.map((p) => `\`${p}\``))}`)
  if (!parts.length) return `\`${name}\` is ${lineCount(text)} lines, mostly configuration or data, with no logic to walk through.`
  const sentence = parts.join(', and ')
  return `In \`${name}\`, ${sentence}.`
}

function readFilePlan(input: BrainInput, _lower: string, original: string): Plan | null {
  const file = mentionedFile(input.world, original)
  return file ? explainFilePlan(input, file) : null
}

function listPlan({ world }: BrainInput): Plan {
  return {
    title: 'List project files',
    steps: [
      think(700),
      { t: 'list', path: '.' },
      say(() => {
        const entries = world.list('.')
        const dirs = entries.filter((e) => e.isDir && !e.name.startsWith('.') && e.name !== 'node_modules').map((e) => `\`${e.name}/\``)
        const files = entries.filter((e) => !e.isDir).map((e) => `\`${e.name}\``)
        return `The project root has ${dirs.length} folders (${joinNames(dirs)}) and ${files.length} files (${joinNames(files)}). The code lives in \`api/src\` and \`web/src\`.`
      })
    ]
  }
}

function runTestsPlan({ world }: BrainInput, lower: string): Plan {
  const ws = /\b(web|front ?end|dashboard|ui|react)\b/.test(lower) ? 'web' : 'api'
  return {
    title: `Run ${ws === 'web' ? 'web' : 'API'} tests`,
    steps: [
      think(700),
      runTests(world, ws === 'web' ? 'Run the dashboard tests' : 'Run the API test suite', ws),
      say((r) => {
        if (r.declined.length) return "OK, I won't run them."
        const run = r.runs[r.runs.length - 1]
        const s = run ? testSummary(run.output) : null
        const files = s?.files ? ` across ${s.files} file${s.files === 1 ? '' : 's'}` : ''
        return s && s.failed === 0 ? `The ${ws === 'web' ? 'web' : 'API'} tests pass: ${s.passed} tests${files}.` : `Done: ${testLine(r) || 'the suite finished'}.`
      })
    ]
  }
}

function writeTestsPlan(input: BrainInput, lower: string, original: string): Plan {
  const { world } = input
  if (/rate.?limit/i.test(lower)) return rateLimitPlan(input)
  const target = mentionedFile(world, original) ?? (world.exists('api/src/routes/rates.ts') ? 'api/src/routes/rates.ts' : null)
  if (!target) return fallbackPlan(input, original)
  const stem = (target.split('/').pop() ?? 'module').replace(/\.tsx?$/, '')
  const ws = target.split('/')[0] === 'web' ? 'web' : 'api'
  const testDir = ws === 'web' ? target.split('/').slice(0, -1).join('/') : 'api/tests'
  const testPath = world.exists(`${testDir}/${stem}.test.ts`) ? `${testDir}/${stem}.exports.test.ts` : `${testDir}/${stem}.test.ts`
  const importPath = ws === 'web' ? `./${stem}` : `../${target.replace(/^api\//, '').replace(/\.tsx?$/, '')}`
  return {
    title: `Test ${stem}`,
    steps: [
      think(1000),
      { t: 'read', paths: [target] },
      { t: 'list', path: testDir },
      think(2000, `Writing tests for ${stem}`),
      {
        t: 'edit',
        path: testPath,
        why: `Add tests for ${stem}`,
        apply: () => {
          const ex = exportsOf(world.read(target) ?? '').filter((e) => !/^[A-Z][a-z]+(Props|Options|Config)$/.test(e))
          const cases = (ex.length ? ex : ['default']).slice(0, 5)
          return [
            "import { describe, expect, it } from 'vitest'",
            `import * as mod from '${importPath}'`,
            '',
            `describe('${stem}', () => {`,
            ...cases.flatMap((name, i) => [...(i ? [''] : []), `  it('exports ${name}', () => {`, `    expect(mod.${name === 'default' ? 'default' : name}).toBeDefined()`, '  })']),
            '})',
            ''
          ].join('\n')
        }
      },
      runTests(world, ws === 'web' ? 'Run the dashboard tests' : 'Run the API test suite', ws),
      say((r) =>
        r.declined.length
          ? `The tests are in \`${testPath}\`. Run \`npm test -w ${ws}\` to try them.`
          : `Added \`${testPath}\`, and ${testLine(r) || 'the suite runs'}. They're smoke tests that pin down \`${stem}\`'s public surface. Tell me which behaviour matters most and I'll add real assertions for it.`
      )
    ]
  }
}

/* ── refactor: a magic number pulled into a named constant is the one change made mechanically ── */

interface MagicNumber {
  line: number
  value: string
  name: string
}

function findMagicNumber(text: string): MagicNumber | null {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\s*(import|export const [A-Z_]+ =|const [A-Z_]+ =|\/\/|\*)/.test(l)) continue
    const m = /\.(max|min|default)\((\d{2,}(?:_\d{3})*)\)/.exec(l) ?? /[^\w.'"`](\d{3,}(?:_\d{3})*)\b(?!['"`])/.exec(l)
    if (!m) continue
    const key = /^\s*([A-Za-z_$][\w$]*)\s*[:=]/.exec(l)?.[1] ?? /(?:const|let)\s+([A-Za-z_$][\w$]*)/.exec(l)?.[1]
    if (!key) continue
    const value = m.length === 3 ? m[2] : m[1]
    const kind = m.length === 3 ? m[1] : ''
    const name = kind === 'max' ? `MAX_${constName(key)}` : kind === 'min' ? `MIN_${constName(key)}` : kind === 'default' ? `DEFAULT_${constName(key)}` : `${constName(key)}_${value.replace(/_/g, '')}`
    if (text.includes(`const ${name} `)) continue
    return { line: i, value, name }
  }
  return null
}

function extractConstant(text: string, magic: MagicNumber): string {
  const lines = text.split('\n')
  if (!lines[magic.line]?.includes(magic.value)) return text
  lines[magic.line] = lines[magic.line].replace(new RegExp(`(\\.(?:max|min|default)\\()?${magic.value}\\b`), (_m, call: string | undefined) => `${call ?? ''}${magic.name}`)
  let at = 0
  for (let i = 0; i < lines.length; i++) if (/^import\b/.test(lines[i])) at = i + 1
  if (at > 0) lines.splice(at, 0, '', `const ${magic.name} = ${magic.value}`)
  else lines.splice(0, 0, `const ${magic.name} = ${magic.value}`, '')
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

function refactorPlan(input: BrainInput, _lower: string, original: string): Plan {
  const { world } = input
  const target = mentionedFile(world, original) ?? appFile(world)
  const text0 = world.read(target) ?? ''
  const magic = findMagicNumber(text0)
  return {
    title: `Refactor ${target.split('/').pop()}`,
    steps: [
      think(1200),
      { t: 'read', paths: [target] },
      think(2400, 'Looking for refactors'),
      say((r) => {
        const text = r.reads[target] ?? world.read(target)
        if (!text) return `I couldn't read \`${target}\`.`
        const lines = text.split('\n')
        const notes: string[] = []
        if (magic) notes.push(`- Line ${magic.line + 1} has a magic number (\`${lines[magic.line].trim().replace(/[,;]$/, '').slice(0, 60)}\`). Pull \`${magic.value}\` into a named constant like \`${magic.name}\`.`)
        let depth = 0
        let longest = { start: 0, len: 0 }
        let start = -1
        lines.forEach((l, i) => {
          if (/=>\s*\{\s*$|function .*\{\s*$/.test(l) && depth === 0) start = i
          depth += (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length
          if (depth === 0 && start >= 0) {
            if (i - start > longest.len) longest = { start, len: i - start }
            start = -1
          }
        })
        if (longest.len > 25) notes.push(`- The function starting at line ${longest.start + 1} is ${longest.len} lines. Split the validation and the response shaping into helpers.`)
        if (/catch\s*\(\w*\)\s*\{\s*\}/.test(text)) notes.push('- There is an empty `catch`. Log the error, or at least comment why it is ignored.')
        if (/:\s*any\b|as any\b|<any>/.test(text)) notes.push('- It uses `any`. Tighten those types so the compiler can help.')
        if (!notes.length) return `\`${target}\` is already small and focused (${lines.length} lines). I wouldn't restructure it just for the sake of it.`
        const ask =
          magic && notes.length === 1
            ? "Want me to apply it? It's a mechanical change."
            : magic
              ? "Want me to apply the first one? It's mechanical; the others are judgement calls I'd talk through first."
              : notes.length === 1
                ? "It's a judgement call rather than a mechanical edit, so tell me if and how you'd like it done."
                : "These are judgement calls rather than mechanical edits, so tell me which one you'd like and how."
        const tail = input.oneshot ? [] : ['', ask]
        return [notes.length === 1 ? `There's one thing I'd change in \`${target}\`:` : `Here's what I'd change in \`${target}\`:`, '', ...notes, ...tail].join('\n')
      })
    ],
    offer: magic
      ? {
          what: `extract ${magic.name}`,
          accept: () => ({
            title: `Refactor ${target.split('/').pop()}`,
            steps: [
              think(900),
              { t: 'edit', path: target, why: `Name the magic number ${magic.value}`, apply: (old) => (old === null ? null : extractConstant(old, findMagicNumber(old) ?? magic)) },
              runTests(world),
              say((r) => (r.declined.length ? `\`${magic.name}\` is in place in \`${target}\`.` : `\`${magic.value}\` is now \`${magic.name}\` in \`${target}\`, and ${testLine(r) || 'the tests pass'}.`))
            ]
          })
        }
      : undefined
  }
}

/* ── features the demo can build for real, and an honest plan for the rest ── */

const SHIPMENTS = 'api/src/routes/shipments.ts'

function paginationPlan({ world }: BrainInput): Plan {
  const text = world.read(SHIPMENTS) ?? ''
  const paged = /limit[\s\S]*offset/.test(text)
  const done = text.includes('hasMore')
  return {
    title: 'Paginate shipments',
    steps: [
      think(1100),
      { t: 'read', paths: [SHIPMENTS, 'api/src/db.ts'] },
      think(1600),
      say(() => {
        if (!paged) return `\`${SHIPMENTS}\` returns every shipment at once. I'd add \`limit\` and \`offset\` query parameters, validated with zod, and pass them to \`db.listShipments\`.`
        if (done) return `The shipments list already pages: \`limit\` (1 to 100, default 25) and \`offset\`, plus a \`hasMore\` flag that tells the client whether another page exists.`
        return [
          `The shipments list already pages. \`GET /shipments\` takes \`limit\` (1 to 100, default 25) and \`offset\`, validated with zod, and \`db.listShipments\` turns them into \`LIMIT\`/\`OFFSET\`.`,
          '',
          "What's missing is a way to know when to stop: the response doesn't say whether there's another page. I'd fetch one extra row and return a `hasMore` flag. Want me to add that?"
        ].join('\n')
      })
    ],
    offer:
      paged && !done
        ? {
            what: 'add hasMore',
            accept: () => ({
              title: 'Paginate shipments',
              steps: [
                think(900, 'Adding hasMore'),
                { t: 'edit', path: SHIPMENTS, why: 'Return hasMore with each page', apply: (old) => (old === null ? null : addHasMore(old)) },
                runTests(world),
                say((r) => `\`GET /shipments\` now asks the database for one row more than \`limit\` and returns \`hasMore: true\` when that row exists${r.declined.length ? '' : `; ${testLine(r) || 'the tests pass'}`}. The dashboard can show a "Next" button from it.`)
              ],
              offer: { what: 'commit', accept: (i) => commitPlan(i) }
            })
          }
        : undefined
  }
}

function addHasMore(text: string): string {
  if (text.includes('hasMore')) return text
  return text.replace(
    /    const items = await db\.listShipments\(query\.data\)\n    res\.json\(\{ items, limit: query\.data\.limit, offset: query\.data\.offset \}\)/,
    [
      '    // One row more than the page tells us whether another page exists.',
      '    const rows = await db.listShipments({ ...query.data, limit: query.data.limit + 1 })',
      '    const items = rows.slice(0, query.data.limit)',
      '    res.json({ items, limit: query.data.limit, offset: query.data.offset, hasMore: rows.length > query.data.limit })'
    ].join('\n')
  )
}

const STYLES = 'web/src/styles.css'

function themePlan({ world }: BrainInput): Plan {
  const css = world.read(STYLES) ?? ''
  const done = /prefers-color-scheme/.test(css)
  return {
    title: 'Dashboard theme',
    steps: [
      think(1000),
      { t: 'read', paths: [STYLES] },
      think(1400),
      say(() =>
        done
          ? `\`${STYLES}\` already follows the system setting: dark by default, light under \`prefers-color-scheme: light\`.`
          : "The dashboard is dark-only: every colour is a CSS variable on `:root` in `web/src/styles.css` (`--bg: #0f141c` and friends). That makes a light theme easy: override the same variables under `@media (prefers-color-scheme: light)`, so it follows the system setting. Want me to add it?"
      )
    ],
    offer: done
      ? undefined
      : {
          what: 'add a light theme',
          accept: () => ({
            title: 'Dashboard theme',
            steps: [
              think(900, 'Adding a light palette'),
              { t: 'edit', path: STYLES, why: 'Follow the system light/dark setting', apply: (old) => (old === null ? null : addLightTheme(old)) },
              say("Done. The dashboard now follows the system setting: the same variables get light values under `prefers-color-scheme: light`, so no component had to change. With `npm run dev -w web` running, switch your OS theme to see it.")
            ],
            offer: { what: 'commit', accept: (i) => commitPlan(i) }
          })
        }
  }
}

function addLightTheme(css: string): string {
  if (/prefers-color-scheme/.test(css)) return css
  const end = css.indexOf('}\n')
  if (end < 0) return css
  const block = [
    '',
    '@media (prefers-color-scheme: light) {',
    '  :root {',
    '    --bg: #f6f7f9;',
    '    --panel: #ffffff;',
    '    --line: #dde3ec;',
    '    --text: #1b2330;',
    '    --muted: #5b6778;',
    '    --accent: #a8791f;',
    '  }',
    '}',
    ''
  ].join('\n')
  return css.slice(0, end + 2) + block + css.slice(end + 2)
}

function fallbackPlan({ world, agent }: BrainInput, prompt: string): Plan {
  const words = [...new Set((prompt.toLowerCase().match(/[a-z_]{4,}/g) ?? []).filter((w) => !STOP.has(w)))].slice(0, 3)
  const hint = [
    `This is ${AGENT_TITLE[agent]} running in the TerminalDeck web demo, so what I can do here is scripted. Things that work end to end:`,
    ...EXAMPLES,
    '- `/help`, `/model`, `/status`, `/clear`, `/exit`'
  ]
  // A word the repo actually uses is worth a search; anything else, ask what they mean.
  const word = words.find((w) => world.grep(w, '.', { limit: 1 }).length > 0)
  const short = prompt.trim().split(/\s+/).length <= 3
  if (!word) {
    return {
      title: short ? '' : prompt.slice(0, 40),
      steps: [think(1000), say([`I'm not sure what you mean by "${prompt.trim().slice(0, 60)}". Could you say a bit more about what you'd like me to do?`, '', ...hint].join('\n'))]
    }
  }
  return {
    title: short ? '' : prompt.slice(0, 40),
    steps: [
      think(1300),
      { t: 'search', pattern: word, path: '.' },
      think(1500),
      say((r) => {
        const hits = r.searches[word] ?? []
        const files = [...new Set(hits.map((h) => world.rel(h.path)))]
        const lead = `\`${word}\` appears in ${files.length} file${files.length === 1 ? '' : 's'} (${files.slice(0, 3).map((f) => `\`${f}\``).join(', ')}${files.length > 3 ? ', …' : ''}). What would you like to do with it?`
        return [lead, '', ...hint].join('\n')
      })
    ]
  }
}
