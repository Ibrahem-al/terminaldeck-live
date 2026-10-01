/** The code the agents write during the tour: a rate limiter, its tests, and the server wiring. */

export const RATE_LIMIT_EXPRESS = `import type { NextFunction, Request, Response } from 'express'

export interface RateLimitOptions {
  /** Length of one window, in milliseconds. */
  windowMs: number
  /** Requests each client may make per window. */
  max: number
  /** How a client is identified. Defaults to the remote address. */
  key?: (req: Request) => string
}

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Fixed-window rate limiter. Buckets live in memory, so the limit is per
 * process: put a shared store behind it before running more than one instance.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip ?? 'unknown' }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>()

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    const id = key(req)
    let bucket = buckets.get(id)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(id, bucket)
    }
    bucket.count++

    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000)
    res.setHeader('RateLimit-Limit', String(max))
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    res.setHeader('RateLimit-Reset', String(resetSeconds))

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(resetSeconds))
      res.status(429).json({ error: 'Too many requests, slow down.' })
      return
    }
    next()
  }
}
`

export const RATE_LIMIT_HONO = `import type { Context, Next } from 'hono'

export interface RateLimitOptions {
  /** Length of one window, in milliseconds. */
  windowMs: number
  /** Requests each client may make per window. */
  max: number
}

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Fixed-window rate limiter keyed by client address. Buckets live in memory,
 * so the limit is per process.
 */
export function rateLimit({ windowMs, max }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>()

  return async (c: Context, next: Next) => {
    const now = Date.now()
    const id = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    let bucket = buckets.get(id)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(id, bucket)
    }
    bucket.count++

    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000)
    c.header('RateLimit-Limit', String(max))
    c.header('RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    c.header('RateLimit-Reset', String(resetSeconds))

    if (bucket.count > max) {
      c.header('Retry-After', String(resetSeconds))
      return c.json({ error: 'Too many requests, slow down.' }, 429)
    }
    await next()
  }
}
`

export const RATE_LIMIT_TEST = `import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { rateLimit } from '../src/middleware/rateLimit'

function fakeRes() {
  const headers: Record<string, string> = {}
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      headers[name] = value
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    }
  }
  return { res: res as unknown as Response & typeof res, headers }
}

const req = (ip = '10.0.0.1') => ({ ip }) as Request

describe('rateLimit', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets requests through under the limit', () => {
    const limit = rateLimit({ windowMs: 60_000, max: 2 })
    const next = vi.fn()
    const { res, headers } = fakeRes()
    limit(req(), res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(headers['RateLimit-Remaining']).toBe('1')
  })

  it('answers 429 with Retry-After once the budget is spent', () => {
    const limit = rateLimit({ windowMs: 60_000, max: 1 })
    const next = vi.fn()
    limit(req(), fakeRes().res, next)
    const { res, headers } = fakeRes()
    limit(req(), res, next)
    expect(res.statusCode).toBe(429)
    expect(headers['Retry-After']).toBe('60')
    expect(next).toHaveBeenCalledOnce()
  })

  it('starts a fresh window after windowMs', () => {
    vi.useFakeTimers()
    const limit = rateLimit({ windowMs: 1_000, max: 1 })
    const next = vi.fn()
    limit(req(), fakeRes().res, next)
    vi.advanceTimersByTime(1_001)
    limit(req(), fakeRes().res, next)
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('counts each client separately', () => {
    const limit = rateLimit({ windowMs: 60_000, max: 1 })
    const next = vi.fn()
    limit(req('10.0.0.1'), fakeRes().res, next)
    limit(req('10.0.0.2'), fakeRes().res, next)
    expect(next).toHaveBeenCalledTimes(2)
  })
})
`

/**
 * Mount the limiter in server.ts: an import after the last import, and an
 * `app.use(...)` before the first route is mounted (or after the app is
 * created). Idempotent: an already-wired file comes back unchanged.
 */
export function wireRateLimit(source: string, fw: 'express' | 'hono' | 'fastify' | 'node'): string {
  if (/rateLimit/.test(source)) return source
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/)
  const js = /from '\.{1,2}\/[^']+\.js'/.test(source) ? '.js' : ''
  const importLine = `import { rateLimit } from './middleware/rateLimit${js}'`
  const useLine =
    fw === 'hono'
      ? "app.use('*', rateLimit({ windowMs: 60_000, max: 100 }))"
      : 'app.use(rateLimit({ windowMs: 60_000, max: 100 }))'

  // The last line of the import block (multi-line imports end at their `from`).
  let lastImport = -1
  let inImport = false
  lines.forEach((l, i) => {
    if (inImport) {
      if (/\bfrom\s+['"]/.test(l)) {
        inImport = false
        lastImport = i
      }
      return
    }
    if (!/^\s*import\s/.test(l)) return
    if (/\bfrom\s+['"]|^\s*import\s+['"]/.test(l)) lastImport = i
    else inImport = true
  })
  const appLine = lines.findIndex((l) => /\b(const|let)\s+app\s*=/.test(l))
  let mountAt = -1
  if (appLine >= 0) {
    const isRoute = (l: string): boolean =>
      /^\s*app\.(use|route)\(\s*['"`]\//.test(l) ||
      /^\s*app\.(get|post|put|patch|delete|all)\(/.test(l) ||
      /^\s*app\.use\(.*(router|routes?)\b/i.test(l)
    // Before auth when there is an auth middleware (so /health stays unlimited), else before the first route.
    const authLine = lines.findIndex((l, i) => i > appLine && /^\s*app\.use\(\s*requireAuth/.test(l))
    const firstRoute = authLine >= 0 ? authLine : lines.findIndex((l, i) => i > appLine && isRoute(l))
    const lastUse = lines.reduce((acc, l, i) => (i > appLine && /^\s*app\.use\(/.test(l) && (firstRoute < 0 || i < firstRoute) ? i : acc), -1)
    const indent = (lines[firstRoute >= 0 ? firstRoute : appLine].match(/^\s*/) ?? [''])[0]
    if (firstRoute >= 0) mountAt = firstRoute
    else if (lastUse >= 0) mountAt = lastUse + 1
    else mountAt = appLine + 1
    lines.splice(mountAt, 0, indent + useLine)
  } else {
    lines.push('', `// Mount before your routes: ${useLine}`)
  }
  // Keep it with the other middleware imports when there are any.
  const lastMiddleware = lines.reduce((acc, l, i) => (i <= lastImport && /^\s*import\s.*\.\/middleware\//.test(l) ? i : acc), -1)
  lines.splice((lastMiddleware >= 0 ? lastMiddleware : lastImport) + 1, 0, importLine)
  return lines.join(eol)
}
