/**
 * "Review my changes" and "commit this". Both start from `git status`, which
 * lists untracked files too, so a file an agent just created counts as a
 * change here exactly as it does for `git add -A`.
 */
import type { GitFileStatus } from '../contracts'
import type { AgentName, BrainInput, Plan, Step } from './brain'
import { changeKind, joinNames, lineCount, say, think, then, workingChanges } from './brain-util'
import { gitAdd, gitCommit, gitDiffStat, gitDiffText, gitStatus, safeRepo } from './canned'
import type { World } from './world'

function statusRun(world: World): Step {
  return { t: 'run', command: 'git status --short', description: 'Show working tree status', fallback: () => gitStatus(world), safe: true }
}

function diffStatRun(world: World): Step {
  return { t: 'run', command: 'git diff --stat', description: 'Summarise the changes to tracked files', fallback: () => gitDiffStat(world), safe: true }
}

export function reviewPlan({ world }: BrainInput): Plan {
  return {
    title: 'Review uncommitted changes',
    steps: [
      think(1000),
      statusRun(world),
      diffStatRun(world),
      then(() => {
        const changes = workingChanges(world)
        if (changes.length === 0) return [say('The working tree is clean. There are no uncommitted changes to review.')]
        const paths = changes.map((c) => c.path)
        return [
          { t: 'read', paths: paths.filter((p) => world.exists(p)).slice(0, 3) },
          think(2400, 'Reviewing the diff'),
          say(() => reviewText(world, changes))
        ]
      })
    ],
    offer: {
      what: 'commit the reviewed changes',
      accept: (input) => commitPlan(input)
    }
  }
}

function reviewText(world: World, changes: GitFileStatus[]): string {
  const text = gitDiffText(world)
  const untracked = changes.filter((c) => c.index === '?')
  const lines = [`${changes.length} file${changes.length === 1 ? '' : 's'} changed:`, '']
  for (const c of changes) {
    const kind = changeKind(c)
    const size = kind === 'new file' ? `, ${lineCount(world.read(c.path))} lines` : ''
    lines.push(`- \`${c.path}\` (${kind}${c.index === '?' ? ', untracked' : ''}${size})`)
  }
  const paths = changes.map((c) => c.path)
  const newText = untracked.map((c) => world.read(c.path) ?? '').join('\n')
  const todo = /TODO|FIXME|console\.log/.test(text + newText)
  const anyTests = paths.some((p) => /\.test\./.test(p))
  const touchesSrc = paths.some((p) => /\/src\//.test(p) && !/\.test\./.test(p))
  lines.push('')
  if (untracked.length) lines.push(`- ${untracked.length === 1 ? 'One file is' : `${untracked.length} files are`} untracked, so \`git diff\` doesn't show ${untracked.length === 1 ? 'it' : 'them'}. \`git add -A\` will pick ${untracked.length === 1 ? 'it' : 'them'} up.`)
  if (todo) lines.push('- There are leftover `TODO`/`console.log` lines in the changes. Worth cleaning up before committing.')
  if (touchesSrc && !anyTests) lines.push('- Source changed but no tests did. Consider adding a test for the new behaviour.')
  if (paths.some((p) => p.startsWith('web/'))) lines.push('- The web changes are UI-only; give them a quick look in the browser (`npm run dev -w web`).')
  lines.push('', 'Nothing looks risky. Want me to commit these?')
  return lines.join('\n')
}

/** What one changed file is about, in the repo's `area: summary` style. */
const SUBJECTS: Array<[RegExp, string]> = [
  [/rateLimit/i, 'add fixed-window rate limiting middleware'],
  [/routes\/shipments\.ts$/, 'report hasMore when listing shipments'],
  [/routes\/rates\.ts$/, 'filter quotes by carrier'],
  [/routes\/health\.ts$/, 'add a /health/ready readiness probe'],
  [/web\/src\/csv\.ts$/, 'export shipments as CSV'],
  [/web\/src\/App\.tsx$/, 'filter shipments by status'],
  [/web\/src\/format\.ts$/, 'show whole kilos without a trailing .0'],
  [/styles\.css$/, 'follow the system light/dark preference']
]

/** Files another change in the same commit already explains (the app that mounts a new module). */
function wiredIn(path: string, all: string[]): boolean {
  return (/App\.tsx$/.test(path) && all.some((p) => /csv\.ts$/.test(p))) || (/app\.ts$/.test(path) && all.some((p) => /rateLimit/i.test(p)))
}

/** A commit subject in the repo's own `area: summary` style, naming every change it holds. */
function commitMessage(paths: string[], world: World): string {
  const src = paths.filter((p) => !/\.test\.tsx?$/.test(p))
  if (src.length === 0 && paths.length > 0) {
    const stems = paths.map((p) => (p.split('/').pop() ?? p).replace(/(\.exports)?\.test\.tsx?$/, ''))
    return `${paths[0].split('/')[0]}: add tests for ${[...new Set(stems)].join(', ')}`
  }
  const byArea = new Map<string, string[]>()
  for (const p of src) {
    const area = p.split('/')[0] === 'web' ? 'web' : p.split('/')[0] === 'api' ? 'api' : 'chore'
    if (wiredIn(p, src)) continue
    let subject = SUBJECTS.find(([re]) => re.test(p))?.[1] ?? null
    if (/routes\/shipments\.ts$/.test(p) && /ShipmentId/.test(world.read(p) ?? '')) subject = 'validate shipment references and ids'
    subject ??= area === 'web' ? 'update dashboard components' : area === 'api' ? 'update routes and middleware' : `update ${p.split('/').pop()}`
    const list = byArea.get(area) ?? []
    if (!list.includes(subject)) list.push(subject)
    byArea.set(area, list)
  }
  const parts = [...byArea].map(([area, subjects]) => `${area}: ${subjects.join(', ')}`)
  return parts.length ? parts.join('; ') : `chore: update ${paths.length} files`
}

/** "commit the shipments change": the changed files the prompt singles out, or null for all of them. */
function scopedPaths(prompt: string, paths: string[]): string[] | null {
  const lower = prompt.toLowerCase()
  if (/\b(all|everything|every change|all changes)\b/.test(lower)) return null
  const words = (lower.match(/[a-z]{3,}/g) ?? []).filter((w) => !/^(commit|the|this|that|change|changes|file|files|and|with|please|message|push|now|just|only)$/.test(w))
  const alias: Record<string, RegExp> = {
    'rate': /rateLimit/i,
    'limiter': /rateLimit/i,
    'filter': /App\.tsx$|routes\/rates\.ts$/,
    'carrier': /routes\/rates\.ts$/,
    'quote': /routes\/rates\.ts$/,
    'status': /App\.tsx$/,
    'dashboard': /^web\//,
    'web': /^web\//,
    'api': /^api\//,
    'readiness': /health/,
    'csv': /csv|App\.tsx$/,
    'weight': /format/,
    'theme': /styles\.css$/
  }
  const picked = paths.filter((p) => words.some((w) => (alias[w] ? alias[w].test(p) : p.toLowerCase().includes(w))))
  return picked.length > 0 && picked.length < paths.length ? picked : null
}

const TRAILER: Record<AgentName, string | null> = {
  claude: 'Co-Authored-By: Claude <noreply@anthropic.com>',
  codex: null,
  gemini: null,
  other: null
}

export function commitPlan({ world, agent, prompt }: BrainInput): Plan {
  return {
    title: 'Commit changes',
    steps: [
      think(900),
      statusRun(world),
      diffStatRun(world),
      then(() => {
        const repo = safeRepo(world)
        if (!repo) return [say("This folder isn't a git repository, so there's nothing to commit.")]
        const changes = workingChanges(world)
        if (changes.length === 0) return [say('Nothing to commit. The working tree is clean.')]
        const all = changes.map((c) => c.path)
        const scoped = scopedPaths(prompt, all)
        const paths = scoped ?? all
        const msg = commitMessage(paths, world)
        const trailer = TRAILER[agent]
        const command = trailer ? `git commit -m "${msg}" -m "${trailer}"` : `git commit -m "${msg}"`
        const add = scoped ? `git add ${scoped.join(' ')}` : 'git add -A'
        const left = scoped ? all.filter((p) => !scoped.includes(p)) : []
        return [
          think(1200, 'Writing the commit message'),
          scoped
            ? { t: 'run', command: add, description: `Stage only ${scoped.length === 1 ? 'that file' : 'those files'}`, fallback: () => gitAdd(world, scoped) }
            : { t: 'run', command: add, description: 'Stage all changes, untracked files included', fallback: () => gitAdd(world) },
          { t: 'run', command, description: 'Commit the staged changes', fallback: () => gitCommit(world, trailer ? `${msg}\n\n${trailer}` : msg) },
          say((r) => {
            if (r.declined.length) return 'OK, I left everything uncommitted.'
            const last = r.runs[r.runs.length - 1]
            if (!last || last.code !== 0) return `The commit didn't go through: ${last?.output ?? 'unknown error'}`
            const head = last.output.split('\n')[0] ?? ''
            const counted = /(\d+) files? changed/.exec(last.output)?.[1] ?? String(paths.length)
            const rest = left.length ? ` ${joinNames(left.map((p) => `\`${p}\``))} ${left.length === 1 ? 'is' : 'are'} still uncommitted.` : ''
            return `Committed ${counted} file${counted === '1' ? '' : 's'}: \`${head}\`.${rest} It isn't pushed yet; run \`git push\` when you're ready.`
          })
        ]
      })
    ]
  }
}
