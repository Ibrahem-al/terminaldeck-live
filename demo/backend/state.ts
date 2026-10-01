/**
 * The app's persisted state and small process-wide facts: settings, projects,
 * the saved session, app version, updater, notification config, power source
 * and blackout. Everything persists to DemoStorage so a reload keeps it.
 */
import {
  DEFAULT_NOTIFY_CONFIG,
  DEFAULT_SETTINGS,
  type AppSettings,
  type NotifyConfig,
  type Project,
  type UpdateStatusPayload
} from '@shared/types'
import type { Backend, BlackoutService, CommandModule, ModuleInstance, StateService } from './contracts'

const KEY = {
  settings: 'settings',
  projects: 'projects',
  session: 'session',
  notify: 'notify-config'
} as const

/** The renderer's own merge (store/settings.ts `withDefaults`): per section, stored keys over defaults. */
function withDefaults(stored: unknown): AppSettings {
  const incoming = stored as Record<string, unknown> | null | undefined
  const merged: Record<string, unknown> = {}
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const section = incoming?.[key]
    merged[key] = section && typeof section === 'object' ? { ...fallback, ...section } : { ...fallback }
  }
  return merged as unknown as AppSettings
}

const copy = <T>(value: T): T => structuredClone(value)

export function createState(backend: Backend): ModuleInstance<StateService> & { blackout: BlackoutService } {
  const { storage, scenario } = backend

  let settings: AppSettings = withDefaults(storage.get(KEY.settings) ?? scenario.settings)
  let projects: Project[] = storage.get<Project[]>(KEY.projects) ?? copy(scenario.projects)
  let session: unknown = storage.get(KEY.session) ?? copy(scenario.session)
  let notify: NotifyConfig = storage.get<NotifyConfig>(KEY.notify) ?? { ...DEFAULT_NOTIFY_CONFIG }
  let update: UpdateStatusPayload = { state: 'idle' }
  let checking: Promise<UpdateStatusPayload> | null = null

  const settingsListeners = new Set<(next: AppSettings, prev: AppSettings) => void>()

  const saveProjects = (): void => storage.set(KEY.projects, projects)

  const setUpdate = (status: UpdateStatusPayload): void => {
    update = status
    backend.events.emit('update:status', status)
  }

  /* ── blackout ── */
  let blackoutActive = false
  const blackoutListeners = new Set<(active: boolean) => void>()
  const blackout: BlackoutService = {
    get active() {
      return blackoutActive
    },
    start() {
      if (blackoutActive) return
      blackoutActive = true
      backend.host.blackout.show()
      backend.events.emit('blackout:state', true)
      for (const cb of blackoutListeners) cb(true)
    },
    lift() {
      if (!blackoutActive) return
      blackoutActive = false
      backend.host.blackout.hide()
      backend.events.emit('blackout:state', false)
      for (const cb of blackoutListeners) cb(false)
    },
    onChange(cb) {
      blackoutListeners.add(cb)
      return () => blackoutListeners.delete(cb)
    }
  }

  const commands: CommandModule = {
    settings_load: () => settings,
    settings_save: ({ settings: next }: { settings: AppSettings }) => {
      const prev = settings
      settings = withDefaults(copy(next))
      storage.set(KEY.settings, settings)
      for (const cb of settingsListeners) cb(settings, prev)
      return null
    },

    projects_list: () => projects,
    projects_save: ({ project }: { project: Project }) => {
      const next = copy(project)
      const i = projects.findIndex((p) => p.id === next.id)
      projects = i >= 0 ? projects.map((p, j) => (j === i ? next : p)) : [...projects, next]
      saveProjects()
      return null
    },
    projects_touch: ({ id, lastOpenedAt }: { id: string; lastOpenedAt: number }) => {
      projects = projects.map((p) => (p.id === id ? { ...p, lastOpenedAt } : p))
      saveProjects()
      return null
    },
    projects_delete: ({ id }: { id: string }) => {
      projects = projects.filter((p) => p.id !== id)
      saveProjects()
      return null
    },

    session_load: () => session,
    session_save: ({ session: next }: { session: unknown }) => {
      session = copy(next)
      storage.set(KEY.session, session)
      return null
    },

    app_version: () => backend.version,

    // Rust's updater: a launch check goes checking → not-available on the feed.
    update_get_current: () => update,
    update_check: () => {
      checking ??= new Promise<UpdateStatusPayload>((resolve) => {
        setUpdate({ state: 'checking' })
        backend.clock.group().setTimeout(() => {
          setUpdate({ state: 'not-available', version: backend.version })
          checking = null
          resolve(update)
        }, 900)
      })
      return checking
    },
    update_download: () => {
      throw 'No update is available.'
    },
    update_install: () => null,

    notify_get_config: () => notify,
    notify_set_config: ({ cfg }: { cfg: NotifyConfig }) => {
      notify = { ...DEFAULT_NOTIFY_CONFIG, ...copy(cfg) }
      storage.set(KEY.notify, notify)
      return notify
    },

    power_source: () => false,

    blackout_now: () => {
      blackout.start('manual')
      return null
    },
    blackout_dismiss: () => {
      blackout.lift()
      return null
    },
    blackout_state: () => blackoutActive
  }

  const service: StateService = {
    settings: () => settings,
    onSettings(cb) {
      settingsListeners.add(cb)
      return () => settingsListeners.delete(cb)
    },
    projects: () => projects,
    project: (id) => projects.find((p) => p.id === id),
    session: () => session
  }

  return { service, commands, blackout }
}
