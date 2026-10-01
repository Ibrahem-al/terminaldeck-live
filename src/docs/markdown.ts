/**
 * The user guide, parsed once at load from src/docs/content/*.md (copied from the guide writer's
 * chapters). Each chapter becomes { id, num, title, summary, html, headings, rows }.
 *
 * Rendering rules on top of plain Markdown:
 * - Links to other chapters ("03-the-notch.md#hooks") become in-page hash links (#the-notch).
 * - Headings get unique ids across the whole guide plus a visible anchor link.
 * - Key chords in bold ("**Ctrl+Shift+D**", "**Prefix z**") and the key column of shortcut
 *   tables render as <kbd> keys.
 * - Tables sit in a labelled, focusable region; cells carry data-label for the stacked phone layout.
 * - Code blocks render on a Deepwater plate with a copy button.
 * - A bold UI path ("Settings → General → On startup") gets quiet separators.
 */
import { Marked, type Tokens } from 'marked'

export interface DocHeading {
  id: string
  text: string
  depth: 2 | 3
}
/** A searchable table row (a shortcut, a setting): lives under a heading. */
export interface DocRow {
  text: string
  detail: string
  headingId: string
}
export interface Chapter {
  id: string
  num: number
  file: string
  title: string
  summary: string
  html: string
  headings: DocHeading[]
  rows: DocRow[]
}

const files = import.meta.glob('./content/*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

/* ------------------------------------------------------------------ helpers */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c])
const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
const stripTags = (html: string): string => decode(html.replace(/<[^>]+>/g, '')).trim()

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '-')
}

const chapterIdOf = (file: string): string => {
  const base = file.replace(/^.*\//, '').replace(/\.md$/, '')
  if (/^00-/.test(base)) return 'overview'
  return base.replace(/^\d+-/, '')
}

/* ------------------------------------------------------------------ keys */

const NAMED = [
  'Ctrl',
  'Alt',
  'Shift',
  'Win',
  'Esc',
  'Enter',
  'Tab',
  'Space',
  'Home',
  'End',
  'Page Up',
  'Page Down',
  'Delete',
  'Backspace',
  'Arrow'
]
const MOUSE = /^(click|drag|double-click|right-click)$/i

function isKeyName(part: string): boolean {
  return NAMED.includes(part) || /^F\d{1,2}$/.test(part) || [...part].length === 1
}
/** "Ctrl+Shift+D" → ['Ctrl','Shift','D']; "Ctrl+," stays two parts; a lone "+" is a key. */
function chordParts(token: string): string[] {
  if (token === '+') return ['+']
  return token.split(/\+(?!$)/)
}
function isChord(token: string): boolean {
  const parts = chordParts(token)
  return parts.every((p, i) => isKeyName(p) || (i === parts.length - 1 && i > 0 && MOUSE.test(p)))
}
function kbd(key: string): string {
  return `<kbd class="kbd">${escapeHtml(key.replace(/ /g, ' '))}</kbd>`
}
function chordHtml(token: string): string {
  const parts = chordParts(token)
    .map((p) => (MOUSE.test(p) ? `<span class="docs-mouse">${escapeHtml(p)}</span>` : kbd(p)))
    .join('<span class="docs-plus">+</span>')
  return `<span class="chord">${parts}</span>`
}

/**
 * Plain key text ("Ctrl+Tab / Ctrl+Shift+Tab", "← ↑ ↓ → or h j k l", "Middle-click a tab")
 * → keys, with separators and words left as quiet text.
 */
export function keysHtml(text: string): string {
  const src = text.replace(/Page Up/g, 'Page Up').replace(/Page Down/g, 'Page Down')
  const pieces = src.split(/(\s+\/\s+|\s+or\s+|,\s+|\s*…\s*|\s+–\s+|\s+)/)
  const words = pieces.filter((_, i) => i % 2 === 0)
  // A cell that is mostly words ("Middle-click a tab") stays text apart from real chords.
  return pieces
    .map((piece, i) => {
      if (i % 2 === 1) {
        const sep = piece.trim()
        if (!sep) return ' '
        return ` <span class="docs-sep">${escapeHtml(sep)}</span> `
      }
      if (!piece) return ''
      const lone = [...piece].length === 1
      if (isChord(piece) && !(lone && words.some((w) => w.length > 3 && !isChord(w)))) return chordHtml(piece)
      if (/^\d\s*[–-]\s*\d$/.test(piece)) {
        const [a, b] = piece.split(/\s*[–-]\s*/)
        return `${kbd(a)}<span class="docs-sep">–</span>${kbd(b)}`
      }
      return escapeHtml(piece)
    })
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Bold text that is a chord, a named key, or "Prefix …". */
function boldKeys(text: string): string | null {
  const t = text.trim()
  const pre = /^Prefix\s+(.+)$/.exec(t)
  if (pre) return `<span class="keys"><kbd class="kbd kbd-prefix" title="The prefix key: Ctrl+A unless you changed it">Prefix</kbd> ${keysHtml(pre[1])}</span>`
  if (t.includes('+') && isChord(t) && chordParts(t).length > 1) return `<span class="keys">${chordHtml(t)}</span>`
  if (/^(Esc|Enter|Tab|Space|F\d{1,2})$/.test(t)) return `<span class="keys">${kbd(t)}</span>`
  return null
}

/* ------------------------------------------------------------------ build */

const raw = Object.entries(files)
  .map(([path, text]) => ({ file: path.replace(/^.*\//, ''), text }))
  .sort((a, b) => a.file.localeCompare(b.file))

/** Pass 1: chapter ids, titles and heading ids (unique across the guide). */
const used = new Set<string>()
const pre = raw.map(({ file, text }) => {
  const id = chapterIdOf(file)
  used.add(id)
  return { file, text, id }
})

interface Plan {
  file: string
  id: string
  text: string
  title: string
  /** local slug → global id (for "#keys-the-app-keeps" style links) */
  local: Map<string, string>
  ids: string[]
}
const plans: Plan[] = pre.map(({ file, text, id }) => {
  const tokens = new Marked().lexer(text)
  let title = id
  const local = new Map<string, string>()
  const ids: string[] = []
  for (const t of tokens) {
    if (t.type !== 'heading') continue
    const h = t as Tokens.Heading
    const plain = stripTags(h.text.replace(/\*\*|`/g, ''))
    if (h.depth === 1) {
      title = plain
      continue
    }
    if (h.depth > 3) continue
    const slug = slugify(plain) || 'section'
    let gid = used.has(slug) ? `${id}-${slug}` : slug
    let n = 2
    while (used.has(gid)) gid = `${id}-${slug}-${n++}`
    used.add(gid)
    if (!local.has(slug)) local.set(slug, gid)
    ids.push(gid)
  }
  return { file, id, text, title, local, ids }
})

const byFile = new Map(plans.map((p) => [p.file, p]))

function resolveHref(href: string, current: Plan): string {
  if (/^[a-z]+:/i.test(href)) return href
  const m = /^(?:\.\/)?([\w-]+\.md)?(?:#(.*))?$/.exec(href)
  if (!m) return href
  const target = m[1] ? byFile.get(m[1]) : current
  if (!target) return href
  if (m[2]) return `#${target.local.get(m[2]) ?? target.id}`
  return `#${target.id}`
}

/** Pass 2: render each chapter with the ids from pass 1. */
function render(plan: Plan, num: number): Chapter {
  const headings: DocHeading[] = []
  const rows: DocRow[] = []
  let hi = 0
  let h2n = 0
  let tableNo = 0
  let lastHeadingId = plan.id
  let lastHeadingText = plan.title

  const md = new Marked({ gfm: true })
  md.use({
    renderer: {
      heading(token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens)
        if (token.depth === 1) return '' // the page header draws the chapter title
        if (token.depth > 3) return `<h4 class="docs-h4">${inner}</h4>\n`
        const id = plan.ids[hi++]
        const text = stripTags(inner)
        headings.push({ id, text, depth: token.depth as 2 | 3 })
        lastHeadingId = id
        lastHeadingText = text
        if (token.depth === 2) h2n++
        const numLabel = token.depth === 2 && num ? `<span class="docs-hnum tnum">${num}.${h2n}</span>` : ''
        return (
          `<h${token.depth} id="${id}" class="docs-h${token.depth}" tabindex="-1">` +
          numLabel +
          `<span class="docs-htext">${inner}</span>` +
          `<a class="docs-anchor" href="#${id}" aria-label="Link to “${escapeHtml(text)}”">#</a>` +
          `</h${token.depth}>\n`
        )
      },
      link(token: Tokens.Link) {
        const inner = this.parser.parseInline(token.tokens)
        const href = resolveHref(token.href, plan)
        const ext = /^https?:/i.test(href)
        return `<a class="textlink" href="${escapeHtml(href)}"${ext ? ' rel="noopener"' : ''}>${inner}</a>`
      },
      strong(token: Tokens.Strong) {
        const keys = boldKeys(decode(token.text))
        if (keys) return keys
        const inner = this.parser.parseInline(token.tokens)
        const plain = stripTags(inner)
        // A short bold token right after keys ("**Prefix n** / **p** / **1–9**") may be a key too.
        if (/^(\S|\d–\d)$/.test(plain)) return `<strong class="k-cand">${inner}</strong>`
        if (plain.includes(' → '))
          return `<strong class="docs-path">${inner.replace(/ → /g, '<span class="docs-path-sep" aria-hidden="true"> › </span><span class="sr-only"> then </span>')}</strong>`
        return `<strong>${inner}</strong>`
      },
      code(token: Tokens.Code) {
        const code = escapeHtml(token.text)
        return (
          `<figure class="docs-code plate">` +
          `<button type="button" class="docs-copy" data-copy>Copy</button>` +
          `<pre tabindex="0"><code>${code}</code></pre></figure>\n`
        )
      },
      blockquote(token: Tokens.Blockquote) {
        return `<aside class="docs-note">${this.parser.parse(token.tokens)}</aside>\n`
      },
      table(token: Tokens.Table) {
        tableNo++
        const heads = token.header.map((c) => this.parser.parseInline(c.tokens))
        const headPlain = heads.map(stripTags)
        const keyCol = /^(keys?|after the prefix)$/i.test(headPlain[0] ?? '')
        const cls = `docs-table cols-${heads.length}${keyCol ? ' is-keys' : ''}`
        const cell = (c: Tokens.TableCell, i: number): string => {
          if (keyCol && i === 0) return `<span class="keys">${keysHtml(c.text)}</span>`
          return this.parser.parseInline(c.tokens)
        }
        const align = (i: number): string =>
          token.align[i] ? ` style="text-align:${token.align[i]}"` : ''
        const thead = `<thead><tr>${heads.map((h, i) => `<th scope="col"${align(i)}>${h}</th>`).join('')}</tr></thead>`
        const body = token.rows
          .map((r) => {
            const first = stripTags(this.parser.parseInline(r[0].tokens))
            const rest = r
              .slice(1)
              .map((c) => stripTags(this.parser.parseInline(c.tokens)))
              .filter(Boolean)
              .join(' · ')
            if (first && !/^\d+$/.test(first)) rows.push({ text: first, detail: rest, headingId: lastHeadingId })
            return `<tr>${r
              .map((c, i) => {
                const tag = i === 0 && !/^\d+$/.test(stripTags(c.text)) ? 'th scope="row"' : 'td'
                const close = tag.startsWith('th') ? 'th' : 'td'
                return `<${tag} data-label="${escapeHtml(headPlain[i] ?? '')}"${align(i)}><span class="docs-cell">${cell(c, i)}</span></${close}>`
              })
              .join('')}</tr>`
          })
          .join('')
        const label = `${lastHeadingText}: ${headPlain.join(', ')}`
        return (
          `<div class="${cls}" role="region" tabindex="0" aria-label="${escapeHtml(label)}" data-table="${tableNo}">` +
          `<table>${thead}<tbody>${body}</tbody></table></div>\n`
        )
      }
    }
  })

  let html = md.parse(plan.text) as string
  // Follow-on keys: "<keys>…</keys> / <strong class="k-cand">p</strong>" → keys.
  const follow =
    /(<\/kbd>(?:<\/span>)+)(\s*(?:\/|or|,|and|…)\s*)<strong class="k-cand">([^<]*)<\/strong>/
  for (let guard = 0; guard < 50 && follow.test(html); guard++) {
    html = html.replace(follow, (_m, close: string, sep: string, key: string) => {
      const k = decode(key)
      const inner = /^\d–\d$/.test(k) ? keysHtml(k.replace('–', ' – ')) : kbd(k)
      return `${close}${sep}<span class="keys">${inner}</span>`
    })
  }
  html = html.replace(/<strong class="k-cand">/g, '<strong>')

  return {
    id: plan.id,
    num,
    file: plan.file,
    title: plan.title,
    summary: '',
    html,
    headings,
    rows
  }
}

const built = plans.map((p, i) => render(p, i))

// Summaries come from the overview's chapter table ("What's in it").
{
  const overview = plans.find((p) => p.id === 'overview')
  if (overview) {
    const tokens = new Marked().lexer(overview.text)
    for (const t of tokens) {
      if (t.type !== 'table') continue
      const tb = t as Tokens.Table
      for (const row of tb.rows) {
        const link = /\(([\w-]+\.md)\)/.exec(row[1]?.text ?? '')
        const ch = link && built.find((c) => c.file === link[1])
        if (ch && row[2]) ch.summary = stripTags(row[2].text)
      }
    }
  }
}

export const CHAPTERS: Chapter[] = built
export const OVERVIEW_ID = 'overview'

/** Which chapter owns this hash target (a chapter id or any heading id)? */
export function locate(hash: string): { chapter: Chapter; target: string | null } {
  const id = decodeURIComponent(hash.replace(/^#/, ''))
  const direct = CHAPTERS.find((c) => c.id === id)
  if (direct) return { chapter: direct, target: null }
  const owner = CHAPTERS.find((c) => c.headings.some((h) => h.id === id))
  if (owner) return { chapter: owner, target: id }
  return { chapter: CHAPTERS[0], target: null }
}
