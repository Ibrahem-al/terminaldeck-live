import { useEffect, useState } from 'react'
import { Download, Menu, X } from 'lucide-react'
import { Wordmark } from '../app/Wordmark'
import { ThemeMenu } from '../ui/ThemeMenu'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { DOWNLOAD_URL } from '../../lib/links'
import { toast } from '../../lib/toast'

const onDownload = (): void => toast('Downloading TerminalDeck for Windows…', { kind: 'download' })

const links = [
  { href: '#cockpit', label: 'The cockpit' },
  { href: '#agents', label: 'AI agents' },
  { href: '#remotedeck', label: 'RemoteDeck' },
  { href: '#themes', label: 'Themes' },
  { href: '#faq', label: 'FAQ' }
]

export function Nav(): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-edge-2 bg-base/80 backdrop-blur-xl'
          : 'border-b border-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-6 px-5 sm:px-8">
        <a href="#top" className="shrink-0" aria-label="TerminalDeck home">
          <Wordmark size={17} />
        </a>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 font-ui text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeMenu />
          <div className="hidden sm:flex">
            <Button href={DOWNLOAD_URL} onClick={onDownload} variant="primary" size="md">
              <Download size={15} />
              Download
            </Button>
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-ink-2 lg:hidden"
            aria-label="Menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-edge-2 bg-base/95 backdrop-blur-xl lg:hidden">
          <nav className="mx-auto flex max-w-[1180px] flex-col gap-1 px-5 py-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2.5 font-ui text-[14px] font-medium text-ink-2 hover:bg-raised hover:text-ink"
              >
                {l.label}
              </a>
            ))}
            <Button
              href={DOWNLOAD_URL}
              variant="primary"
              className="mt-2"
              onClick={() => {
                setMenuOpen(false)
                onDownload()
              }}
            >
              <Download size={15} />
              Download for Windows
            </Button>
          </nav>
        </div>
      )}
    </header>
  )
}
