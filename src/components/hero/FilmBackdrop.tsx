import { useEffect, useRef, useState } from 'react'
import { MEDIA } from '../../lib/links'
import { useReducedMotion } from '../../lib/useReducedMotion'

/**
 * The 15-second teaser as the hero's moving background: muted, looping, never interactive.
 * Reduced motion or Save-Data gets the still poster instead, and the loop pauses while the hero is
 * off screen so it costs nothing further down the page.
 */
export function FilmBackdrop() {
  const reduced = useReducedMotion()
  const video = useRef<HTMLVideoElement>(null)
  const [saveData] = useState(
    () => typeof navigator !== 'undefined' && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  )
  const still = reduced || saveData

  useEffect(() => {
    const v = video.current
    if (!v || still) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) void v.play().catch(() => {})
      else v.pause()
    })
    io.observe(v)
    return () => io.disconnect()
  }, [still])

  return (
    <div className="backdrop" aria-hidden="true">
      {still ? (
        <img src={MEDIA.poster} alt="" className="backdrop-media" decoding="async" />
      ) : (
        <video ref={video} className="backdrop-media" autoPlay muted loop playsInline preload="auto" poster={MEDIA.poster}>
          <source src={MEDIA.teaser.webm} type="video/webm" />
          <source src={MEDIA.teaser.mp4} type="video/mp4" />
        </video>
      )}
      <div className="backdrop-scrim" />
    </div>
  )
}
