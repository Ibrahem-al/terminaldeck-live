/**
 * The workspace a first-time visitor sees: deck "Harbor" as a 2×2 grid with
 * Claude Code, Codex, the web dev server and a plain PowerShell (focused), and
 * deck "Review" with an editor beside a terminal. Same `SessionState` shape the
 * renderer saves (src/session.ts), so the real restore path builds it.
 */
import type { LayoutNode, SeedSessionState } from '../backend/contracts'
import { HARBOR_ID, HARBOR_ROOT } from './projects'

const split = (id: string, direction: 'row' | 'column', ratio: number, a: LayoutNode, b: LayoutNode): LayoutNode => ({
  type: 'split',
  id,
  direction,
  ratio,
  a,
  b
})
const pane = (paneId: string): LayoutNode => ({ type: 'pane', paneId })

export const PANE = {
  claude: 'p1',
  codex: 'p2',
  devServer: 'p3',
  shell: 'p4',
  editor: 'p5',
  reviewShell: 'p6'
} as const

export const DECK = { harbor: 'deck-harbor', review: 'deck-review' } as const

const API = `${HARBOR_ROOT}\\api`
const WEB = `${HARBOR_ROOT}\\web`

export const REVIEW_FILES = [`${API}\\src\\server.ts`, `${API}\\src\\routes\\rates.ts`]

/**
 * Review's full layout: the editor beside the terminal. The seed starts with
 * the terminal alone; host/lazyreview.ts adds the editor the first time the
 * deck is opened, so Monaco isn't downloaded for a deck nobody has looked at.
 */
export const REVIEW_LAYOUT: LayoutNode = split('s-review', 'row', 0.6, pane(PANE.editor), pane(PANE.reviewShell))

export const seedSession: SeedSessionState = {
  v: 1,
  tabs: [
    {
      id: DECK.harbor,
      name: 'Harbor',
      color: '#d8a956',
      projectId: HARBOR_ID,
      activePaneId: PANE.shell,
      layout: split(
        's-harbor-rows',
        'column',
        0.5,
        split('s-harbor-top', 'row', 0.5, pane(PANE.claude), pane(PANE.codex)),
        split('s-harbor-bottom', 'row', 0.5, pane(PANE.devServer), pane(PANE.shell))
      )
    },
    {
      id: DECK.review,
      name: 'Review',
      color: '#5b9dd9',
      projectId: HARBOR_ID,
      activePaneId: PANE.reviewShell,
      layout: pane(PANE.reviewShell)
    }
  ],
  panes: {
    [PANE.claude]: { id: PANE.claude, kind: 'terminal', name: 'Terminal 1', shell: 'powershell', cwd: HARBOR_ROOT, autoRun: 'claude' },
    [PANE.codex]: { id: PANE.codex, kind: 'terminal', name: 'Terminal 2', shell: 'powershell', cwd: HARBOR_ROOT, autoRun: 'codex' },
    [PANE.devServer]: { id: PANE.devServer, kind: 'terminal', name: 'Terminal 3', shell: 'powershell', cwd: WEB, autoRun: 'npm run dev' },
    [PANE.shell]: { id: PANE.shell, kind: 'terminal', name: 'Terminal 4', shell: 'powershell', cwd: HARBOR_ROOT },
    [PANE.reviewShell]: { id: PANE.reviewShell, kind: 'terminal', name: 'Terminal 5', shell: 'powershell', cwd: HARBOR_ROOT }
  },
  activeTabId: DECK.harbor,
  spawnDefaults: { cwd: HARBOR_ROOT, shell: 'powershell' },
  activeProjectId: HARBOR_ID,
  explorerRoot: HARBOR_ROOT,
  editorFiles: {},
  editorActive: {}
}
