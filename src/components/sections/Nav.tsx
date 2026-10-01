import { useEffect, useId, useRef, useState } from 'react'
import { DownloadButton } from '../ui/Button'
import { Wordmark } from '../ui/Wordmark'
import { DOCS_PATH, SECTIONS } from '../../lib/links'

const LINKS = SECTIONS.filter((s) => s.nav)

/**
 * Sticky paper bar: wordmark, section links, Docs, Download. Below 1100 px the links fold into
 * a menu (button with aria-expanded / aria-controls; Escape and link clicks close it).
 * The current section is marked with aria-current and a 2 px navy underline (magenta is kept for annotations and focus).
 */
export function Nav({ docs = false }: { docs?: boolean } = {}) {
  // On /docs the section links point back to the home page and Docs is the current page.
  const site = docs ? '../' : ''
  const docsHref = docs ? './' : DOCS_PATH
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const menuId = useId()
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    const onResize = (): void => {
      if (window.innerWidth >= 1100) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  // Scroll-spy: the section whose top has passed ~40 % of the viewport.
  useEffect(() => {
    if (docs || typeof IntersectionObserver === 'undefined') return
    const els = LINKS.map((l) => document.getElementById(l.id)).filter((e): e is HTMLElement => !!e)
    if (!els.length) return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting))
        const first = LINKS.find((l) => seen.get(l.id))
        setActive(first ? first.id : null)
      },
      { rootMargin: '-40% 0px -55% 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [docs])

  return (
    <header className="site-nav sticky top-0 z-50 border-b border-rule bg-paper">
      <div className="wrap flex h-[var(--nav-h)] items-center gap-10 max-[640px]:gap-4">
        <a
          href={docs ? '../' : '#top'}
          className="rounded-sm no-underline"
          aria-label={docs ? 'TerminalDeck home' : 'TerminalDeck, back to top'}
        >
          <Wordmark size={19} />
        </a>

        <nav aria-label="Sections" className="ml-auto max-[1099px]:hidden">
          <ul className="m-0 flex list-none items-center gap-8 p-0">
            {LINKS.map((l) => (
              <li key={l.id}>
                <NavLink href={`${site}#${l.id}`} current={active === l.id}>
                  {l.label}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink href={docsHref} current={docs} page>
                Docs
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-3 max-[1099px]:ml-auto max-[640px]:gap-2">
          <DownloadButton size="sm" compact className="min-[641px]:min-h-11 min-[641px]:px-5" />
          <button
            ref={btnRef}
            type="button"
            className="hidden h-10 items-center gap-2 rounded-[7px] border border-rule-strong px-3.5 text-16 font-medium text-ink hover:border-ink hover:bg-ink/5 max-[640px]:px-3 max-[479px]:w-10 max-[479px]:justify-center max-[479px]:px-0 max-[1099px]:inline-flex"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((o) => !o)}
          >
            <MenuGlyph open={open} />
            <span className="max-[479px]:sr-only">Menu</span>
          </button>
        </div>
      </div>

      <div id={menuId} hidden={!open} className="border-t border-rule bg-paper min-[1100px]:hidden">
        <nav aria-label="Sections" className="wrap py-3">
          <ul className="m-0 list-none p-0">
            {LINKS.map((l) => (
              <li key={l.id} className="border-b border-rule last:border-b-0">
                <a
                  href={`${site}#${l.id}`}
                  onClick={() => setOpen(false)}
                  aria-current={active === l.id ? 'true' : undefined}
                  className="block py-4 text-21 font-medium text-ink no-underline aria-[current]:underline aria-[current]:decoration-2 aria-[current]:underline-offset-[6px]"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={docsHref}
                aria-current={docs ? 'page' : undefined}
                className="block py-4 text-21 font-medium text-ink no-underline aria-[current]:underline aria-[current]:decoration-2 aria-[current]:underline-offset-[6px]"
              >
                Docs
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}

function NavLink({
  href,
  current,
  page = false,
  children
}: {
  href: string
  current?: boolean
  page?: boolean
  children: string
}) {
  return (
    <a
      href={href}
      aria-current={current ? (page ? 'page' : 'true') : undefined}
      className="text-[17px] font-medium whitespace-nowrap text-pencil no-underline decoration-1 underline-offset-[6px] hover:text-ink hover:underline aria-[current]:text-ink aria-[current]:underline aria-[current]:decoration-ink aria-[current]:decoration-2"
    >
      {children}
    </a>
  )
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="flex-none">
      {open ? (
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  )
}
