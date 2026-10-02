import { useCallback, useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { MEDIA } from '../../lib/links'
import { useInView } from '../../lib/useInView'

/** "Watch the film" anywhere on the page sends this; the section scrolls itself in and plays. */
export const FILM_EVENT = 'td:film'

const CHAPTERS = MEDIA.chapters.map((c, i) => ({
  ...c,
  end: MEDIA.chapters[i + 1]?.at ?? 80,
  still: `./media/chapters/c${c.at}.jpg`
}))

function clock(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/**
 * The screening room. Where the workbench above is hands-on, this is lean-back: a true-black band,
 * the screen opens out of a letterbox slit the first time it scrolls in, and the film plays in
 * place with sound. The reel under it is the film's chapters; the current one fills as it plays.
 */
export function Film() {
  const video = useRef<HTMLVideoElement>(null)
  const [screenRef, open] = useInView<HTMLDivElement>(0.35)
  const [started, setStarted] = useState(false)
  const [time, setTime] = useState(0)

  const play = useCallback((at?: number) => {
    const v = video.current
    if (!v) return
    setStarted(true)
    if (at !== undefined) v.currentTime = at
    void v.play().catch(() => {})
  }, [])

  useEffect(() => {
    const on = (): void => {
      screenRef.current?.scrollIntoView({ block: 'center' })
      play()
    }
    window.addEventListener(FILM_EVENT, on)
    return () => window.removeEventListener(FILM_EVENT, on)
  }, [play, screenRef])

  // Scrolling the screen out of sight pauses the film; it never resumes on its own.
  useEffect(() => {
    const v = video.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && !v.paused) v.pause()
    })
    io.observe(v)
    return () => io.disconnect()
  }, [])

  const current = CHAPTERS.findIndex((c) => time >= c.at && time < c.end)

  return (
    <section id="film" aria-labelledby="film-title" className="cinema" data-open={open ? '' : undefined}>
      <div className="wrap cinema-credits">
        <h2 id="film-title" className="h2 cinema-title">
          TerminalDeck in eighty seconds
        </h2>
        <p className="cinema-sub">Every frame is the app’s own interface, cut to an original score. Sound on.</p>
      </div>

      <div ref={screenRef} className="cinema-screen">
        <video
          ref={video}
          className="cinema-video"
          controls={started}
          playsInline
          preload="none"
          poster={MEDIA.poster}
          aria-label={`The TerminalDeck film, ${MEDIA.filmLength}`}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => setStarted(true)}
        >
          <source src={MEDIA.film.webm} type="video/webm" />
          <source src={MEDIA.film.mp4} type="video/mp4" />
        </video>
        {!started ? (
          <button type="button" className="cinema-play" onClick={() => play(0)}>
            <span className="cinema-play-disc" aria-hidden="true">
              <Play size={30} strokeWidth={2} fill="currentColor" />
            </span>
            <span className="cinema-play-label">
              Play the film <span className="tnum">{MEDIA.filmLength}</span>
            </span>
          </button>
        ) : null}
      </div>

      <ol className="wrap reel" aria-label="Chapters">
        {CHAPTERS.map((c, i) => {
          const progress = i < current ? 1 : i === current ? (time - c.at) / (c.end - c.at) : 0
          return (
            <li key={c.at} className="reel-item" style={{ '--i': i } as React.CSSProperties}>
              <button
                type="button"
                className="reel-btn"
                onClick={() => play(c.at)}
                aria-current={i === current ? 'true' : undefined}
              >
                <img src={c.still} alt="" width={480} height={270} loading="lazy" decoding="async" className="reel-still" />
                <span className="reel-meta">
                  <span className="reel-time tnum">{clock(c.at)}</span>
                  <span className="reel-title">{c.title}</span>
                </span>
                <span className="reel-progress" aria-hidden="true">
                  <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
