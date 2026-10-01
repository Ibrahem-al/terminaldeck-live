import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.js'
import { CARRIERS } from '../services/carriers.js'
import { quoteAll } from '../services/quote.js'

const QuoteRequest = z.object({
  originZip: z.string().regex(/^\d{5}$/, 'must be a 5-digit ZIP'),
  destZip: z.string().regex(/^\d{5}$/, 'must be a 5-digit ZIP'),
  parcel: z.object({
    weightGrams: z.number().int().positive().max(70_000),
    lengthCm: z.number().positive().max(270),
    widthCm: z.number().positive().max(270),
    heightCm: z.number().positive().max(270)
  }),
  // Only quote these carriers (the dashboard's carrier filter). Omitted = all.
  carriers: z.array(z.enum(['ups', 'fedex', 'dhl', 'usps'])).nonempty().optional()
})

export function ratesRouter(): Router {
  const router = Router()

  router.post('/quote', validateBody(QuoteRequest), (req, res) => {
    const body = req.body as z.infer<typeof QuoteRequest>
    const quotes = quoteAll(body.parcel, body.originZip, body.destZip, new Date()).filter(
      (q) => !body.carriers || body.carriers.includes(q.carrier)
    )
    res.json({ quotes, cheapest: quotes[0] ?? null })
  })

  router.get('/carriers', (_req, res) => {
    res.json(
      Object.values(CARRIERS).map((c) => ({ id: c.id, name: c.name, services: Object.keys(c.services) }))
    )
  })

  return router
}
