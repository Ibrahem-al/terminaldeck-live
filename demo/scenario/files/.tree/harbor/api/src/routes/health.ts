import { Router } from 'express'
import type { Db } from '../db.js'

const startedAt = Date.now()

export function healthRouter(db: Db): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    const database = await db.ping()
    res.status(database ? 200 : 503).json({
      ok: database,
      database,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      version: process.env.npm_package_version ?? 'dev'
    })
  })

  return router
}
