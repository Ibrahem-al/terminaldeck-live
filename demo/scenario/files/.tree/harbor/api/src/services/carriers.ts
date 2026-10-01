import type { CarrierId, ServiceLevel } from '../types.js'

export interface CarrierRate {
  /** Flat fee per parcel, in cents. */
  baseCents: number
  /** Per billable kilogram, in cents. */
  perKgCents: number
  /** Business days before crossing zones. */
  transitDays: number
}

export interface Carrier {
  id: CarrierId
  name: string
  /** Volumetric divisor: cm³ per billable kg. */
  dimDivisor: number
  services: Partial<Record<ServiceLevel, CarrierRate>>
}

export const CARRIERS: Record<CarrierId, Carrier> = {
  ups: {
    id: 'ups',
    name: 'UPS',
    dimDivisor: 5000,
    services: {
      ground: { baseCents: 895, perKgCents: 145, transitDays: 4 },
      express: { baseCents: 1990, perKgCents: 310, transitDays: 2 },
      overnight: { baseCents: 4250, perKgCents: 520, transitDays: 1 }
    }
  },
  fedex: {
    id: 'fedex',
    name: 'FedEx',
    dimDivisor: 5000,
    services: {
      ground: { baseCents: 910, perKgCents: 139, transitDays: 4 },
      express: { baseCents: 2075, perKgCents: 295, transitDays: 2 },
      overnight: { baseCents: 4390, perKgCents: 505, transitDays: 1 }
    }
  },
  dhl: {
    id: 'dhl',
    name: 'DHL',
    dimDivisor: 5000,
    services: {
      express: { baseCents: 2240, perKgCents: 280, transitDays: 2 }
    }
  },
  usps: {
    id: 'usps',
    name: 'USPS',
    dimDivisor: 6000,
    services: {
      ground: { baseCents: 610, perKgCents: 170, transitDays: 5 },
      express: { baseCents: 2850, perKgCents: 190, transitDays: 2 }
    }
  }
}
