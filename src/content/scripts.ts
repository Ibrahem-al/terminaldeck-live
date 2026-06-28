import { A, L, s, type TermStep } from '../components/app/Terminal'

/* ───────────────── Terminal sessions ───────────────── */

/** Hero left pane: a tight test → commit → dev loop with colored output. */
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

/** Hero right pane: Claude Code running as a real terminal (the CLI, not a chat). */
export const heroClaude: TermStep[] = [
  { cmd: 'claude', cwd: '~\\dev\\my-app' },
  {
    out: [
      L(s('✻ ', 'var(--accent)'), s('Welcome to Claude Code', A(7))),
      L(s('  /help for commands · cwd ', A(8)), s('~\\dev\\my-app', A(8))),
      L(),
      L(s('> ', A(6)), s('add a token-bucket rate limiter to the API and cover it with a test', A(7))),
      L()
    ]
  },
  { wait: 500 },
  {
    out: [
      L(s('⏺ ', 'var(--accent)'), s('Read', A(4)), s('(src/server/api.ts)', A(8))),
      L(s('  ⎿  ', A(8)), s('read 42 lines', A(8)))
    ]
  },
  { wait: 400 },
  {
    out: [
      L(s('⏺ ', 'var(--accent)'), s('Write', A(2)), s('(src/server/rateLimit.ts)', A(8))),
      L(s('  ⎿  ', A(8)), s('+22 lines', A(2)))
    ]
  },
  { wait: 400 },
  {
    out: [
      L(s('⏺ ', 'var(--accent)'), s('Edit', A(3)), s('(src/server/api.ts)', A(8))),
      L(s('  ⎿  ', A(8)), s('mounted the limiter before all routes', A(8)))
    ]
  },
  { wait: 500 },
  {
    out: [
      L(s('⏺ ', 'var(--accent)'), s('Bash', A(5)), s('(npm test -- rateLimit)', A(8))),
      L(s('  ⎿  ', A(8)), s('5 passed', A(2)), s(' in 0.42s', A(8)))
    ]
  },
  { wait: 500 },
  {
    out: [
      L(),
      L(s('⏺ ', 'var(--accent)'), s('Done. The limiter is mounted ahead of every route', A(7))),
      L(s('  and 5 tests pass: burst, refill, per-IP, and the 429 shape.', A(7)))
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

/** Agents section: Claude Code debugging a flaky boot, in a terminal. */
export const agentClaude: TermStep[] = [
  { cmd: 'claude "why does the dev server log EADDRINUSE on boot?"', cwd: 'C:\\repos\\api' },
  {
    out: [
      L(s('✻ ', 'var(--accent)'), s('Claude Code', A(7))),
      L()
    ]
  },
  { wait: 400 },
  {
    out: [
      L(s('⏺ ', 'var(--accent)'), s('Bash', A(5)), s('(netstat -ano | findstr :5173)', A(8))),
      L(s('  ⎿  ', A(8)), s('TCP 127.0.0.1:5173  LISTENING  18244', A(7)))
    ]
  },
  { wait: 450 },
  {
    out: [
      L(s('⏺ ', 'var(--accent)'), s('Bash', A(5)), s('(tasklist /fi "pid eq 18244")', A(8))),
      L(s('  ⎿  ', A(8)), s('node.exe  18244  Console  92,140 K', A(7)))
    ]
  },
  { wait: 500 },
  {
    out: [
      L(),
      L(s('⏺ ', 'var(--accent)'), s('A stray node.exe (PID 18244) from an earlier', A(7))),
      L(s('  npm run dev never exited. Free it with', A(7))),
      L(s('  taskkill /pid 18244 /f', A(3)), s(', or pick another port.', A(7)))
    ]
  }
]
