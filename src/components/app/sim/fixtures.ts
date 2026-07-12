import { A, L, s, type Line } from '../Terminal'

/* ─────────────── Fake project filesystem (for ls / cd / cat) ─────────────── */

export interface Dirent {
  name: string
  dir?: boolean
}

/** A small, self-consistent tree rooted at the project. Keyed by relative path. */
export const FS: Record<string, Dirent[]> = {
  '': [
    { name: 'src', dir: true },
    { name: 'tests', dir: true },
    { name: 'node_modules', dir: true },
    { name: 'package.json' },
    { name: 'tsconfig.json' },
    { name: 'vite.config.ts' },
    { name: 'README.md' },
    { name: '.env' }
  ],
  src: [
    { name: 'auth', dir: true },
    { name: 'server', dir: true },
    { name: 'store', dir: true },
    { name: 'App.tsx' },
    { name: 'main.ts' }
  ],
  'src/server': [{ name: 'api.ts' }, { name: 'rateLimit.ts' }, { name: 'db.ts' }],
  'src/auth': [{ name: 'token.ts' }, { name: 'token.test.ts' }, { name: 'middleware.ts' }],
  tests: [{ name: 'e2e.spec.ts' }, { name: 'setup.ts' }]
}

export const FILES: Record<string, Line[]> = {
  'package.json': [
    L(s('{', A(7))),
    L(s('  "name"', A(4)), s(': ', A(7)), s('"my-app"', A(2)), s(',', A(7))),
    L(s('  "version"', A(4)), s(': ', A(7)), s('"2.1.4"', A(2)), s(',', A(7))),
    L(s('  "scripts"', A(4)), s(': { ', A(7)), s('"dev"', A(4)), s(': ', A(7)), s('"vite"', A(2)), s(', ', A(7)), s('"test"', A(4)), s(': ', A(7)), s('"vitest"', A(2)), s(' }', A(7))),
    L(s('}', A(7)))
  ],
  'readme.md': [
    L(s('# my-app', 'var(--accent)')),
    L(),
    L(s('A small API with encrypted env vars and a token-bucket rate limiter.', A(7))),
    L(s('Run ', A(7)), s('npm run dev', A(3)), s(' to start, ', A(7)), s('npm test', A(3)), s(' to check.', A(7)))
  ],
  '.env': [
    L(s('# secrets are DPAPI-encrypted at rest — this is a preview', A(8))),
    L(s('API_KEY', A(4)), s('=', A(7)), s('••••••••••••••••', A(8))),
    L(s('DATABASE_URL', A(4)), s('=', A(7)), s('••••••••••••••••', A(8)))
  ]
}

/* ─────────────── Command output builders (theme-token colored) ─────────────── */

export const out = {
  helpHeader: (): Line[] => [
    L(s('TerminalDeck preview shell', 'var(--accent)'), s(' — a real terminal lives in the app.', A(8))),
    L(s('Try any of these:', A(7))),
    L()
  ],
  help: (): Line[] => [
    ...cmdHelp('npm test', 'run the test suite'),
    ...cmdHelp('npm run dev', 'start the dev server'),
    ...cmdHelp('git status', 'show the working tree'),
    ...cmdHelp('claude "…"', 'hand a task to Claude Code'),
    ...cmdHelp('ls · cd · cat', 'browse the project'),
    ...cmdHelp('theme <name>', 'recolor everything live (try: ember)'),
    ...cmdHelp('clear', 'clear the screen'),
    L()
  ],
  notFound: (cmd: string): Line[] => [
    L(s(cmd, A(1)), s(': command not found. Type ', A(7)), s('help', A(3)), s(' to see what works here.', A(7)))
  ],
  npmTest: (): Line[] => [
    L(s('  RUN ', A(8)), s(' v2.1.4', A(8)), s('  ~\\dev\\my-app', A(8))),
    L(),
    L(s(' ✓ ', A(2)), s('src/auth/token.test.ts', A(7)), s(' (8)', A(8))),
    L(s(' ✓ ', A(2)), s('src/api/routes.test.ts', A(7)), s(' (14)', A(8))),
    L(s(' ✓ ', A(2)), s('src/store/session.test.ts', A(7)), s(' (6)', A(8))),
    L(),
    L(s(' Test Files ', A(8)), s(' 3 passed', A(2)), s(' (3)', A(8))),
    L(s('      Tests ', A(8)), s(' 28 passed', A(2)), s(' (28)', A(8))),
    L(s('   Duration ', A(8)), s(' 1.21s', A(7)))
  ],
  npmDev: (): Line[] => [
    L(),
    L(s('  VITE ', A(2)), s('v6.0.5', A(8)), s('  ready in 412 ms', A(8))),
    L(),
    L(s('  ➜  ', A(2)), s('Local:   ', A(7)), s('http://localhost:5173/', A(4))),
    L(s('  ➜  ', A(2)), s('Network: ', A(7)), s('use --host to expose', A(8))),
    L(s('  ➜  ', A(2)), s('press ', A(8)), s('h', A(3)), s(' to show help', A(8)))
  ],
  npmBuild: (): Line[] => [
    L(s('vite ', A(5)), s('v6.0.5 building for production…', A(8))),
    L(s('✓ ', A(2)), s('412 modules transformed', A(7))),
    L(s('dist/index.html  ', A(8)), s('0.61 kB', A(7))),
    L(s('dist/assets/index.js  ', A(8)), s('184.2 kB │ gzip: 58.1 kB', A(7))),
    L(s('✓ ', A(2)), s('built in 3.41s', A(2)))
  ],
  npmInstall: (pkg: string): Line[] => [
    L(s('added 1 package, ', A(7)), s('and audited 412 packages in 2s', A(8))),
    L(s('+ ', A(2)), s(pkg || 'package', A(7))),
    L(s('found ', A(8)), s('0 vulnerabilities', A(2)))
  ],
  gitStatus: (): Line[] => [
    L(s('On branch ', A(7)), s('main', A(2))),
    L(s("Your branch is up to date with 'origin/main'.", A(8))),
    L(),
    L(s('Changes to be committed:', A(7))),
    L(s('  modified:   ', A(2)), s('src/server/api.ts', A(2))),
    L(s('  new file:   ', A(2)), s('src/server/rateLimit.ts', A(2)))
  ],
  gitLog: (): Line[] => [
    L(s('9c4f1a2', A(3)), s(' feat: encrypted env vars', A(7)), s(' (HEAD → main)', A(6))),
    L(s('b71c0de', A(3)), s(' fix: token refresh race', A(7))),
    L(s('3a0f9e1', A(3)), s(' chore: bump vite to 6', A(7)))
  ],
  gitCommit: (msg: string): Line[] => [
    L(s('[main 9c4f1a2] ', A(3)), s(msg || 'commit', A(7))),
    L(s(' 2 files changed, 78 insertions(+), 12 deletions(-)', A(8))),
    L(s(' create mode 100644 src/server/rateLimit.ts', A(8)))
  ],
  gitPush: (): Line[] => [
    L(s('Enumerating objects: 12, done.', A(8))),
    L(s('Writing objects: 100% (7/7), 1.21 KiB', A(8))),
    L(s('To github.com:me/my-app.git', A(8))),
    L(s('   9c4f1a2..b71c0de  ', A(7)), s('main -> main', A(2)))
  ],
  whoami: (): Line[] => [L(s('developer', A(7)))],
  ports: (): Line[] => [
    L(s('PORT   PID    PROCESS', A(8))),
    L(s('5173   18244  node.exe', A(7)), s('   vite dev server', A(8))),
    L(s('8787   12010  TerminalDeck', A(7)), s('   RemoteDeck agent', A(8)))
  ]
}

function cmdHelp(cmd: string, desc: string): Line[] {
  return [L(s('  ❯ ', 'var(--accent)'), s(cmd.padEnd(15), A(3)), s(desc, A(8)))]
}

/* ─────────────── Claude Code streamed session ─────────────── */

export function claudeSession(task: string): Line[][] {
  return [
    [
      L(s('✻ ', 'var(--accent)'), s('Welcome to Claude Code', A(7))),
      L(s('  cwd ', A(8)), s('~\\dev\\my-app', A(8))),
      L(),
      L(s('> ', A(6)), s(task, A(7))),
      L()
    ],
    [
      L(s('⏺ ', 'var(--accent)'), s('Read', A(4)), s('(src/server/api.ts)', A(8))),
      L(s('  ⎿  ', A(8)), s('read 42 lines', A(8)))
    ],
    [
      L(s('⏺ ', 'var(--accent)'), s('Write', A(2)), s('(src/server/rateLimit.ts)', A(8))),
      L(s('  ⎿  ', A(8)), s('+22 lines', A(2)))
    ],
    [
      L(s('⏺ ', 'var(--accent)'), s('Edit', A(3)), s('(src/server/api.ts)', A(8))),
      L(s('  ⎿  ', A(8)), s('mounted the limiter before all routes', A(8)))
    ],
    [
      L(s('⏺ ', 'var(--accent)'), s('Bash', A(5)), s('(npm test -- rateLimit)', A(8))),
      L(s('  ⎿  ', A(8)), s('5 passed', A(2)), s(' in 0.42s', A(8)))
    ],
    [
      L(),
      L(s('⏺ ', 'var(--accent)'), s('Done. The limiter is mounted ahead of every route', A(7))),
      L(s('  and 5 tests pass: burst, refill, per-IP, and the 429 shape.', A(7)))
    ]
  ]
}
