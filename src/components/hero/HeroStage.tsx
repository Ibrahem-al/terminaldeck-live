import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'
import { DEMO_SRC, mediaAvailable, probeDemo, useDemo } from '../../lib/demo'
import { DEMO_FULL_PATH, MEDIA } from '../../lib/links'
import { setProductTheme, useProductTheme } from '../../lib/productTheme'
import { useReducedMotion } from '../../lib/useReducedMotion'
import { SHELLS, COUNTS } from '../../lib/facts'
import { Plate } from '../ui/Plate'
import { Button } from '../ui/Button'
import { Kbd } from '../ui/Kbd'
import { Callout, Marker } from '../ui/Callout'
import { Leader, LeaderLayer, useDrawIn } from '../ui/Leader'
import { NotchComposite } from './NotchComposite'
import { ThemePicker } from './ThemePicker'
import { FilmPanel } from './FilmPanel'
import { APP, PARTS, PLATE, STAGE, TABS_W, TOP_RUN, px, py, pyFromBottom } from './geometry'
import poster from './demo-poster.webp'
import './hero.css'

type Tab = 'live' | 'film'

/** What each lettered part says. <b> names the part; italic magenta = annotation. */
const NOTES: Record<string, React.ReactNode> = {
  A: (
    <>
      <b>Decks.</b> Each tab holds {COUNTS.panesPerDeckMin} to {COUNTS.panesPerDeckMax} real terminals; Ctrl+Tab moves
      between them.
    </>
  ),
  B: (
    <>
      <b>The Notch</b> lights up when an agent asks a question or finishes. Click it to answer.
    </>
  ),
  C: (
    <>
      <b>Messages.</b> Agents can message each other; this opens the log of every message.
    </>
  ),
  D: <>Panes name themselves from what’s running.</>,
  E: (
    <>
      <b>Real shells:</b>{' '}
      {SHELLS.map((sh, i) => (
        <span key={sh}>
          <span className="whitespace-nowrap">{sh}</span>
          {i < SHELLS.length - 2 ? ', ' : i === SHELLS.length - 2 ? ' and ' : '.'}
        </span>
      ))}
    </>
  )
}

const POSTER_ALT =
  'TerminalDeck with the Harbor project open: a file tree, and a deck of four panes running Claude Code, Codex, a Vite dev server and a PowerShell prompt.'

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = (): void => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

/**
 * The hero stage: a "Live demo | Film" tab strip over a dark plate holding the real app in an iframe,
 * annotated with five magenta leaders. The one orchestrated moment: the notch pill blinks, the
 * question alert slides down, then the leaders draw out to their parts.
 *
 * Loading: the poster (a capture of the demo's own first screen) always paints first. The iframe
 * (and with it the demo's editor and language workers, over 11 MB) mounts only once the visitor
 * reaches for it: the pointer enters the window, focus moves into the stage, or a control is used.
 * Below 900 px the 1280-wide app is too small to use, so the poster stays with a full-screen link.
 *
 * The Film tab appears only once the film is published, and Play the tour only when the deployed
 * demo has a real tour.
 */
export function HeroStage() {
  const reduced = useReducedMotion()
  const narrow = useMedia('(max-width: 899px)')
  const [theme] = useProductTheme()
  const [tab, setTab] = useState<Tab>('live')
  const [filmSeen, setFilmSeen] = useState(false)

  // --- the demo's lifecycle
  const [avail, setAvail] = useState<'unknown' | 'yes' | 'no'>('unknown')
  const [tourInBuild, setTourInBuild] = useState(false)
  const [film, setFilm] = useState<{ ok: boolean; len: string | null }>({ ok: false, len: null })
  const [wanted, setWanted] = useState(false)
  const [wantTour, setWantTour] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const mounted = avail === 'yes' && !narrow && wanted
  const { client, state } = useDemo(frame, mounted)
  const live = mounted && state.ready
  const touring = !!state.tour
  const tourSupported = state.tourSupported ?? tourInBuild
  const liveSince = useRef(0)
  useEffect(() => {
    if (live) liveSince.current = performance.now()
  }, [live])

  useEffect(() => {
    if (narrow) return
    const ac = new AbortController()
    probeDemo(ac.signal).then((p) => {
      if (ac.signal.aborted) return
      setAvail(p.available ? 'yes' : 'no')
      setTourInBuild(p.tour)
    })
    return () => ac.abort()
  }, [narrow])

  // The Film tab exists only once the film is published; its length is read from the file itself.
  useEffect(() => {
    const ac = new AbortController()
    let probe: HTMLVideoElement | null = null
    mediaAvailable(MEDIA.film.mp4, ac.signal).then((ok) => {
      if (ac.signal.aborted || !ok) return
      setFilm({ ok: true, len: null })
      const v = document.createElement('video')
      probe = v
      v.preload = 'metadata'
      v.muted = true
      v.onloadedmetadata = () => {
        if (Number.isFinite(v.duration) && v.duration > 0) {
          const t = Math.round(v.duration)
          setFilm({ ok: true, len: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` })
        }
        v.removeAttribute('src')
      }
      v.src = MEDIA.film.mp4
    })
    return () => {
      ac.abort()
      probe?.removeAttribute('src')
    }
  }, [])

  // Mount the app only when the visitor reaches for it (see the note above).
  const reach = useCallback(() => {
    if (avail === 'yes' && !narrow) setWanted(true)
  }, [avail, narrow])

  // Load the real app straight away on desktop: the poster is only a placeholder while it boots.
  useEffect(() => {
    if (avail === 'yes' && !narrow) setWanted(true)
  }, [avail, narrow])

  useEffect(() => {
    client?.theme(theme.id)
  }, [client, theme.id])
  useEffect(() => {
    if (!client) return
    return client.on((e) => {
      if (e.type === 'theme') setProductTheme(e.theme)
    })
  }, [client])
  useEffect(() => {
    if (client && wantTour) {
      client.tour('start')
      setWantTour(false)
    }
  }, [client, wantTour])

  // --- the visitor's attention: annotations step back while they use the app
  const [hovering, setHovering] = useState(false)
  const [focusIn, setFocusIn] = useState(false)
  const [interacted, setInteracted] = useState(false)
  const hoverRef = useRef(false)
  const lastTab = useRef(Number.NEGATIVE_INFINITY)
  const tourRef = useRef(false)
  tourRef.current = touring
  useEffect(() => {
    hoverRef.current = hovering
  }, [hovering])
  useEffect(() => {
    // The demo focuses its own terminal when it boots, which also moves focus into the iframe.
    // Only count it as the visitor's doing when the pointer is over the app or they just pressed Tab.
    // The first moments after the app reports ready are its own boot focus, not the visitor.
    const byVisitor = (): boolean =>
      (hoverRef.current && liveSince.current > 0 && performance.now() - liveSince.current > 1500) ||
      tourRef.current ||
      performance.now() - lastTab.current < 600
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Tab') lastTab.current = performance.now()
    }
    const onBlur = (): void => {
      window.setTimeout(() => {
        if (!frame.current || document.activeElement !== frame.current) return
        if (byVisitor()) setInteracted(true)
        else {
          // Hand focus back to the page, so its keys (Space, arrows, Tab) keep scrolling and moving the page.
          frame.current.blur()
          window.focus()
        }
      }, 0)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // --- a way out for keyboard visitors: the demo's terminals keep Tab for themselves (as a real
  // terminal does), so Shift+Esc anywhere in the app hands focus back to the controls under it.
  const controlsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!live) return
    const win = frame.current?.contentWindow
    if (!win) return
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape' || !e.shiftKey) return
      e.preventDefault()
      e.stopPropagation()
      frame.current?.blur()
      window.focus()
      controlsRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
      setFocusIn(false)
    }
    // The app nests frames of its own (the notch), so listen in every same-origin frame inside it.
    const hooked: Window[] = []
    const hook = (w: Window): void => {
      try {
        if (!hooked.includes(w)) {
          w.addEventListener('keydown', onKey, true)
          hooked.push(w)
        }
        for (let i = 0; i < w.frames.length; i++) hook(w.frames[i])
      } catch {
        /* cross-origin or gone */
      }
    }
    hook(win)
    const again = window.setInterval(() => hook(win), 2000)
    const onBlur = (): void => hook(win)
    window.addEventListener('blur', onBlur)
    return () => {
      window.clearInterval(again)
      window.removeEventListener('blur', onBlur)
      for (const w of hooked) {
        try {
          w.removeEventListener('keydown', onKey, true)
        } catch {
          /* the frame went away */
        }
      }
    }
  }, [live])

  // --- the one orchestrated moment
  const [notchStage, setNotchStage] = useState<'pill' | 'alert'>(reduced ? 'alert' : 'pill')
  const [alertShown, setAlertShown] = useState(false)
  useEffect(() => {
    if (reduced) {
      setNotchStage('alert')
      setAlertShown(true)
      return
    }
    const a = window.setTimeout(() => setNotchStage('alert'), 1100)
    const b = window.setTimeout(() => setAlertShown(true), 1300)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [reduced])
  const draw = useDrawIn<HTMLUListElement>(alertShown, 80)

  // The app is laid out at 1280 × 800 and scaled to the plate's width.
  const screenRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = screenRef.current
    if (!el) return
    const fit = (): void => el.style.setProperty('--s', String(el.clientWidth / APP.w))
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const notchGone = tab !== 'live' || touring || interacted || (live && hovering)
  const dim = hovering || focusIn
  const annotations = tab !== 'live' || touring ? 'hidden' : dim ? 'dim' : 'on'

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const next: Tab = e.key === 'Home' ? 'live' : e.key === 'End' ? 'film' : tab === 'live' ? 'film' : 'live'
    focusTab.current = next
    selectTab(next)
  }
  // Move focus once the new tab has committed (and its panel's hidden/visible swap has settled).
  const focusTab = useRef<Tab | null>(null)
  useEffect(() => {
    const want = focusTab.current
    if (!want) return
    focusTab.current = null
    const raf = requestAnimationFrame(() => document.getElementById(`hero-tab-${want}`)?.focus())
    return () => cancelAnimationFrame(raf)
  }, [tab])
  const selectTab = useCallback((t: Tab) => {
    setTab(t)
    if (t === 'film') setFilmSeen(true)
  }, [])
  useEffect(() => {
    if (!film.ok && tab === 'film') setTab('live')
  }, [film.ok, tab])

  const playTour = (): void => {
    if (tab !== 'live') selectTab('live')
    if (touring) {
      client?.tour('stop')
      return
    }
    if (!tourSupported) return
    setWanted(true)
    setWantTour(true)
  }
  // Reset is always shown; it is enabled once the demo has something to undo.
  const changed = interacted || touring || !!state.tourDone || state.resetting
  const reset = (): void => {
    if (!client) return
    client.reset()
    // Queued until the rebooted demo says 'ready', so the picker and the app keep the same theme.
    client.theme(theme.id)
    setInteracted(false)
    // The button goes away once the demo is back: hand focus to the theme control, not the page.
    controlsRef.current?.querySelector<HTMLElement>('.tp-btn')?.focus()
  }
  const showReset = changed && live

  const stageVars = {
    '--plate-l': px(PLATE.x),
    '--plate-t': py(PLATE.y),
    '--plate-w': px(PLATE.w),
    '--plate-r': px(STAGE.w - PLATE.x - PLATE.w),
    '--tabs-b': pyFromBottom(TOP_RUN),
    '--tabs-w': px(TABS_W),
    '--stage-ratio': `${STAGE.w} / ${STAGE.h}`
  } as CSSProperties

  const status = touring
    ? `Tour, step ${(state.tour?.index ?? 0) + 1} of ${state.tour?.total ?? 0}: ${state.tour?.title ?? ''}`
    : null

  return (
    <div
      ref={stageRef}
      className="hs"
      data-film={film.ok ? '' : undefined}
      data-annotations={annotations}
      data-retired={interacted ? '' : undefined}
    >
      <div className="hs-drawing" style={stageVars}>
      {film.ok ? (
      <div className="hs-tabs" role="tablist" aria-label="Show the app">
        <button
          id="hero-tab-live"
          type="button"
          role="tab"
          aria-selected={tab === 'live'}
          aria-controls="hero-panel-live"
          tabIndex={tab === 'live' ? 0 : -1}
          className="hs-tab"
          onClick={() => selectTab('live')}
          onKeyDown={onTabKey}
        >
          Live demo
        </button>
        <button
          id="hero-tab-film"
          type="button"
          role="tab"
          aria-selected={tab === 'film'}
          aria-controls="hero-panel-film"
          tabIndex={tab === 'film' ? 0 : -1}
          className="hs-tab"
          onClick={() => selectTab('film')}
          onKeyDown={onTabKey}
        >
          Film{film.len ? <span className="hs-tab-len tnum">{film.len}</span> : null}
        </button>
      </div>
      ) : null}

      <div
        className="hs-plate"
        onPointerEnter={() => {
          setHovering(true)
          reach()
        }}
        onPointerLeave={() => setHovering(false)}
        onFocus={() => {
          reach()
          // Keyboard visitors tabbing into the app get the same step-back as a hovering pointer.
          if (performance.now() - lastTab.current < 600) setFocusIn(true)
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false)
        }}
      >
        <Plate className="w-full">
          <div ref={screenRef} className="hs-screen">
            <div
              id="hero-panel-live"
              role={film.ok ? 'tabpanel' : undefined}
              aria-labelledby={film.ok ? 'hero-tab-live' : undefined}
              className="absolute inset-0"
              hidden={tab !== 'live'}
            >
              {mounted ? (
                <iframe
                  ref={frame}
                  src={DEMO_SRC}
                  title="TerminalDeck, running in your browser"
                  className="hs-frame"
                  style={{ width: APP.w, height: APP.h, opacity: live && !narrow ? 1 : 0 }}
                  allow="clipboard-write"
                  tabIndex={live ? 0 : -1}
                  aria-hidden={live ? undefined : true}
                />
              ) : null}
              <img
                src={poster}
                width={APP.w}
                height={APP.h}
                alt={live && !narrow ? '' : POSTER_ALT}
                aria-hidden={live && !narrow ? true : undefined}
                decoding="async"
                {...({ fetchpriority: 'high' } as Record<string, string>)}
                className="hs-poster"
                style={{ opacity: live && !narrow ? 0 : 1 }}
                onClick={reach}
              />
              <NotchComposite stage={notchStage} hidden={notchGone} />
              <div className="hs-markers" aria-hidden="true">
                {PARTS.map((p) => (
                  <Marker
                    key={p.key}
                    letter={p.key}
                    className={cn('hs-marker', p.paneLevel && 'hs-pane-level')}
                    style={{ left: `${p.marker.x}%`, top: `calc(${p.marker.y}% + ${p.marker.dy ?? 0}px)` }}
                  />
                ))}
              </div>
              {mounted && !live && !narrow ? (
                <p className="hs-loading" role="status">
                  The live demo is loading
                </p>
              ) : null}
            </div>
            {film.ok ? (
              <div
                id="hero-panel-film"
                role="tabpanel"
                aria-labelledby="hero-tab-film"
                className="absolute inset-0"
                hidden={tab !== 'film'}
              >
                {filmSeen ? <FilmPanel active={tab === 'film'} length={film.len} /> : null}
              </div>
            ) : null}
          </div>
        </Plate>
      </div>

      <LeaderLayer viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} state={draw.state} className="hs-leaders">
        {PARTS.map((p) => (
          <g key={p.key} className={cn(p.paneLevel && 'hs-pane-level')}>
            <Leader d={p.d} end={p.end} i={p.i} casing={p.casing} />
          </g>
        ))}
      </LeaderLayer>

      <ul ref={draw.ref} className="hs-notes" aria-label="Parts of the window" data-leader-state={draw.state}>
        {PARTS.map((p) => (
          <Callout
            key={p.key}
            as="li"
            marker={p.key}
            className={cn('hs-note leader-follow', p.box.top !== undefined && 'hs-note-below', p.paneLevel && 'hs-pane-level')}
            style={
              {
                '--i': p.i,
                '--l': px(p.box.left),
                '--w': px(p.box.width),
                '--b': p.box.bottom !== undefined ? pyFromBottom(p.box.bottom) : 'auto',
                '--t': p.box.top !== undefined ? py(p.box.top) : 'auto'
              } as CSSProperties
            }
          >
            {NOTES[p.key]}
          </Callout>
        ))}
      </ul>

      </div>

      <div className="hs-controls" ref={controlsRef} hidden={tab === 'film'} onFocus={reach}>
        {narrow ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button href={DEMO_FULL_PATH} target="_blank" rel="noopener" variant="secondary" size="sm" icon="play">
                Open the demo full screen
              </Button>
            </div>
            <p className="small mt-3">
              The demo is the whole desktop app, so it wants a wide screen. It opens in a new tab; nothing is installed.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2.5">
              {tourSupported || touring ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={touring ? 'pause' : 'play'}
                  onClick={playTour}
                  disabled={avail === 'no'}
                >
                  {touring ? 'Stop the tour' : 'Play the tour'}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                icon="reset"
                onClick={reset}
                disabled={!showReset || state.resetting}
              >
                {state.resetting ? 'Resetting' : 'Reset'}
              </Button>
              <ThemePicker disabled={avail === 'no'} />
            </div>
            <p className="small hs-hint" aria-live="polite">
              {status ??
                (avail === 'no' ? (
                  "The live demo isn’t available right now, so this is a still of it."
                ) : (
                  <>
                    Click any pane and type <code>claude</code>, <code>codex</code> or <code>help</code>. It’s the real
                    app on a simulated machine: nothing is installed and nothing leaves this page.{' '}
                    <Kbd>Shift+Esc</Kbd> takes the keyboard back to the page.
                  </>
                ))}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
