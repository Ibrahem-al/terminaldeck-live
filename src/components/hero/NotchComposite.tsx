import { cn } from '../../lib/cn'

/**
 * The Notch, composited at the top centre of the demo's screen for the load moment:
 * the working pill blinks, then the question alert slides down (200 ms, the app's own timing).
 * Product pixels, so it uses the app's face and its hard-coded glass and brass (the real notch
 * is not themed). Sized in demo pixels: 1 unit = the plate's width / 1280 (container units).
 * Decorative: the live demo has its own notch, so this is aria-hidden and retires once the
 * visitor starts using the demo.
 */
export function NotchComposite({ stage, hidden }: { stage: 'pill' | 'alert'; hidden: boolean }) {
  return (
    <div className={cn('hn', hidden && 'hn-gone')} data-stage={stage} aria-hidden="true">
      <div className="hn-pill">
        <i className="hn-dot" />
        <span>3</span>
      </div>
      <div className="hn-alert">
        <b className="hn-q">?</b>
        <span>
          <b>Claude Code</b> needs your permission to use Bash
        </span>
        <i className="hn-badge">3</i>
      </div>
    </div>
  )
}
