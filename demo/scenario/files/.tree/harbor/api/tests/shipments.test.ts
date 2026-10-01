import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { auth, createMemoryDb, makeShipment, testApp } from './helpers.js'

describe('shipments', () => {
  it('lists newest first and filters by status', async () => {
    const db = createMemoryDb([
      makeShipment({ reference: 'old', createdAt: '2026-09-01T10:00:00.000Z' }),
      makeShipment({ reference: 'new', createdAt: '2026-09-20T10:00:00.000Z' }),
      makeShipment({ reference: 'done', status: 'delivered', createdAt: '2026-09-21T10:00:00.000Z' })
    ])
    const app = testApp(db)

    const all = await request(app).get('/shipments').set(auth)
    expect(all.body.items.map((s: { reference: string }) => s.reference)).toEqual(['done', 'new', 'old'])

    const delivered = await request(app).get('/shipments?status=delivered').set(auth)
    expect(delivered.body.items).toHaveLength(1)
  })

  it('404s for an unknown id', async () => {
    const res = await request(testApp()).get('/shipments/does-not-exist').set(auth)
    expect(res.status).toBe(404)
  })

  it('books a shipment and records status changes', async () => {
    const app = testApp()
    const created = await request(app).post('/shipments').set(auth).send({
      reference: 'PO-2201',
      carrier: 'fedex',
      service: 'express',
      originZip: '60601',
      destZip: '73301',
      weightGrams: 900,
      priceCents: 2412,
      eta: '2026-10-01'
    })
    expect(created.status).toBe(201)
    expect(created.headers.location).toBe(`/shipments/${created.body.id}`)
    expect(created.body.status).toBe('booked')

    const moved = await request(app)
      .patch(`/shipments/${created.body.id}/status`)
      .set(auth)
      .send({ status: 'picked_up', note: 'Chicago hub' })
    expect(moved.body.status).toBe('picked_up')

    const detail = await request(app).get(`/shipments/${created.body.id}`).set(auth)
    expect(detail.body.events).toEqual([expect.objectContaining({ status: 'picked_up', note: 'Chicago hub' })])
  })
})
