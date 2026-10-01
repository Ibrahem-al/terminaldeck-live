import { Wordmark } from '../ui/Wordmark'
import { DOCS_PATH, ISSUES_URL, RELEASES_URL, REPO_URL } from '../../lib/links'
import { INSTALLER, RELEASE_DATE_LABEL, VERSION } from '../../lib/facts'

/** The page's foot, on Deepwater: wordmark and one line, three link columns, the version. */
export function Footer({ docs = false }: { docs?: boolean }) {
  const site = docs ? '../' : ''
  const guide = docs ? '' : `${DOCS_PATH}`
  const columns: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
    {
      title: 'Product',
      links: [
        { label: 'Download', href: `${site}#download` },
        { label: 'Live demo', href: `${site}#demo` },
        { label: 'The Notch', href: `${site}#notch` },
        { label: 'Agents', href: `${site}#agents` },
        { label: 'Features', href: `${site}#features` }
      ]
    },
    {
      title: 'Docs',
      links: [
        { label: 'User guide', href: `${guide}#overview` },
        { label: 'Getting started', href: `${guide}#getting-started` },
        { label: 'Keyboard shortcuts', href: `${guide}#shortcuts` },
        { label: 'Troubleshooting', href: `${guide}#troubleshooting` }
      ]
    },
    {
      title: 'Releases',
      links: [
        { label: 'Release log', href: `${site}#releases` },
        { label: 'All releases on GitHub', href: RELEASES_URL },
        { label: 'Project on GitHub', href: REPO_URL },
        { label: 'Report a problem', href: ISSUES_URL }
      ]
    }
  ]
  return (
    <footer className="band band-deep site-footer">
      <div className="wrap">
        <div className="grid-12 gap-y-12">
          <div className="col-span-4 max-[1099px]:col-span-12">
            <a href={docs ? '../' : '#top'} className="inline-block rounded-sm text-fg no-underline">
              <Wordmark size={22} />
            </a>
            <p className="mt-5 max-w-[30ch] text-[17px] leading-relaxed text-fg-2">
              A free terminal workspace for Windows. Local only: no account, no cloud, no telemetry.
            </p>
          </div>
          {columns.map((c, i) => (
            <nav
              key={c.title}
              aria-label={c.title}
              className={
                (i === 0 ? 'col-start-6 ' : '') +
                'col-span-2 max-[1099px]:col-start-auto max-[1099px]:col-span-4 max-[640px]:col-span-6'
              }
            >
              <h2 className="text-[17px] font-semibold text-fg">{c.title}</h2>
              <ul className="m-0 mt-4 list-none space-y-2.5 p-0">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a className="footer-link" href={l.href}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-20 flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3 border-t border-line pt-7 max-[640px]:mt-14">
          <p className="caption tnum">
            Version {VERSION}, released {RELEASE_DATE_LABEL}. Installer {INSTALLER.sizeLabel}.
          </p>
          <p className="caption">Its internal name is quarterdeck: the raised deck from which a ship’s captain commands.</p>
        </div>
      </div>
    </footer>
  )
}
