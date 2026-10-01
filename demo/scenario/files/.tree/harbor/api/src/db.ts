import pg from 'pg'
import type { NewShipment, Shipment, ShipmentStatus, TrackingEvent } from './types.js'

/** Everything the routes need from storage — Postgres in production, memory in tests. */
export interface Db {
  ping(): Promise<boolean>
  listShipments(opts: { status?: ShipmentStatus; limit: number; offset: number }): Promise<Shipment[]>
  getShipment(id: string): Promise<(Shipment & { events: TrackingEvent[] }) | null>
  createShipment(input: NewShipment): Promise<Shipment>
  updateStatus(id: string, status: ShipmentStatus, note?: string): Promise<Shipment | null>
  close(): Promise<void>
}

const SHIPMENT_COLUMNS = `
  id, reference, carrier, service, status,
  origin_zip AS "originZip", dest_zip AS "destZip",
  weight_grams AS "weightGrams", price_cents AS "priceCents",
  eta, created_at AS "createdAt"`

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 })

  return {
    async ping() {
      try {
        await pool.query('SELECT 1')
        return true
      } catch {
        return false
      }
    },

    async listShipments({ status, limit, offset }) {
      const { rows } = await pool.query<Shipment>(
        `SELECT ${SHIPMENT_COLUMNS} FROM shipments
         WHERE ($1::text IS NULL OR status = $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [status ?? null, limit, offset]
      )
      return rows
    },

    async getShipment(id) {
      const { rows } = await pool.query<Shipment>(`SELECT ${SHIPMENT_COLUMNS} FROM shipments WHERE id = $1`, [id])
      const shipment = rows[0]
      if (!shipment) return null
      const events = await pool.query<TrackingEvent>(
        `SELECT status, note, at FROM tracking_events WHERE shipment_id = $1 ORDER BY at`,
        [id]
      )
      return { ...shipment, events: events.rows }
    },

    async createShipment(input) {
      const { rows } = await pool.query<Shipment>(
        `INSERT INTO shipments (reference, carrier, service, status, origin_zip, dest_zip, weight_grams, price_cents, eta)
         VALUES ($1, $2, $3, 'booked', $4, $5, $6, $7, $8)
         RETURNING ${SHIPMENT_COLUMNS}`,
        [input.reference, input.carrier, input.service, input.originZip, input.destZip, input.weightGrams, input.priceCents, input.eta]
      )
      return rows[0]!
    },

    async updateStatus(id, status, note) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows } = await client.query<Shipment>(
          `UPDATE shipments SET status = $2 WHERE id = $1 RETURNING ${SHIPMENT_COLUMNS}`,
          [id, status]
        )
        if (rows[0]) {
          await client.query(`INSERT INTO tracking_events (shipment_id, status, note) VALUES ($1, $2, $3)`, [id, status, note ?? null])
        }
        await client.query('COMMIT')
        return rows[0] ?? null
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    },

    close: () => pool.end()
  }
}
