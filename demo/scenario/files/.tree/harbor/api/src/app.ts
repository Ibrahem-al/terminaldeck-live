import express from 'express'
import type { Db } from './db.js'
import { requireAuth } from './middleware/auth.js'
import { errorHandler, notFound } from './middleware/errors.js'
import { requestLogger } from './middleware/logger.js'
import { healthRouter } from './routes/health.js'
import { ratesRouter } from './routes/rates.js'
import { shipmentsRouter } from './routes/shipments.js'

export interface AppDeps {
  db: Db
  /** Bearer tokens accepted by every route except /health. */
  tokens: string[]
}

export function createApp({ db, tokens }: AppDeps): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '100kb' }))
  app.use(requestLogger)

  app.use('/health', healthRouter(db))

  app.use(requireAuth(tokens))
  app.use('/rates', ratesRouter())
  app.use('/shipments', shipmentsRouter(db))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
