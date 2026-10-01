/**
 * `git` over the repo model (vfs.git or the shell's fallback): status, log,
 * diff, branch, add, commit, push, pull, checkout/switch — with git 2.51's
 * wording and colours. No pager: output goes straight to the terminal.
 */
import type { GitFileStatus, GitRepo } from '../../contracts'
import { CRLF } from '../../util/ansi'
import { hunks, diffLines } from '../../util/diff'
import type { CommandFn, Ctx } from './context'
import { pace, startup } from './context'

const C = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  boldCyan: '\x1b[1;36m',
  boldGreen: '\x1b[1;32m',
  boldRed: '\x1b[1;31m',
  reset: '\x1b[m'
}

/** Repo-relative (forward slashes) → relative to the cwd, as git prints paths. */
function shown(ctx: Ctx, repo: GitRepo, rel: string): string {
  const vfs = ctx.backend.vfs
  const abs = vfs.join(repo.root, rel)
  return vfs.relative(ctx.sh.cwd, abs).replace(/\\/g, '/')
}

/** `shown` for an entry that may be a collapsed `dir/`. */
function shownEntry(ctx: Ctx, repo: GitRepo, rel: string): string {
  return rel.endsWith('/') ? `${shown(ctx, repo, rel.slice(0, -1))}/` : shown(ctx, repo, rel)
}

function notARepo(ctx: Ctx): number {
  ctx.print('fatal: not a git repository (or any of the parent directories): .git')
  return 128
}

const LABEL: Record<string, string> = { M: 'modified:   ', A: 'new file:   ', D: 'deleted:    ', R: 'renamed:    ' }

/** The upstream as `origin/main` (models may report the remote or the tracking ref). */
function trackingRef(repo: GitRepo, name: string): string {
  return name.includes('/') ? name : `${name}/${repo.currentBranch()}`
}

const remoteName = (name: string): string => name.split('/')[0]

function branchLine(repo: GitRepo): string[] {
  const up = repo.upstream()
  const lines = [`On branch ${repo.currentBranch()}`]
  if (!up) return lines
  const ref = `'${trackingRef(repo, up.name)}'`
  if (up.ahead > 0 && up.behind === 0) {
    lines.push(`Your branch is ahead of ${ref} by ${up.ahead} commit${up.ahead === 1 ? '' : 's'}.`, '  (use "git push" to publish your local commits)')
  } else if (up.behind > 0 && up.ahead === 0) {
    lines.push(`Your branch is behind ${ref} by ${up.behind} commit${up.behind === 1 ? '' : 's'}, and can be fast-forwarded.`, '  (use "git pull" to update your local branch)')
  } else lines.push(`Your branch is up to date with ${ref}.`)
  return lines
}

/**
 * Untracked paths as git lists them: a folder holding no tracked file at all
 * is one `dir/` entry, not every file inside it.
 */
function untrackedEntries(repo: GitRepo, untracked: GitFileStatus[]): string[] {
  const tracked = repo.tracked?.()
  if (!tracked) return untracked.map((f) => f.path)
  const trackedDirs = new Set<string>()
  for (const t of tracked) {
    const parts = t.toLowerCase().split('/')
    for (let i = 1; i < parts.length; i++) trackedDirs.add(parts.slice(0, i).join('/'))
  }
  const out = new Set<string>()
  for (const f of untracked) {
    const parts = f.path.split('/')
    let entry = f.path
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/')
      if (!trackedDirs.has(dir.toLowerCase())) {
        entry = `${dir}/`
        break
      }
    }
    out.add(entry)
  }
  return [...out].sort()
}

function status(ctx: Ctx, repo: GitRepo, args: string[]): number {
  const st = repo.status()
  const untracked = st.filter((f) => f.index === '?')
  if (args.includes('-s') || args.includes('--short') || args.includes('--porcelain')) {
    const colour = !args.includes('--porcelain') && ctx.tty
    // Tracked changes first, then the `??` entries.
    const out = st
      .filter((f) => f.index !== '?')
      .map((f) => {
        const x = f.index === ' ' ? ' ' : `${colour ? C.green : ''}${f.index}${colour ? C.reset : ''}`
        const y = f.worktree === ' ' ? ' ' : `${colour ? C.red : ''}${f.worktree}${colour ? C.reset : ''}`
        return `${x}${y} ${shown(ctx, repo, f.path)}`
      })
    for (const u of untrackedEntries(repo, untracked)) out.push(`${colour ? C.red : ''}??${colour ? C.reset : ''} ${shownEntry(ctx, repo, u)}`)
    if (out.length) ctx.print(...out)
    return 0
  }
  const staged = st.filter((f) => f.index !== ' ' && f.index !== '?')
  const unstaged = st.filter((f) => f.worktree !== ' ' && f.worktree !== '?')
  const lines = branchLine(repo)
  // git leaves a blank line only after "Your branch is …"; with no upstream the sections follow directly.
  if (lines.length > 1) lines.push('')
  const entry = (colour: string, f: GitFileStatus, code: string): string =>
    `\t${colour}${LABEL[code] ?? 'modified:   '}${shown(ctx, repo, f.path)}${C.reset}`
  if (staged.length) {
    lines.push('Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)')
    for (const f of staged) lines.push(entry(C.green, f, f.index))
    lines.push('')
  }
  if (unstaged.length) {
    lines.push(
      'Changes not staged for commit:',
      '  (use "git add' + (unstaged.some((f) => f.worktree === 'D') ? '/rm' : '') + ' <file>..." to update what will be committed)',
      '  (use "git restore <file>..." to discard changes in working directory)'
    )
    for (const f of unstaged) lines.push(entry(C.red, f, f.worktree))
    lines.push('')
  }
  if (untracked.length) {
    lines.push('Untracked files:', '  (use "git add <file>..." to include in what will be committed)')
    for (const u of untrackedEntries(repo, untracked)) lines.push(`\t${C.red}${shownEntry(ctx, repo, u)}${C.reset}`)
    lines.push('')
  }
  if (!staged.length && !unstaged.length && !untracked.length) {
    lines.push('nothing to commit, working tree clean')
  } else if (!staged.length) {
    lines.push(unstaged.length ? 'no changes added to commit (use "git add" and/or "git commit -a")' : 'nothing added to commit but untracked files present (use "git add" to track)')
  }
  ctx.print(...lines)
  return 0
}

/** `(HEAD -> main, origin/main)`: HEAD on the newest commit, the remote-tracking ref wherever the remote is. */
function decorations(repo: GitRepo, index: number): string {
  const up = repo.upstream()
  const parts: string[] = []
  if (index === 0) parts.push(`${C.boldCyan}HEAD -> ${C.boldGreen}${repo.currentBranch()}${C.reset}`)
  if (up && index === up.ahead) parts.push(`${C.boldRed}${trackingRef(repo, up.name)}${C.reset}`)
  if (!parts.length) return ''
  return ` ${C.yellow}(${C.reset}${parts.join(`${C.yellow}, ${C.reset}`)}${C.yellow})${C.reset}`
}

/**
 * Git's pager, `less -FRX`: output that fits is just printed; anything taller
 * shows a screen at a time — space or f for the next page, Enter or j for a
 * line, q to quit — and stays on screen afterwards.
 */
async function page(ctx: Ctx, lines: string[]): Promise<void> {
  const height = Math.max(3, ctx.rows - 1)
  if (!ctx.interactive || lines.length <= height) {
    await pace(ctx, lines.join(CRLF) + (lines.length ? CRLF : ''))
    return
  }
  let at = 0
  const show = (n: number): void => {
    const chunk = lines.slice(at, at + n)
    at += chunk.length
    ctx.write(chunk.map((l) => l + CRLF).join(''))
  }
  const prompt = (): void => ctx.write(at >= lines.length ? '\x1b[7m(END)\x1b[27m' : ':')
  show(height)
  prompt()
  await new Promise<void>((resolve) => {
    let done = false
    const quit = (): void => {
      if (done) return
      done = true
      ctx.write('\r\x1b[K')
      ctx.onInput(null)
      resolve()
    }
    ctx.defer(quit)
    ctx.onInput(
      (data) => {
        const keys = data.match(/\x1b\[[0-9;]*[A-Za-z~]|[\s\S]/g) ?? []
        for (const k of keys) {
          if (k === 'q' || k === 'Q' || k === '\x03') return quit()
          const n = k === ' ' || k === 'f' || k === '\x1b[6~' ? height : k === '\r' || k === 'j' || k === '\x1b[B' ? 1 : 0
          if (n === 0 || at >= lines.length) continue
          ctx.write('\r\x1b[K')
          show(n)
          prompt()
        }
      },
      { interrupt: true }
    )
  })
}

/** The `@@ … @@ <context>` of a hunk: the nearest line above it that starts in column 0, like git's default funcname. */
function hunkContext(oldText: string | null, oldStart: number): string {
  if (!oldText) return ''
  const lines = oldText.split('\n')
  for (let i = Math.min(lines.length, oldStart - 1) - 1; i >= 0; i--) {
    if (/^[A-Za-z_$]/.test(lines[i])) return ` ${lines[i].trimEnd().slice(0, 80)}`
  }
  return ''
}

/** A commit message's first line (`--oneline`), and the whole message indented four spaces (`git log`, `git show`). */
const subject = (message: string): string => message.split('\n')[0]
const body = (message: string): string[] => message.split('\n').map((l) => (l ? `    ${l}` : ''))

function gitDate(ms: number): string {
  const d = new Date(ms)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const off = -d.getTimezoneOffset()
  const tz = `${off >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}${String(Math.abs(off) % 60).padStart(2, '0')}`
  const t = d.toTimeString().slice(0, 8)
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${t} ${d.getFullYear()} ${tz}`
}

async function log(ctx: Ctx, repo: GitRepo, args: string[]): Promise<number> {
  const nArg = args.find((a) => /^-\d+$/.test(a)) ?? (args.includes('-n') ? `-${args[args.indexOf('-n') + 1]}` : undefined)
  const limit = nArg ? Number(nArg.slice(1)) : undefined
  const commits = repo.log(limit)
  const oneline = args.includes('--oneline') || args.some((a) => a.startsWith('--pretty=oneline') || a.startsWith('--format=oneline'))
  const lines: string[] = []
  commits.forEach((c, i) => {
    if (oneline) {
      lines.push(`${C.yellow}${c.short}${C.reset}${decorations(repo, i)} ${subject(c.message)}`)
      return
    }
    lines.push(
      `${C.yellow}commit ${c.hash}${C.reset}${decorations(repo, i)}`,
      `Author: ${c.author} <${c.email}>`,
      `Date:   ${gitDate(c.date)}`,
      '',
      ...body(c.message)
    )
    if (i < commits.length - 1) lines.push('')
  })
  await page(ctx, lines)
  return 0
}

async function diff(ctx: Ctx, repo: GitRepo, args: string[]): Promise<number> {
  const staged = args.includes('--staged') || args.includes('--cached')
  const stat = args.includes('--stat')
  const nameOnly = args.includes('--name-only')
  const paths = args
    .filter((a) => !a.startsWith('-'))
    .map((p) => {
      const vfs = ctx.backend.vfs
      return vfs.relative(repo.root, vfs.resolve(ctx.sh.cwd, p)).replace(/\\/g, '/')
    })
  const files = repo.diff({ staged, paths: paths.length ? paths : undefined })
  if (nameOnly) {
    if (files.length) ctx.print(...files.map((f) => shown(ctx, repo, f.path)))
    return 0
  }
  if (stat) {
    let ins = 0
    let del = 0
    const rows = files.map((f) => {
      const ops = diffLines(f.oldText ?? '', f.newText ?? '')
      const a = ops.filter((o) => o.op === 'insert').length
      const d = ops.filter((o) => o.op === 'delete').length
      ins += a
      del += d
      return { name: f.path, a, d }
    })
    const w = Math.max(...rows.map((r) => r.name.length), 0)
    const nw = Math.max(...rows.map((r) => String(r.a + r.d).length), 1)
    // No changes: git prints nothing at all, not "0 files changed".
    if (!files.length) return 0
    const lines = rows.map((r) => ` ${r.name.padEnd(w)} | ${String(r.a + r.d).padStart(nw)} ${C.green}${'+'.repeat(Math.min(r.a, 40))}${C.red}${'-'.repeat(Math.min(r.d, 40))}${C.reset}`)
    lines.push(` ${files.length} file${files.length === 1 ? '' : 's'} changed, ${ins} insertion${ins === 1 ? '' : 's'}(+), ${del} deletion${del === 1 ? '' : 's'}(-)`)
    ctx.print(...lines)
    return 0
  }
  const out: string[] = []
  for (const f of files) {
    const idx = `${hashish(f.oldText)}..${hashish(f.newText)}`
    out.push(`${C.bold}diff --git a/${f.path} b/${f.path}${C.reset}`)
    if (f.oldText === null) out.push(`${C.bold}new file mode 100644${C.reset}`, `${C.bold}index 0000000..${hashish(f.newText)}${C.reset}`)
    else if (f.newText === null) out.push(`${C.bold}deleted file mode 100644${C.reset}`, `${C.bold}index ${hashish(f.oldText)}..0000000${C.reset}`)
    else out.push(`${C.bold}index ${idx} 100644${C.reset}`)
    out.push(`${C.bold}--- ${f.oldText === null ? '/dev/null' : `a/${f.path}`}${C.reset}`, `${C.bold}+++ ${f.newText === null ? '/dev/null' : `b/${f.path}`}${C.reset}`)
    for (const h of hunks(diffLines(f.oldText ?? '', f.newText ?? ''))) {
      out.push(`${C.cyan}@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@${C.reset}${hunkContext(f.oldText, h.oldStart)}`)
      for (const l of h.lines) {
        if (l[0] === '+') out.push(`${C.green}${l}${C.reset}`)
        else if (l[0] === '-') out.push(`${C.red}${l}${C.reset}`)
        else out.push(l)
      }
    }
  }
  await page(ctx, out)
  return 0
}

function hashish(text: string | null): string {
  if (text === null) return '0000000'
  let h = 5381
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0').slice(0, 7)
}

function branch(ctx: Ctx, repo: GitRepo, args: string[]): number {
  const name = args.find((a) => !a.startsWith('-'))
  if (name && !args.includes('-d') && !args.includes('-D')) {
    if (repo.branches().includes(name)) {
      ctx.print(`fatal: a branch named '${name}' already exists`)
      return 128
    }
    const cur = repo.currentBranch()
    repo.checkout(name, true)
    repo.checkout(cur)
    return 0
  }
  const lines = repo.branches().map((b) => (b === repo.currentBranch() ? `* ${C.green}${b}${C.reset}` : `  ${b}`))
  if (args.includes('-a') || args.includes('-r')) {
    const up = repo.upstream()
    if (up) lines.push(`  ${C.red}remotes/${remoteName(up.name)}/HEAD${C.reset} -> ${remoteName(up.name)}/main`, `  ${C.red}remotes/${remoteName(up.name)}/main${C.reset}`)
  }
  ctx.print(...lines)
  return 0
}

function add(ctx: Ctx, repo: GitRepo, args: string[]): number {
  const vfs = ctx.backend.vfs
  const specs = args.filter((a) => !a.startsWith('-') || a === '-A')
  if (specs.length === 0 && !args.includes('-A') && !args.includes('--all')) {
    ctx.print('Nothing specified, nothing added.', `${C.yellow}hint: Maybe you wanted to say 'git add .'?${C.reset}`, `${C.yellow}hint: Disable this message with "git config set advice.addEmptyPathspec false"${C.reset}`)
    return 0
  }
  const rel = specs.map((s) => {
    if (s === '-A' || s === '--all') return s
    const abs = vfs.resolve(ctx.sh.cwd, s)
    const r = vfs.relative(repo.root, abs).replace(/\\/g, '/')
    return r === '' ? '.' : r
  })
  for (const s of specs) {
    if (s === '.' || s === '-A' || s.includes('*')) continue
    const abs = vfs.resolve(ctx.sh.cwd, s)
    const tracked = repo.status().some((f) => vfs.join(repo.root, f.path).toLowerCase().startsWith(abs.toLowerCase()))
    if (!vfs.exists(abs) && !tracked) {
      ctx.print(`fatal: pathspec '${s}' did not match any files`)
      return 128
    }
  }
  repo.add(args.includes('-A') || args.includes('--all') ? ['-A'] : rel)
  return 0
}

function commit(ctx: Ctx, repo: GitRepo, args: string[]): number {
  if (args.includes('-a') || args.some((a) => /^-a[m]$/.test(a))) repo.add(['.'])
  // Every -m is a paragraph (`-m "subject" -m "Co-Authored-By: …"`).
  const paragraphs: string[] = []
  args.forEach((a, i) => {
    if ((a === '-m' || a === '-am' || a === '--message') && args[i + 1] !== undefined) paragraphs.push(args[i + 1])
    else if (a.startsWith('--message=')) paragraphs.push(a.slice(10))
  })
  const message = paragraphs.length ? paragraphs.join('\n\n') : undefined
  if (message === undefined) {
    ctx.print('hint: Waiting for your editor to close the file... ', 'error: There was a problem with the editor \'vi\'.', 'Please supply the message using either -m or -F option.')
    return 1
  }
  const pending = repo.status()
  const allowEmpty = args.includes('--allow-empty')
  if (!pending.some((f) => f.index !== ' ' && f.index !== '?') && !allowEmpty) {
    status(ctx, repo, [])
    return 1
  }
  let ins = 0
  let del = 0
  for (const f of repo.diff({ staged: true })) {
    for (const o of diffLines(f.oldText ?? '', f.newText ?? '')) {
      if (o.op === 'insert') ins++
      else if (o.op === 'delete') del++
    }
  }
  let c
  try {
    c = repo.commit(message, { allowEmpty })
  } catch (e) {
    ctx.print(e instanceof Error ? e.message : String(e))
    return 1
  }
  const staged = pending.filter((f) => f.index !== ' ' && f.index !== '?')
  const counted = staged.length
  const lines = [
    `[${repo.currentBranch()} ${c.short}] ${message.split('\n')[0]}`,
    ` ${counted} file${counted === 1 ? '' : 's'} changed, ${ins} insertion${ins === 1 ? '' : 's'}(+)${del ? `, ${del} deletion${del === 1 ? '' : 's'}(-)` : ''}`
  ]
  for (const f of staged) {
    if (f.index === 'A') lines.push(` create mode 100644 ${f.path}`)
    if (f.index === 'D') lines.push(` delete mode 100644 ${f.path}`)
  }
  ctx.print(...lines)
  return 0
}

async function push(ctx: Ctx, repo: GitRepo, args: string[]): Promise<number> {
  const setUpstream = args.includes('-u') || args.includes('--set-upstream')
  const [remoteArg, refArg] = args.filter((a) => !a.startsWith('-'))
  const branchName = repo.currentBranch()
  const seed = ctx.backend.scenario.repos.find((r) => ctx.backend.vfs.key(r.root) === ctx.backend.vfs.key(repo.root))
  const remote = seed?.remote ?? null
  if (!remote) {
    ctx.print('fatal: No configured push destination.', 'Either specify the URL from the command-line or configure a remote repository using', '', '    git remote add <name> <url>', '', 'and then push using the remote name', '', '    git push <name>', '')
    return 128
  }
  if (remoteArg && remoteArg !== remote.name) {
    ctx.print(`fatal: '${remoteArg}' does not appear to be a git repository`, 'fatal: Could not read from remote repository.', '', 'Please make sure you have the correct access rights', 'and the repository exists.')
    return 128
  }
  const ref = (refArg ?? branchName).replace(/^HEAD$/, branchName)
  if (ref !== branchName) {
    ctx.print(`error: src refspec ${ref} does not match any`, `error: failed to push some refs to '${remote.url}'`)
    return 1
  }
  const up = repo.upstream()
  // A branch the remote has never seen: plain `git push` refuses; naming the remote (with or without -u) creates it.
  if (!up && !remoteArg) {
    ctx.print(`fatal: The current branch ${branchName} has no upstream branch.`, 'To push the current branch and set the remote as upstream, use', '', `    git push --set-upstream ${remote.name} ${branchName}`, '', 'To have this happen automatically for branches without a tracking', "upstream, see 'push.autoSetupRemote' in 'git help config'.", '')
    return 128
  }
  const newBranch = !up
  const ahead = up ? up.ahead : Math.max(1, repo.log().length)
  if (up && up.ahead === 0) {
    await ctx.sleep(700)
    ctx.print('Everything up-to-date')
    if (setUpstream) ctx.print(`branch '${branchName}' set up to track '${remote.name}/${branchName}'.`)
    return 0
  }
  const count = newBranch ? Math.min(ahead, 3) : ahead
  const objects = 3 + count * 3
  await ctx.sleep(600)
  const steps = [
    `Enumerating objects: ${objects}, done.`,
    `Counting objects: 100% (${objects}/${objects}), done.`,
    'Delta compression using up to 16 threads',
    `Compressing objects: 100% (${objects - 2}/${objects - 2}), done.`,
    `Writing objects: 100% (${objects - 2}/${objects - 2}), ${(0.8 + count * 0.4).toFixed(2)} KiB | ${(0.8 + count * 0.4).toFixed(2)} MiB/s, done.`,
    `Total ${objects - 2} (delta ${count + 1}), reused 0 (delta 0), pack-reused 0 (from 0)`,
    `remote: Resolving deltas: 100% (${count + 1}/${count + 1}), completed with ${count + 2} local objects.`
  ]
  for (const s of steps) {
    ctx.print(s)
    await ctx.sleep(90 + Math.random() * 120)
  }
  const from = up ? (repo.log(up.ahead + 1)[up.ahead]?.short ?? '0000000') : ''
  repo.push()
  const to = repo.log(1)[0]?.short ?? from
  const web = remote.url.replace(/\.git$/, '')
  if (newBranch) {
    ctx.print(
      'remote: ',
      `remote: Create a pull request for '${branchName}' on GitHub by visiting:`,
      `remote:      ${web}/pull/new/${branchName}`,
      'remote: ',
      `To ${remote.url}`,
      ` * [new branch]      ${branchName} -> ${branchName}`
    )
  } else ctx.print(`To ${remote.url}`, `   ${from}..${to}  ${branchName} -> ${branchName}`)
  if (setUpstream) ctx.print(`branch '${branchName}' set up to track '${remote.name}/${branchName}'.`)
  else if (newBranch) repo.forgetUpstream?.()
  return 0
}

function checkout(ctx: Ctx, repo: GitRepo, args: string[], sub: string): number {
  const create = args.includes('-b') || args.includes('-c') || args.includes('-B')
  const name = args.find((a) => !a.startsWith('-'))
  if (!name) {
    ctx.print(sub === 'switch' ? 'fatal: missing branch or commit argument' : "Your branch is up to date with 'origin/main'.")
    return sub === 'switch' ? 128 : 0
  }
  try {
    if (!create && name === repo.currentBranch()) {
      ctx.print(`Already on '${name}'`)
      return 0
    }
    repo.checkout(name, create)
  } catch {
    ctx.print(
      create
        ? `fatal: a branch named '${name}' already exists`
        : sub === 'switch'
          ? `fatal: invalid reference: ${name}`
          : `error: pathspec '${name}' did not match any file(s) known to git`
    )
    return create || sub === 'switch' ? 128 : 1
  }
  const dirty = repo.status().filter((f) => f.worktree !== ' ' && f.worktree !== '?')
  ctx.print(...dirty.map((f) => `M\t${f.path}`), create ? `Switched to a new branch '${name}'` : `Switched to branch '${name}'`)
  if (!create && name === 'main' && repo.upstream()) ctx.print(...branchLine(repo).slice(1))
  return 0
}

const HELP = [
  'usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]',
  '           [--exec-path[=<path>]] [--html-path] [--man-path] [--info-path]',
  '           [-p | --paginate | -P | --no-pager] [--no-replace-objects] [--no-lazy-fetch]',
  '           <command> [<args>]',
  '',
  'These are common Git commands used in various situations:',
  '',
  'start a working area (see also: git help tutorial)',
  '   clone     Clone a repository into a new directory',
  '   init      Create an empty Git repository or reinitialize an existing one',
  '',
  'work on the current change (see also: git help everyday)',
  '   add       Add file contents to the index',
  '   restore   Restore working tree files',
  '',
  'examine the history and state (see also: git help revisions)',
  '   diff      Show changes between commits, commit and working tree, etc',
  '   log       Show commit logs',
  '   status    Show the working tree status',
  '',
  'grow, mark and tweak your common history',
  '   branch    List, create, or delete branches',
  '   commit    Record changes to the repository',
  '   switch    Switch branches',
  '',
  'collaborate (see also: git help workflows)',
  '   pull      Fetch from and integrate with another repository or a local branch',
  '   push      Update remote refs along with associated objects'
]

export const git: CommandFn = async (ctx) => {
  const args = ctx.argv.filter((a) => a !== '--no-pager' && a !== '-P')
  const sub = args[0]
  if (!sub || sub === '-h' || sub === '--help' || sub === 'help') {
    ctx.print(...HELP)
    return sub ? 0 : 1
  }
  if (sub === '--version' || sub === 'version' || sub === '-v') {
    ctx.print(`git version ${ctx.backend.scenario.machine.versions.git ?? '2.51.0.windows.1'}`)
    return 0
  }
  await startup(ctx, 40)
  const repo = ctx.svc.git(ctx.sh.cwd)
  const rest = args.slice(1)
  if (sub === 'init') {
    ctx.print(repo ? `Reinitialized existing Git repository in ${ctx.backend.vfs.toPosix(repo.root)}/.git/` : `Initialized empty Git repository in ${ctx.backend.vfs.toPosix(ctx.sh.cwd)}/.git/`)
    return 0
  }
  if (sub === 'clone') {
    ctx.print(`Cloning into '${(rest.find((a) => !a.startsWith('-')) ?? 'repo').split('/').pop()?.replace(/\.git$/, '')}'...`)
    await ctx.sleep(900)
    ctx.print('fatal: unable to access the network from the TerminalDeck web demo')
    return 128
  }
  if (!repo) return notARepo(ctx)
  switch (sub) {
    case 'status':
    case 'st':
      return status(ctx, repo, rest)
    case 'log':
      return log(ctx, repo, rest)
    case 'diff':
      return diff(ctx, repo, rest)
    case 'show': {
      const c = repo.log(1)[0]
      if (!c) return 0
      ctx.print(`${C.yellow}commit ${c.hash}${C.reset}${decorations(repo, 0)}`, `Author: ${c.author} <${c.email}>`, `Date:   ${gitDate(c.date)}`, '', ...body(c.message), '')
      ctx.print(...c.files.map((f) => `${C.bold}diff --git a/${f} b/${f}${C.reset}`))
      return 0
    }
    case 'branch':
      return branch(ctx, repo, rest)
    case 'add':
      return add(ctx, repo, rest)
    case 'commit':
      return commit(ctx, repo, rest)
    case 'push':
      return push(ctx, repo, rest)
    case 'pull':
    case 'fetch': {
      await ctx.sleep(800)
      if (sub !== 'pull') return 0
      if (!repo.upstream() && !rest.some((a) => !a.startsWith('-'))) {
        const b = repo.currentBranch()
        ctx.print(
          'There is no tracking information for the current branch.',
          'Please specify which branch you want to merge with.',
          'See git-pull(1) for details.',
          '',
          '    git pull <remote> <branch>',
          '',
          'If you wish to set tracking information for this branch you can do so with:',
          '',
          `    git branch --set-upstream-to=origin/<branch> ${b}`,
          ''
        )
        return 1
      }
      ctx.print('Already up to date.')
      return 0
    }
    case 'checkout':
    case 'switch':
      return checkout(ctx, repo, rest, sub)
    case 'restore': {
      ctx.print('error: git restore is not available in the TerminalDeck web demo')
      return 1
    }
    case 'remote': {
      const up = repo.upstream()
      if (!up) return 0
      const r = remoteName(up.name)
      ctx.print(...(rest.includes('-v') ? [`${r}\t${up.url} (fetch)`, `${r}\t${up.url} (push)`] : [r]))
      return 0
    }
    case 'rev-parse':
      if (rest.includes('--abbrev-ref')) ctx.print(repo.currentBranch())
      else if (rest.includes('--show-toplevel')) ctx.print(ctx.backend.vfs.toPosix(repo.root).replace(/^\/(\w)/, (_m, d: string) => `${d.toUpperCase()}:`))
      else ctx.print(repo.log(1)[0]?.hash ?? '')
      return 0
    case 'stash':
      ctx.print('No local changes to save')
      return 0
    default:
      ctx.print(`git: '${sub}' is not a git command. See 'git --help'.`)
      return 1
  }
}
