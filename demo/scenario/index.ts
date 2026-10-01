/** Everything the simulated machine starts with, in one object. */
import type { Scenario } from '../backend/contracts'
import { repos, trees } from './files'
import { machine } from './machine'
import { HARBOR_ID, projects } from './projects'
import { PANE, seedSession } from './session'

export const scenario: Scenario = {
  machine,
  projects,
  session: seedSession,
  settings: {
    general: { startup: 'restore', defaultProjectId: HARBOR_ID, defaultTemplate: 'quad' },
    notch: { enabled: true }
  },
  trees,
  repos,
  // Triggers match the pane's own output: the echoed prompt, a status row, a
  // tool call. Claude's welcome placeholder mentions rate limiting too, which
  // is why none of them is a bare keyword.
  smartNames: {
    [PANE.claude]: [
      { name: 'Adding API Rate Limiting', when: /^>\s.*rate.?limit|Creating the rate-limit middleware|Wiring it into the app|Rate limiting is in place|replied to message #/im },
      // Only when asked for tests outright. During the tour the name holds steady: the notch
      // titles its "finished a turn" with the pane's name at that moment, and a later rename would split them.
      { name: 'Writing Rate Limiter Tests', when: /^>\s.*\btests?\b.*rate.?limit/im },
      { name: 'Rate Limiter Follow-ups', when: /Sweeping stale buckets|Trusting the proxy/ }
    ],
    [PANE.codex]: [{ name: 'Reviewing Rate Limiter', when: /review the rate limiter|Reviewing rate limiter/i }],
    [PANE.devServer]: [{ name: 'Web Dev Server', when: /VITE v\d|localhost:5173/ }],
    [PANE.shell]: [{ name: 'Checking Git Status', when: /git status/ }]
  }
}

export { machine, projects, seedSession }
export * from './projects'
export * from './session'
