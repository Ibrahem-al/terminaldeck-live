import { A, L, s, type TermStep } from '../components/app/Terminal'
import type { ChatStep } from '../components/app/AgentChat'

/* ───────────────── Terminal sessions ───────────────── */

/** Hero left pane: a tight test → commit loop with real-looking colored output. */
export const heroTerminal: TermStep[] = [
  { cmd: 'npm test', cwd: '~\\dev\\my-app' },
  {
    out: [
      L(s('  RUN ', A(8)), s(' v2.1.4', A(8)), s('  ~\\dev\\my-app', A(8))),
      L(),
      L(s(' ✓ ', A(2)), s('src/auth/token.test.ts', A(7)), s(' (8)', A(8))),
      L(s(' ✓ ', A(2)), s('src/api/routes.test.ts', A(7)), s(' (14)', A(8))),
      L(s(' ✓ ', A(2)), s('src/store/session.test.ts', A(7)), s(' (6)', A(8))),
      L(),
      L(s(' Test Files ', A(8)), s(' 3 passed', A(2)), s(' (3)', A(8))),
      L(s('      Tests ', A(8)), s(' 28 passed', A(2)), s(' (28)', A(8))),
      L(s('   Duration ', A(8)), s(' 1.21s', A(7)))
    ]
  },
  { exit: 0, took: '1.2s' },
  { wait: 700 },
  { cmd: 'git commit -am "feat: encrypted env vars"' },
  {
    out: [
      L(s('[main 9c4f1a2] ', A(3)), s('feat: encrypted env vars', A(7))),
      L(s(' 3 files changed, 78 insertions(+), 12 deletions(-)', A(8)))
    ]
  },
  { exit: 0, took: '0.3s' },
  { wait: 900 },
  { cmd: 'npm run dev' },
  {
    out: [
      L(),
      L(s('  VITE ', A(2)), s('v6.0.5', A(8)), s('  ready in 412 ms', A(8))),
      L(),
      L(s('  ➜  ', A(2)), s('Local:   ', A(7)), s('http://localhost:5173/', A(4))),
      L(s('  ➜  ', A(2)), s('Network: ', A(7)), s('use --host to expose', A(8)))
    ]
  }
]

/** A standalone terminal-feature demo: shell switching + interactive output. */
export const featureTerminal: TermStep[] = [
  { cmd: 'pwsh -v', cwd: 'C:\\repos\\api' },
  { out: [L(s('PowerShell 7.4.6', A(7)))] },
  { exit: 0 },
  { cmd: 'gh pr status' },
  {
    out: [
      L(),
      L(s('Current branch', A(3))),
      L(s('  #218 ', A(6)), s('Encrypt project env vars at rest ', A(7)), s('[main ← env-dpapi]', A(8))),
      L(s('   ✓ 3 checks passing', A(2))),
      L()
    ]
  },
  { exit: 0 },
  { cmd: 'rg "safeStorage" src --count' },
  {
    out: [
      L(s('src/main/store/persist.ts:', A(4)), s('4', A(3))),
      L(s('src/main/ipc/projects.ts:', A(4)), s('1', A(3)))
    ]
  },
  { exit: 0 }
]

/* ───────────────── Agent sessions ───────────────── */

/** Hero right pane: Claude adds a rate limiter, with streamed text + tool cards. */
export const heroAgent: ChatStep[] = [
  { user: 'Add a token-bucket rate limiter to the API and cover it with a test.' },
  {
    say: "I'll add a rate limiter middleware. Let me look at how the API wires its middleware first."
  },
  {
    tool: {
      name: 'Read',
      icon: 'read',
      summary: 'src/server/api.ts',
      ms: 1200,
      preview: 'export const api = express()\napi.use(cors())\napi.use(express.json())\n// routes mounted below'
    }
  },
  {
    say: 'Got it. I\'ll add a `tokenBucket` limiter at 60 requests/min per IP, mounted before the routes.'
  },
  {
    tool: {
      name: 'Write',
      icon: 'edit',
      summary: 'src/server/rateLimit.ts',
      ms: 1500,
      preview:
        'export function tokenBucket(opts: { rpm: number }) {\n  const hits = new Map<string, number[]>()\n  return (req, res, next) => { /* … */ }\n}'
    }
  },
  { tool: { name: 'Edit', icon: 'edit', summary: 'src/server/api.ts', ms: 1000 } },
  {
    tool: {
      name: 'Bash',
      icon: 'bash',
      summary: 'npm test -- rateLimit',
      ms: 1700,
      preview: '✓ src/server/rateLimit.test.ts (5)\n\nTest Files  1 passed (1)\n     Tests  5 passed (5)'
    }
  },
  {
    say: 'Done. The limiter is mounted ahead of all routes and **5 tests pass**: burst, refill, per-IP isolation, and the `429` response shape. Want me to make the window configurable via `RATE_RPM`?'
  },
  { wait: 400 }
]

/** Standalone agent-feature demo. */
export const featureAgent: ChatStep[] = [
  { user: 'Why is the dev server logging "EADDRINUSE" on boot?' },
  { say: 'That means port 5173 is already taken. Let me find what is holding it.' },
  {
    tool: {
      name: 'Bash',
      icon: 'bash',
      summary: 'netstat -ano | findstr :5173',
      ms: 1300,
      preview: 'TCP    127.0.0.1:5173     LISTENING       18244'
    }
  },
  {
    tool: {
      name: 'Bash',
      icon: 'bash',
      summary: 'tasklist /fi "pid eq 18244"',
      ms: 1100,
      preview: 'node.exe                     18244 Console      1     92,140 K'
    }
  },
  {
    say: 'A stray `node.exe` (PID 18244) from an earlier `npm run dev` never exited. Kill it with `taskkill /pid 18244 /f`, or set a different port in `vite.config.ts`. Want me to add a `predev` script that frees the port automatically?'
  },
  { wait: 400 }
]
