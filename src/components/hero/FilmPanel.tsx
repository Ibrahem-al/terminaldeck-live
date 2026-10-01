import { useEffect, useRef, useState } from 'react'
import { MEDIA } from '../../lib/links'
import { mediaAvailable } from '../../lib/demo'
import poster from './demo-poster.webp'
import { APP } from './geometry'

type FilmState = 'checking' | 'ready' | 'missing'

/**
 * The film, inside the same plate as the live demo. It checks the file exists before showing a
 * <video> (a 404 source would leave a blank box), and never autoplays: the visitor presses play.
 * Leaving the tab pauses it.
 */
export function FilmPanel({ active, length }: { active: boolean; length?: string | null }) {
  const [state, setState] = useState<FilmState>('checking')
  const [posterSrc, setPosterSrc] = useState<string>(poster)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!active || state !== 'checking') return
    const ac = new AbortController()
    Promise.all([mediaAvailable(MEDIA.film.mp4, ac.signal), mediaAvailable(MEDIA.poster, ac.signal)]).then(([film, still]) => {
      if (ac.signal.aborted) return
      if (still) setPosterSrc(MEDIA.poster)
      setState(film ? 'ready' : 'missing')
    })
    return () => ac.abort()
  }, [active, state])

  useEffect(() => {
    if (!active) video.current?.pause()
  }, [active])

  if (state === 'ready') {
    return (
      <video
        ref={video}
        className="absolute inset-0 h-full w-full bg-deep object-contain"
        controls
        playsInline
        preload="metadata"
        poster={posterSrc}
        aria-label={length ? `The TerminalDeck film, ${length}` : "The TerminalDeck film"}
      >
        <source src={MEDIA.film.mp4} type="video/mp4" />
        <source src={MEDIA.film.webm} type="video/webm" />
      </video>
    )
  }

  return (
    <div className="absolute inset-0">
      <img src={posterSrc} width={APP.w} height={APP.h} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
      <div className="absolute inset-0 grid place-items-center p-6 text-center">
        <p className="max-w-[30ch] text-14 leading-snug text-deep-ink-2" role="status">
          {state === 'checking' ? 'Finding the film' : 'The film is not published yet. The Live demo tab has the real app to try.'}
        </p>
      </div>
    </div>
  )
}
