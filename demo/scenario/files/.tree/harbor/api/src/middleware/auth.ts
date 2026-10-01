import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { HttpError } from './errors.js'

declare module 'express-serve-static-core' {
  interface Request {
    /** The bearer token that authenticated this request. */
    token?: string
  }
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Bearer-token auth against a fixed allow-list (API_TOKENS). */
export function requireAuth(tokens: string[]): RequestHandler {
  if (tokens.length === 0) throw new Error('requireAuth needs at least one token')
  return (req, _res, next) => {
    const header = req.get('authorization') ?? ''
    const match = /^Bearer\s+(\S+)$/i.exec(header)
    if (!match) return next(new HttpError(401, 'missing bearer token'))
    const token = match[1]!
    if (!tokens.some((t) => sameToken(t, token))) return next(new HttpError(401, 'invalid token'))
    req.token = token
    next()
  }
}
