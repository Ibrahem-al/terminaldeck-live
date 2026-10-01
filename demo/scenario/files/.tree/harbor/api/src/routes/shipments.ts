import { Router } from 'express'
import { z } from 'zod'
import type { Db } from '../db.js'
import { HttpError } from '../middleware/errors.js'
import { validateBody } from '../middleware/validate.js'

const STATUSES = ['booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception'] as const

const ListQuery = z.object({
  status: z.enum(STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
})

const NewShipmentBody = z.object({
  reference: z.string().min(1).max(64),
  carrier: z.enum(['ups', 'fedex', 'dhl', 'usps']),
  service: z.enum(['ground', 'express', 'overnight']),
  originZip: z.string().regex(/^\d{5}$/),
  destZip: z.string().regex(/^\d{5}$/),
  weightGrams: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  eta: z.string().date()
})

const StatusBody = z.object({
  status: z.enum(STATUSES),
  note: z.string().max(280).optional()
})

export function shipmentsRouter(db: Db): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const query = ListQuery.safeParse(req.query)
    if (!query.success) throw new HttpError(400, 'invalid query', query.error.issues)
    const items = await db.listShipments(query.data)
    res.json({ items, limit: query.data.limit, offset: query.data.offset })
  })

  router.get('/:id', async (req, res) => {
    const shipment = await db.getShipment(req.params.id)
    if (!shipment) throw new HttpError(404, `shipment ${req.params.id} not found`)
    res.json(shipment)
  })

  router.post('/', validateBody(NewShipmentBody), async (req, res) => {
    const shipment = await db.createShipment(req.body as z.infer<typeof NewShipmentBody>)
    res.status(201).location(`/shipments/${shipment.id}`).json(shipment)
  })

  router.patch('/:id/status', validateBody(StatusBody), async (req, res) => {
    const { status, note } = req.body as z.infer<typeof StatusBody>
    const shipment = await db.updateStatus(req.params.id, status, note)
    if (!shipment) throw new HttpError(404, `shipment ${req.params.id} not found`)
    res.json(shipment)
  })

  return router
}
