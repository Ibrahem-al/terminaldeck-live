import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createMemoryDb, testApp } from './helpers.js'

describe('GET /health', () => {
  it('reports ok without a token', async () => {
    const res = await request(testApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, database: true })
  })

  it('returns 503 when the database is down', async () => {
    const db = { ...createMemoryDb(), ping: async () => false }
    const res = await request(testApp(db)).get('/health')
    expect(res.status).toBe(503)
    expect(res.body.ok).toBe(false)
  })
})
