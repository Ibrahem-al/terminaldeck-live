import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'
import { HttpError } from './errors.js'

/** Parse `req.body` with a zod schema; a mismatch is a 400 listing every issue. */
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      return next(new HttpError(400, 'invalid request body', issues))
    }
    req.body = result.data
    next()
  }
}
