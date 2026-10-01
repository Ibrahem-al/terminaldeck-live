import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { auth, testApp } from './helpers.js'

describe('bearer auth', () => {
  const app = testApp()

  it('rejects a request without a token', async () => {
    const res = await request(app).get('/shipments')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('missing bearer token')
  })

  it('rejects an unknown token', async () => {
    const res = await request(app).get('/shipments').set('Authorization', 'Bearer nope')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid token')
  })

  it('accepts a configured token', async () => {
    const res = await request(app).get('/shipments').set(auth)
    expect(res.status).toBe(200)
  })
})
