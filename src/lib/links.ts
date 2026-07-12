/** The live Windows installer (latest GitHub release asset) and project links.
 *  Releases live on the app repo (Ibrahem-al/terminaldeck) — the same feed the
 *  in-app updater reads. The asset name is version-less, so this link is stable
 *  across releases and always resolves to the newest installer. */
export const DOWNLOAD_URL =
  'https://github.com/Ibrahem-al/TerminalDeck/releases/latest/download/TerminalDeck-Setup.exe'
export const RELEASES_URL = 'https://github.com/Ibrahem-al/TerminalDeck/releases'
export const REPO_URL = 'https://github.com/Ibrahem-al/TerminalDeck'

/** Smoothly scroll to an on-page section by id. */
export function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
