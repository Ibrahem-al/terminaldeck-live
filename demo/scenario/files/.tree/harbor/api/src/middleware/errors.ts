import type { ErrorRequestHandler, RequestHandler } from 'express'
import { logger } from './logger.js'

/** An error with an HTTP status; anything else thrown is a 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `no route for ${req.method} ${req.path}`))
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details })
    return
  }
  // express.json() reports a malformed body as a SyntaxError with a status.
  if (err instanceof SyntaxError && 'status' in err) {
    res.status(400).json({ error: 'malformed JSON body' })
    return
  }
  logger.error({ err, method: req.method, path: req.path }, 'unhandled error')
  res.status(500).json({ error: 'internal error' })
}
