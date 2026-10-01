/** The visitor's two projects. Env values are plausible fakes — nothing here is a real secret. */
import type { Project } from '@shared/types'
import { machine } from './machine'

const DAY = 86_400_000
// Fixed so a reload doesn't shuffle "recently opened" order.
const T0 = Date.UTC(2026, 8, 27, 9, 30)

export const HARBOR_ID = 'proj-harbor'
export const DOTFILES_ID = 'proj-dotfiles'
export const HARBOR_ROOT = `${machine.projectsDir}\\harbor`
export const DOTFILES_ROOT = `${machine.projectsDir}\\dotfiles`

export const projects: Project[] = [
  {
    id: HARBOR_ID,
    name: 'Harbor',
    color: '#d8a956',
    rootDir: HARBOR_ROOT,
    description: 'Shipping-rates API and dashboard — TypeScript monorepo',
    defaultShell: 'powershell',
    defaultTemplate: 'quad',
    env: [
      { key: 'DATABASE_URL', value: 'postgres://harbor:harbor-local@localhost:5432/harbor' },
      { key: 'STRIPE_KEY', value: 'sk_test_demo_51HarborNotARealKey0000' },
      { key: 'PORT', value: '8787' }
    ],
    autoStart: [
      {
        id: 'as-harbor-web',
        command: 'npm run dev',
        paneIndex: 3,
        label: 'web dev server',
        delayMs: 0,
        enabled: true
      }
    ],
    createdAt: T0 - 41 * DAY,
    lastOpenedAt: T0
  },
  {
    id: DOTFILES_ID,
    name: 'dotfiles',
    color: '#5b9dd9',
    rootDir: DOTFILES_ROOT,
    description: 'PowerShell profile and git config',
    defaultShell: 'pwsh',
    defaultTemplate: 'single',
    env: [],
    autoStart: [],
    createdAt: T0 - 120 * DAY,
    lastOpenedAt: T0 - 6 * DAY
  }
]
