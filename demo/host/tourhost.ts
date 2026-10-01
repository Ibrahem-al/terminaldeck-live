/**
 * Drives the guided tour: one run at a time, aborted the instant the visitor
 * presses a key or clicks inside the demo, with progress posted to the site.
 */
import type { Backend, DemoEvent, TdStores, TourContext, TourHost, TourRunner } from '../backend/contracts'
import type { PointerTracker } from './pointer'

const abortError = (): DOMException => new DOMException('The tour was stopped', 'AbortError')

export function createTourHost(opts: {
  backend: () => Backend
  app: () => TdStores | null
  post: (e: DemoEvent) => void
  tracker: PointerTracker
}): TourHost {
  let runner: TourRunner | null = null
  let controller: AbortController | null = null

  const host: TourHost = {
    register(next) {
      runner = next
    },
    get running() {
      return controller !== null
    },
    start() {
      if (!runner || controller) return
      const active = runner
      const ctrl = new AbortController()
      controller = ctrl
      const timers = opts.backend().clock.group()
      let index = 0

      // The visitor takes over: a real key or click anywhere in the demo ends the tour.
      const stopOnInput = opts.tracker.on((e) => {
        // The reason says how: a key also landed in the focused pane, a click moved focus itself.
        if (e.trusted && (e.kind === 'key' || e.kind === 'down')) ctrl.abort(e.kind)
      })

      const ctx: TourContext = {
        backend: opts.backend(),
        app: opts.app,
        signal: ctrl.signal,
        sleep: (ms) =>
          new Promise<void>((resolve, reject) => {
            if (ctrl.signal.aborted) return reject(abortError())
            const onAbort = (): void => {
              timers.clear(id)
              reject(abortError())
            }
            // A sleep that ends normally takes its abort listener with it.
            const id = timers.setTimeout(() => {
              ctrl.signal.removeEventListener('abort', onAbort)
              resolve()
            }, ms)
            ctrl.signal.addEventListener('abort', onAbort, { once: true })
          }),
        step: (title) => opts.post({ type: 'tour-step', index: index++, total: active.total, title })
      }

      const finish = (completed: boolean): void => {
        stopOnInput()
        timers.dispose()
        if (controller === ctrl) controller = null
        opts.post({ type: 'tour-done', completed })
      }
      active.run(ctx).then(
        () => finish(!ctrl.signal.aborted),
        (err: unknown) => {
          if (!(err instanceof DOMException && err.name === 'AbortError')) console.error('[demo] tour failed', err)
          finish(false)
        }
      )
    },
    stop() {
      controller?.abort()
    }
  }
  return host
}
