/**
 * Phone access (Settings → Phone), simulated end to end the way
 * src-tauri/src/phone drives it: switching it on downloads the runtime once
 * (progress in `phone:status-changed`), starts the server, and reports
 * "Running on port 8792". The addresses, the firewall check with its Allow
 * button, and pairing links (which the renderer turns into a QR code) all
 * answer with the shapes the real sidecar gives.
 */
import type { AppSettings, PhoneAddress, PhoneFirewallState, PhonePairing, PhoneStatus } from '@shared/types'
import type { Backend, CommandModule, ModuleInstance, PhoneService, Timers } from './contracts'

const KEY = 'phone'
const SIDECAR_VERSION = '0.0.21-td.3'
/** A pairing link works once, for this long. */
const PAIRING_TTL_MS = 10 * 60_000
/** The phone-runtime download: about 40 MB on a decent line. */
const DOWNLOAD_STEP_MS = 260
const START_MS = 1100
const FIREWALL_CHECK_MS = 1200
/** The UAC prompt and the rule change. */
const FIREWALL_ALLOW_MS = 1800

interface Persisted {
  installed: boolean
  firewall: PhoneFirewallState
}

/** LAN adapters with a gateway first, Tailscale next, virtual switches last (phone/net.rs). */
const ADDRESSES: PhoneAddress[] = [
  { ip: '192.168.1.20', kind: 'lan', adapter: 'Wi-Fi' },
  { ip: '100.101.102.103', kind: 'tailscale', adapter: 'Tailscale' },
  { ip: '172.29.160.1', kind: 'other', adapter: 'vEthernet (WSL)' }
]

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function pairingToken(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('')
}

export function createPhone(backend: Backend): ModuleInstance<PhoneService> {
  const saved = backend.storage.get<Persisted>(KEY)
  const persisted: Persisted = { installed: saved?.installed ?? false, firewall: saved?.firewall ?? 'noRule' }
  const save = (): void => backend.storage.set(KEY, persisted)

  let status: PhoneStatus = { kind: 'off', port: null, error: null, version: null, progress: null }
  let flow: Timers | null = null

  const phoneSettings = (): AppSettings['phone'] => backend.state.settings().phone

  const setStatus = (next: PhoneStatus): void => {
    status = next
    backend.events.emit('phone:status-changed', status)
  }

  const stop = (): void => {
    flow?.dispose()
    flow = null
  }

  /** The sidecar supervisor: (download once →) start → running, for the current port. */
  const run = async (instant = false): Promise<void> => {
    stop()
    const t = backend.clock.group()
    flow = t
    const port = phoneSettings().port
    if (!persisted.installed) {
      for (let pct = 0; pct < 100; pct += 3 + Math.floor(Math.random() * 6)) {
        setStatus({ kind: 'installing', port: null, error: null, version: null, progress: pct })
        await t.sleep(DOWNLOAD_STEP_MS)
      }
      setStatus({ kind: 'installing', port: null, error: null, version: null, progress: 100 })
      await t.sleep(DOWNLOAD_STEP_MS)
      persisted.installed = true
      save()
    }
    if (!instant) {
      setStatus({ kind: 'starting', port: null, error: null, version: SIDECAR_VERSION, progress: null })
      await t.sleep(START_MS)
    }
    setStatus({ kind: 'running', port, error: null, version: SIDECAR_VERSION, progress: null })
    if (flow === t) flow = null
    t.dispose()
  }

  const commands: CommandModule = {
    phone_status: () => status,
    phone_addresses: () => ADDRESSES,
    phone_firewall_status: async (): Promise<PhoneFirewallState> => {
      await backend.clock.group().sleep(FIREWALL_CHECK_MS)
      return status.kind === 'running' ? persisted.firewall : 'unknown'
    },
    phone_firewall_allow: async () => {
      await backend.clock.group().sleep(FIREWALL_ALLOW_MS)
      persisted.firewall = 'allowed'
      save()
      return null
    },
    phone_pairing_new: async ({ address }: { address: string | null }): Promise<PhonePairing> => {
      if (status.kind !== 'running' || !status.port) throw "The phone server isn't running."
      const wanted = address || phoneSettings().address
      const chosen = ADDRESSES.find((a) => a.ip === wanted) ?? ADDRESSES[0]
      await backend.clock.group().sleep(450)
      const token = pairingToken()
      return {
        url: `http://${chosen.ip}:${status.port}/pair#token=${token}`,
        token,
        address: chosen.ip,
        adapter: chosen.adapter,
        expiresAt: new Date(Date.now() + PAIRING_TTL_MS).toISOString()
      }
    }
  }

  return {
    service: { status: () => status },
    commands,
    start() {
      // Phone access left on in this tab: the server comes back as the app starts.
      if (phoneSettings().enabled) void run(persisted.installed)
      backend.state.onSettings((next, prev) => {
        const on = next.phone.enabled
        if (on && (!prev.phone.enabled || next.phone.port !== prev.phone.port)) {
          void run()
        } else if (!on && prev.phone.enabled) {
          stop()
          setStatus({ kind: 'off', port: null, error: null, version: null, progress: null })
        }
      })
    }
  }
}
