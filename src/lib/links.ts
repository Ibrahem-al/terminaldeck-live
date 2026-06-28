/** The live Windows installer (latest GitHub release asset) and project links. */
export const DOWNLOAD_URL =
  'https://github.com/Ibrahem-al/terminaldeck-live/releases/latest/download/TerminalDeck-Setup-0.2.0.exe'
export const RELEASES_URL = 'https://github.com/Ibrahem-al/terminaldeck-live/releases'
export const REPO_URL = 'https://github.com/Ibrahem-al/terminaldeck-live'

/** Smoothly scroll to an on-page section by id. */
export function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
