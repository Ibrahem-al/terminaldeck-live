/**
 * The seed file system and git history (owned by the vfs builder).
 *
 * File CONTENTS are real files under `scenario/files/.tree/<tree>/…`, loaded
 * raw at build time; `.head/` holds the HEAD text of each file that is dirty at
 * boot. The folders start with a dot on purpose: tsc's `scenario/**\/*.ts`
 * include skips dot-directories, so the sample repo's own TypeScript (which
 * imports express, react, …) is never type-checked as demo code.
 *
 * Shape contract (backend/contracts.ts: SeedTree, SeedRepo): tree paths are
 * Windows paths relative to the tree root; repo paths are repo-relative with
 * forward slashes, like git prints them.
 */
import type { SeedRepo, SeedTree } from '../backend/contracts'
import { machine } from './machine'
import { DOTFILES_ROOT, HARBOR_ROOT } from './projects'

const raw = (glob: Record<string, unknown>, prefix: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, text] of Object.entries(glob)) {
    // A Windows checkout may have converted the seed to CRLF; the virtual repo is LF, like its .gitattributes-less origin.
    out[key.slice(prefix.length)] = String(text).replace(/\r\n/g, '\n')
  }
  return out
}

const TREE = raw(
  import.meta.glob('./files/.tree/**/*', { query: '?raw', import: 'default', eager: true, exhaustive: true }),
  './files/.tree/'
)
const HEAD = raw(
  import.meta.glob('./files/.head/**/*', { query: '?raw', import: 'default', eager: true, exhaustive: true }),
  './files/.head/'
)

/** Files of one seed folder (`harbor`, `dotfiles`, `home`) as SeedFiles. */
function filesOf(tree: string): SeedTree['files'] {
  const prefix = `${tree}/`
  return Object.entries(TREE)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, content]) => ({ path: k.slice(prefix.length).replace(/\//g, '\\'), content }))
}

function headOf(tree: string): Record<string, string> {
  const prefix = `${tree}/`
  return Object.fromEntries(
    Object.entries(HEAD)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, text]) => [k.slice(prefix.length), text])
  )
}

/** Installed packages, so `ls node_modules` and the tree look like an `npm install` happened. */
const PACKAGES: Record<string, string> = {
  express: '5.1.0',
  pg: '8.16.3',
  pino: '9.9.4',
  'pino-pretty': '13.1.1',
  zod: '4.1.5',
  react: '18.3.1',
  'react-dom': '18.3.1',
  vite: '7.1.5',
  vitest: '3.2.4',
  supertest: '7.1.4',
  tsx: '4.20.5',
  typescript: '5.9.2',
  concurrently: '9.2.1',
  eslint: '9.35.0',
  prettier: '3.6.2',
  '@vitejs/plugin-react': '5.0.2',
  '@types/node': '22.18.1',
  '@types/express': '5.0.3'
}

const nodeModules: SeedTree['files'] = Object.entries(PACKAGES).map(([name, version]) => ({
  path: `node_modules\\${name.replace('/', '\\')}\\package.json`,
  content: `${JSON.stringify({ name, version, license: 'MIT' }, null, 2)}\n`
}))

const dotfilesGitconfig = TREE['dotfiles/.gitconfig'] ?? ''

/**
 * The developer's own `.env` (git-ignored), which every `--env-file=../.env`
 * script reads. Inline rather than under .tree/, so no real-looking `.env`
 * file sits in the website repo; the values are local-dev placeholders.
 */
const LOCAL_ENV = `DATABASE_URL=postgres://harbor:harbor@localhost:5432/harbor
PORT=8787
API_TOKENS=dev-token-change-me
STRIPE_KEY=
LOG_LEVEL=debug
`

export const trees: SeedTree[] = [
  {
    root: 'C:\\',
    files: [],
    dirs: [
      'Program Files\\Git\\bin',
      'Program Files\\Git\\cmd',
      'Program Files\\nodejs',
      'Program Files\\PowerShell\\7',
      'ProgramData',
      'Users\\Public',
      'Windows\\System32'
    ]
  },
  {
    root: machine.home,
    // install.ps1 linked the dotfiles' .gitconfig here; the copy is what git reads for commits.
    files: [...filesOf('home'), { path: '.gitconfig', content: dotfilesGitconfig }],
    dirs: [
      'Desktop',
      'Downloads',
      'Pictures',
      'projects',
      'AppData\\Local\\Temp',
      'AppData\\Roaming\\npm',
      'AppData\\Roaming\\quarterdeck'
    ]
  },
  {
    root: HARBOR_ROOT,
    files: [...filesOf('harbor'), ...nodeModules, { path: '.env', content: LOCAL_ENV }],
    dirs: ['node_modules\\.bin']
  },
  {
    root: DOTFILES_ROOT,
    files: filesOf('dotfiles')
  }
]

const SAM = { author: 'Sam Rivera', email: 'sam@harbor.dev' }
const PRIYA = { author: 'Priya Shah', email: 'priya@harbor.dev' }

export const repos: SeedRepo[] = [
  {
    root: HARBOR_ROOT,
    branch: 'main',
    remote: { name: 'origin', url: 'https://github.com/harbor-dev/harbor.git', ahead: 0, behind: 0 },
    commits: [
      {
        message: 'chore: scaffold api and web workspaces',
        ...SAM,
        daysAgo: 24,
        files: [
          '.gitignore',
          '.prettierrc',
          'README.md',
          'eslint.config.js',
          'package.json',
          'tsconfig.json',
          'api/package.json',
          'api/tsconfig.json',
          'web/index.html',
          'web/package.json',
          'web/src/main.tsx',
          'web/tsconfig.json',
          'web/vite.config.ts'
        ]
      },
      {
        message: 'api: express app, env config and error handling',
        ...SAM,
        daysAgo: 22,
        files: [
          '.env.example',
          'api/src/app.ts',
          'api/src/config.ts',
          'api/src/middleware/errors.ts',
          'api/src/middleware/validate.ts',
          'api/src/server.ts'
        ]
      },
      {
        message: 'api: shipments routes backed by postgres',
        ...PRIYA,
        daysAgo: 19,
        files: [
          'api/src/db.ts',
          'api/src/db/migrate.ts',
          'api/src/db/migrations/001_init.sql',
          'api/src/routes/shipments.ts',
          'api/src/types.ts',
          'api/tests/helpers.ts',
          'api/tests/setup.ts',
          'api/tests/shipments.test.ts',
          'api/vitest.config.ts'
        ]
      },
      {
        message: 'api: rate quotes across four carriers',
        ...SAM,
        daysAgo: 15,
        files: [
          'api/src/routes/rates.ts',
          'api/src/services/carriers.ts',
          'api/src/services/quote.ts',
          'api/tests/quote.test.ts',
          'api/tests/rates.test.ts',
          'docs/api.md'
        ]
      },
      {
        message: 'web: quote form, rate cards and shipment table',
        ...PRIYA,
        daysAgo: 12,
        files: [
          'web/public/favicon.svg',
          'web/src/App.tsx',
          'web/src/api.ts',
          'web/src/components/Header.tsx',
          'web/src/components/QuoteForm.tsx',
          'web/src/components/RateCard.tsx',
          'web/src/components/ShipmentTable.tsx',
          'web/src/components/StatusBadge.tsx',
          'web/src/format.test.ts',
          'web/src/format.ts',
          'web/src/hooks/useShipments.ts',
          'web/src/styles.css',
          'web/src/types.ts'
        ]
      },
      {
        message: 'api: bearer-token auth middleware',
        ...SAM,
        daysAgo: 8,
        files: ['api/src/app.ts', 'api/src/middleware/auth.ts', 'api/tests/auth.test.ts']
      },
      {
        message: 'ci: lint, typecheck and test on push',
        ...SAM,
        daysAgo: 6,
        files: ['.github/workflows/ci.yml']
      },
      {
        message: 'api: structured request logging with request ids',
        ...SAM,
        daysAgo: 3,
        files: [
          'api/package.json',
          'api/src/app.ts',
          'api/src/middleware/logger.ts',
          'api/src/routes/health.ts',
          'api/tests/health.test.ts'
        ]
      },
      {
        message: 'web: show carrier ETA in the shipment table',
        ...PRIYA,
        daysAgo: 1,
        files: ['README.md', 'web/src/components/ShipmentTable.tsx', 'web/src/format.ts']
      }
    ],
    dirty: ['api/src/routes/rates.ts', 'web/src/App.tsx'],
    headTexts: headOf('harbor'),
    otherBranches: [{ name: 'feat/webhook-signatures', behind: 2 }]
  },
  {
    root: DOTFILES_ROOT,
    branch: 'main',
    commits: [
      { message: 'profile: PSReadLine, aliases, branch in the window title', ...SAM, daysAgo: 120, files: ['profile.ps1'] },
      { message: 'git: rebase on pull, prune on fetch', ...SAM, daysAgo: 64, files: ['.gitconfig'] },
      { message: 'install.ps1: link files, back up what is there', ...SAM, daysAgo: 45, files: ['install.ps1'] },
      { message: 'readme', ...SAM, daysAgo: 30, files: ['README.md'] }
    ]
  }
]
