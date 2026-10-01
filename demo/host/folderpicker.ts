/**
 * The folder chooser behind `fs_pick_root` (sidebar "Open another folder",
 * Settings → Default directory → Browse, the project form's Browse). Rust
 * opens the system folder dialog there; the browser has none that could see
 * the virtual machine, so this is a small dialog of our own over the desktop:
 * quick places on the left, the current folder's subfolders on the right.
 */
import { themeById } from '@renderer/styles/themes'
import type { Backend } from '../backend/contracts'

export interface FolderPicker {
  /** Resolves with the chosen folder, or null when cancelled. */
  pick(start: string | null, title?: string): Promise<string | null>
}

const FOLDER_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'

export function createFolderPicker(opts: { desktop: HTMLElement; backend: () => Backend }): FolderPicker {
  let open: ((value: string | null) => void) | null = null

  const pick = (start: string | null, title = 'Select a folder'): Promise<string | null> => {
    open?.(null)
    const backend = opts.backend()
    const vfs = backend.vfs
    const machine = backend.scenario.machine
    const isDir = (path: string): boolean => {
      try {
        return vfs.stat(path)?.isDir === true
      } catch {
        return false
      }
    }
    let current = start && isDir(start) ? (vfs.stat(start)?.path ?? start) : machine.projectsDir
    let selected: string | null = null

    const places: Array<{ label: string; path: string }> = [
      { label: 'Home', path: machine.home },
      { label: 'Desktop', path: `${machine.home}\\Desktop` },
      { label: 'projects', path: machine.projectsDir },
      ...backend.state.projects().map((p) => ({ label: p.name, path: p.rootDir }))
    ].filter((p) => isDir(p.path))

    const scrim = document.createElement('div')
    scrim.className = 'picker-scrim'
    // Painted in the app's current theme: a light theme gets a light dialog, as the system one would be.
    const theme = themeById(backend.state.settings().general.theme)
    const vars: Record<string, string> = {
      '--pk-bg': theme.bg[1],
      '--pk-field': theme.bg[2],
      '--pk-ink': theme.ink[0],
      '--pk-ink-2': theme.ink[2],
      '--pk-edge': theme.edge[0],
      '--pk-accent': theme.accent,
      '--pk-accent-ink': theme.ink[3],
      '--pk-hover': theme.kind === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)'
    }
    for (const [k, v] of Object.entries(vars)) scrim.style.setProperty(k, v)
    const dialog = document.createElement('div')
    dialog.className = 'picker'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-label', title)
    scrim.append(dialog)

    const head = document.createElement('header')
    head.className = 'picker-head'
    head.textContent = title
    const bar = document.createElement('div')
    bar.className = 'picker-bar'
    const up = document.createElement('button')
    up.type = 'button'
    up.className = 'picker-up'
    up.title = 'Up one level'
    up.setAttribute('aria-label', 'Up one level')
    up.textContent = '↑'
    const where = document.createElement('div')
    where.className = 'picker-path'
    bar.append(up, where)

    const body = document.createElement('div')
    body.className = 'picker-body'
    const side = document.createElement('nav')
    side.className = 'picker-places'
    side.setAttribute('aria-label', 'Places')
    const list = document.createElement('ul')
    list.className = 'picker-list'
    list.setAttribute('role', 'listbox')
    list.setAttribute('aria-label', 'Folders')
    body.append(side, list)

    const foot = document.createElement('footer')
    foot.className = 'picker-foot'
    const name = document.createElement('div')
    name.className = 'picker-name'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'btn-quiet'
    cancel.textContent = 'Cancel'
    const ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'btn-primary'
    ok.textContent = 'Select folder'
    foot.append(name, cancel, ok)
    dialog.append(head, bar, body, foot)

    const chosen = (): string => selected ?? current

    const render = (): void => {
      where.textContent = current
      up.disabled = vfs.key(vfs.dirname(current)) === vfs.key(current)
      name.textContent = `Folder: ${chosen().split('\\').pop() || chosen()}`
      side.replaceChildren(
        ...places.map((p) => {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = 'picker-place'
          b.dataset.active = String(vfs.key(p.path) === vfs.key(current))
          b.innerHTML = FOLDER_ICON
          b.append(p.label)
          b.addEventListener('click', () => go(p.path))
          return b
        })
      )
      let dirs: string[] = []
      try {
        dirs = vfs
          .readDir(current)
          .filter((e) => e.isDir)
          .map((e) => e.name)
          .sort((a, b) => a.localeCompare(b))
      } catch {
        dirs = []
      }
      if (!dirs.length) {
        const empty = document.createElement('li')
        empty.className = 'picker-empty'
        empty.textContent = 'No folders in here'
        list.replaceChildren(empty)
        return
      }
      list.replaceChildren(
        ...dirs.map((d) => {
          const path = `${current.replace(/\\$/, '')}\\${d}`
          const li = document.createElement('li')
          li.className = 'picker-item'
          li.setAttribute('role', 'option')
          li.tabIndex = 0
          li.dataset.hidden = String(d.startsWith('.'))
          li.setAttribute('aria-selected', String(selected !== null && vfs.key(selected) === vfs.key(path)))
          li.innerHTML = FOLDER_ICON
          li.append(d)
          li.addEventListener('click', () => {
            selected = path
            render()
          })
          li.addEventListener('dblclick', () => go(path))
          li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') go(path)
          })
          return li
        })
      )
    }

    const go = (path: string): void => {
      current = vfs.stat(path)?.path ?? path
      selected = null
      render()
    }

    return new Promise<string | null>((resolve) => {
      const finish = (value: string | null): void => {
        if (open !== finish) return
        open = null
        document.removeEventListener('keydown', onKey, true)
        scrim.remove()
        resolve(value)
      }
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          e.preventDefault()
          finish(null)
        }
      }
      open = finish
      up.addEventListener('click', () => go(vfs.dirname(current)))
      cancel.addEventListener('click', () => finish(null))
      ok.addEventListener('click', () => finish(chosen()))
      scrim.addEventListener('mousedown', (e) => {
        if (e.target === scrim) finish(null)
      })
      document.addEventListener('keydown', onKey, true)
      render()
      opts.desktop.append(scrim)
      ok.focus()
    })
  }

  return { pick }
}
