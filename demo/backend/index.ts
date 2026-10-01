/**
 * The simulated Rust process: one Backend per demo, living in the host page
 * as `window.__tdBackend`. Owns the frame registry and the command router;
 * every behaviour lives in a module (see contracts.ts for who owns what).
 */
import type {
  Backend,
  BlackoutService,
  CommandHandler,
  CommandModule,
  DeckTools,
  EventBus,
  HostBridge,
  MiscService,
  ModuleInstance,
  NotchController,
  PhoneService,
  ProgramRegistry,
  PtyManager,
  Scenario,
  ShellFactory,
  StateService,
  Vfs,
  WindowLabel,
  WindowService
} from './contracts'
import { createEventBus } from './events'
import { createClock, createStorage } from './runtime'
import { createNullHost } from './nullhost'
import { createState } from './state'
import { createWindows } from './windows'
import { createVfs } from './vfs'
import { createPtyManager } from './pty'
import { createShells } from './shell'
import { createPrograms } from './programs'
import { createNotch } from './notch'
import { createDeckTools } from './decktools'
import { createPhone } from './phone'
import { createMisc } from './misc'
import { scenario as defaultScenario } from '../scenario'

export const APP_VERSION = '0.3.9'

interface RoutedCommand {
  module: string
  handler: CommandHandler
}

class DemoBackend implements Backend {
  readonly version = APP_VERSION
  readonly events: EventBus
  readonly storage = createStorage()
  readonly clock = createClock()
  readonly scenario: Scenario
  host: HostBridge

  readonly state: StateService
  readonly blackout: BlackoutService
  readonly windows: WindowService
  readonly vfs: Vfs
  readonly pty: PtyManager
  readonly shells: ShellFactory
  readonly programs: ProgramRegistry
  readonly notch: NotchController
  readonly deck: DeckTools
  readonly phone: PhoneService
  readonly misc: MiscService

  private readonly frameWindows = new Map<WindowLabel, Window>()
  private readonly frameDocs = new Map<WindowLabel, Document>()
  private readonly routes = new Map<string, RoutedCommand>()
  private readonly warned = new Set<string>()
  private readonly invokeTaps = new Set<(label: WindowLabel, cmd: string, args: unknown) => void>()
  private readonly modules: Array<{ name: string; instance: ModuleInstance<unknown> }> = []

  constructor(scenario: Scenario) {
    this.scenario = scenario
    this.host = createNullHost(() => this)
    this.events = createEventBus((label) => this.frameWindows.get(label))

    // Factories only capture `this`; services are reached lazily once all exist.
    const state = this.use('state', createState(this))
    this.state = state.service
    this.blackout = state.blackout
    this.windows = this.use('windows', createWindows(this)).service
    this.vfs = this.use('vfs', createVfs(this)).service
    this.pty = this.use('pty', createPtyManager(this)).service
    this.shells = this.use('shell', createShells(this)).service
    this.programs = this.use('programs', createPrograms(this)).service
    this.notch = this.use('notch', createNotch(this)).service
    this.deck = this.use('decktools', createDeckTools(this)).service
    this.phone = this.use('phone', createPhone(this)).service
    this.misc = this.use('misc', createMisc(this)).service

    for (const { name, instance } of this.modules) {
      try {
        instance.start?.()
      } catch (err) {
        console.error(`[demo] module ${name} failed to start`, err)
      }
    }
  }

  private use<M extends ModuleInstance<unknown>>(name: string, instance: M): M {
    this.modules.push({ name, instance })
    this.register(name, instance.commands)
    return instance
  }

  setHost(host: HostBridge): void {
    this.host = host
  }

  register(moduleName: string, commands: CommandModule): void {
    for (const [cmd, handler] of Object.entries(commands)) {
      this.routes.set(cmd, { module: moduleName, handler })
    }
  }

  onInvoke(cb: (label: WindowLabel, cmd: string, args: unknown) => void): () => void {
    this.invokeTaps.add(cb)
    return () => this.invokeTaps.delete(cb)
  }

  async invoke(label: WindowLabel, cmd: string, args: unknown): Promise<unknown> {
    // Real IPC never answers inside the caller's stack.
    await Promise.resolve()
    for (const tap of this.invokeTaps) {
      try {
        tap(label, cmd, args)
      } catch (err) {
        console.error('[demo] invoke tap failed', err)
      }
    }
    const route = this.routes.get(cmd)
    if (!route) {
      if (!this.warned.has(cmd)) {
        this.warned.add(cmd)
        console.warn('[demo] unhandled command', cmd)
      }
      return null
    }
    try {
      const result = await route.handler(args ?? {}, { label, backend: this })
      return cloneResult(result)
    } catch (err) {
      // A Rust command error arrives as a plain string.
      throw typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)
    }
  }

  attach(label: WindowLabel, win: Window): void {
    // An iframe's WindowProxy survives navigation, so a reload is told apart by its document.
    const prevDoc = this.frameDocs.get(label)
    if (prevDoc && prevDoc !== win.document) this.dropFrame(label)
    this.frameWindows.set(label, win)
    this.frameDocs.set(label, win.document)
    for (const { name, instance } of this.modules) {
      try {
        instance.frameAttached?.(label)
      } catch (err) {
        console.error(`[demo] ${name}.frameAttached(${label}) failed`, err)
      }
    }
  }

  detach(label: WindowLabel, win?: Window): void {
    if (!this.frameWindows.has(label)) return
    if (win && this.frameDocs.get(label) !== win.document) return
    this.frameWindows.delete(label)
    this.frameDocs.delete(label)
    this.dropFrame(label)
  }

  private dropFrame(label: WindowLabel): void {
    this.events.resetFrame(label)
    for (const { name, instance } of this.modules) {
      try {
        instance.frameDetached?.(label)
      } catch (err) {
        console.error(`[demo] ${name}.frameDetached(${label}) failed`, err)
      }
    }
  }

  frame(label: WindowLabel): Window | undefined {
    return this.frameWindows.get(label)
  }

  frames(): WindowLabel[] {
    return [...this.frameWindows.keys()]
  }
}

/** IPC hands the renderer a fresh copy; so do we (a stored object must never be shared). */
function cloneResult(value: unknown): unknown {
  if (value === undefined) return null
  if (value === null || typeof value !== 'object') return value
  try {
    return structuredClone(value)
  } catch {
    return value
  }
}

export function createBackend(scenario: Scenario = defaultScenario): Backend {
  return new DemoBackend(scenario)
}

declare global {
  interface Window {
    __tdBackend?: Backend
  }
}
