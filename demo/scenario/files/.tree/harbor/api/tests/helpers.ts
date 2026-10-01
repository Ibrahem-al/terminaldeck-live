import { randomUUID } from 'node:crypto'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db.js'
import type { Shipment, TrackingEvent } from '../src/types.js'

export const TOKEN = 'test-token'
export const auth = { Authorization: `Bearer ${TOKEN}` }

/** An in-memory Db with the same contract as the Postgres one. */
export function createMemoryDb(seed: Shipment[] = []): Db & { shipments: Map<string, Shipment> } {
  const shipments = new Map(seed.map((s) => [s.id, s]))
  const events = new Map<string, TrackingEvent[]>()

  return {
    shipments,
    ping: async () => true,
    async listShipments({ status, limit, offset }) {
      return [...shipments.values()]
        .filter((s) => !status || s.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(offset, offset + limit)
    },
    async getShipment(id) {
      const s = shipments.get(id)
      return s ? { ...s, events: events.get(id) ?? [] } : null
    },
    async createShipment(input) {
      const s: Shipment = { ...input, id: randomUUID(), status: 'booked', createdAt: new Date().toISOString() }
      shipments.set(s.id, s)
      return s
    },
    async updateStatus(id, status, note) {
      const s = shipments.get(id)
      if (!s) return null
      const next = { ...s, status }
      shipments.set(id, next)
      events.set(id, [...(events.get(id) ?? []), { status, note: note ?? null, at: new Date().toISOString() }])
      return next
    },
    close: async () => {}
  }
}

export function makeShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: randomUUID(),
    reference: 'PO-1042',
    carrier: 'ups',
    service: 'ground',
    status: 'in_transit',
    originZip: '94107',
    destZip: '10001',
    weightGrams: 2300,
    priceCents: 1874,
    eta: '2026-10-02',
    createdAt: '2026-09-25T15:04:00.000Z',
    ...overrides
  }
}

export function testApp(db: Db = createMemoryDb()) {
  return createApp({ db, tokens: [TOKEN] })
}
