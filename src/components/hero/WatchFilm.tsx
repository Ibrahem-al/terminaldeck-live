import { MEDIA } from '../../lib/links'
import { Button } from '../ui/Button'
import { FILM_EVENT } from '../sections/Film'

/**
 * "Watch the film": the film has its own place further down the page. The link still works without
 * script (it jumps to #film); with script, the film section scrolls itself in and starts playing,
 * the click being the gesture that allows sound.
 */
export function WatchFilm({ className }: { className?: string }) {
  return (
    <Button
      href="#film"
      variant="secondary"
      size="lg"
      icon="play"
      className={className}
      onClick={(e) => {
        e.preventDefault()
        window.dispatchEvent(new Event(FILM_EVENT))
      }}
    >
      Watch the film <span className="tnum opacity-70">{MEDIA.filmLength}</span>
    </Button>
  )
}
