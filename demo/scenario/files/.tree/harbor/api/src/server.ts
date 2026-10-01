import { createApp } from './app.js'
import { config } from './config.js'
import { createPgDb } from './db.js'
import { logger } from './middleware/logger.js'

const db = createPgDb(config.databaseUrl)
const app = createApp({ db, tokens: config.apiTokens })

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, `harbor api listening on http://localhost:${config.port}`)
})

// Finish in-flight requests, then release the pool, so tsx watch restarts cleanly.
function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down')
  server.close(() => {
    void db.close().then(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
