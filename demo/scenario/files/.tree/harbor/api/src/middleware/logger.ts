import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'token'],
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' }
})

/** One structured line per request: method, path, status, duration, request id. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const id = req.get('x-request-id') ?? randomUUID()
  const started = performance.now()
  res.setHeader('x-request-id', id)
  res.on('finish', () => {
    const ms = Math.round((performance.now() - started) * 10) / 10
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    logger[level]({ id, method: req.method, path: req.originalUrl, status: res.statusCode, ms }, 'request')
  })
  next()
}
