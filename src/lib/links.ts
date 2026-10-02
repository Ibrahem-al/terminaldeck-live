/**
 * Every outbound link on the site. The public repo Ibrahem-al/TerminalDeck hosts the
 * releases (the same feed the in-app updater reads). The code repo is private: never link it.
 * The installer asset name is version-less, so DOWNLOAD_URL always resolves to the newest build.
 */
export const DOWNLOAD_URL =
  'https://github.com/Ibrahem-al/TerminalDeck/releases/latest/download/TerminalDeck-Setup.exe'
export const RELEASES_URL = 'https://github.com/Ibrahem-al/TerminalDeck/releases'
export const REPO_URL = 'https://github.com/Ibrahem-al/TerminalDeck'
export const ISSUES_URL = 'https://github.com/Ibrahem-al/TerminalDeck/issues'

/** Canonical production origin (meta, sitemap, JSON-LD). */
export const SITE_URL = 'https://terminaldeck-live.vercel.app/'

/** Site-relative paths. Relative so the build works at any base. */
export const DOCS_PATH = './docs'
/** The playable demo (built by `npm run build:demo` into public/demo). */
export const DEMO_PATH = './demo/index.html?embed=1'
/**
 * The demo on its own page. Always the explicit file: with trailingSlash:false, Vercel would 308
 * /demo/ to /demo, where the demo's relative ./assets/ URLs resolve against the site root.
 */
export const DEMO_FULL_PATH = './demo/index.html'

/** Film and stills (produced into public/media; may be missing, so every consumer needs a fallback). */
export const MEDIA = {
  film: { mp4: './media/terminaldeck-film.mp4', webm: './media/terminaldeck-film.webm', mp4_720: './media/terminaldeck-film-720.mp4' },
  teaser: { mp4: './media/teaser.mp4', webm: './media/teaser.webm' },
  filmLength: '1:20',
  /** Chapter starts in seconds: eight of the film's ten scenes (two-second bars at 120 BPM; see hype-video/src/scenes). */
  chapters: [
    { at: 0, title: 'One agent, one window' },
    { at: 12, title: 'Too many windows' },
    { at: 16, title: 'Decks' },
    { at: 24, title: 'Agents at work' },
    { at: 32, title: 'The Notch' },
    { at: 40, title: 'Agents talk' },
    { at: 48, title: 'Small and fast' },
    { at: 56, title: 'Themes and the rest' }
  ],
  poster: './media/poster.jpg',
  ogImage: './og-image.png'
} as const

/** Page sections, in order. Nav and Footer read this; ids are the anchor targets. */
export const SECTIONS = [
  { id: 'features', label: 'Features', nav: false },
  { id: 'demo', label: 'Live demo', nav: true },
  { id: 'notch', label: 'The Notch', nav: true },
  { id: 'agents', label: 'Agents', nav: true },
  { id: 'workspace', label: 'Workspace', nav: false },
  { id: 'film', label: 'Film', nav: true },
  { id: 'speed', label: 'Performance', nav: true },
  { id: 'releases', label: 'Releases', nav: true },
  { id: 'download', label: 'Download', nav: false },
  { id: 'faq', label: 'FAQ', nav: true }
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

/** Smoothly scroll to an on-page section (instant under reduced motion; CSS handles that). */
export function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}
