import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { auth, testApp } from './helpers.js'

const parcel = { weightGrams: 2300, lengthCm: 30, widthCm: 20, heightCm: 15 }

describe('POST /rates/quote', () => {
  const app = testApp()

  it('quotes every carrier, cheapest first', async () => {
    const res = await request(app)
      .post('/rates/quote')
      .set(auth)
      .send({ originZip: '94107', destZip: '10001', parcel })
    expect(res.status).toBe(200)
    const prices = res.body.quotes.map((q: { priceCents: number }) => q.priceCents)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    expect(res.body.cheapest).toEqual(res.body.quotes[0])
    expect(new Set(res.body.quotes.map((q: { carrier: string }) => q.carrier))).toEqual(
      new Set(['ups', 'fedex', 'dhl', 'usps'])
    )
  })

  it('rejects a malformed ZIP', async () => {
    const res = await request(app)
      .post('/rates/quote')
      .set(auth)
      .send({ originZip: '941', destZip: '10001', parcel })
    expect(res.status).toBe(400)
    expect(res.body.details[0]).toMatchObject({ path: 'originZip', message: 'must be a 5-digit ZIP' })
  })

  it('rejects a parcel over 70 kg', async () => {
    const res = await request(app)
      .post('/rates/quote')
      .set(auth)
      .send({ originZip: '94107', destZip: '10001', parcel: { ...parcel, weightGrams: 71_000 } })
    expect(res.status).toBe(400)
  })
})

describe('GET /rates/carriers', () => {
  it('lists carriers with their services', async () => {
    const res = await request(testApp()).get('/rates/carriers').set(auth)
    expect(res.status).toBe(200)
    expect(res.body).toContainEqual({ id: 'dhl', name: 'DHL', services: ['express'] })
  })
})
