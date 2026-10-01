// Mirrors api/src/types.ts — the shapes the API returns as JSON.

export type CarrierId = 'ups' | 'fedex' | 'dhl' | 'usps'
export type ServiceLevel = 'ground' | 'express' | 'overnight'
export type ShipmentStatus = 'booked' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception'

export interface Quote {
  carrier: CarrierId
  service: ServiceLevel
  priceCents: number
  transitDays: number
  eta: string
}

export interface Shipment {
  id: string
  reference: string
  carrier: CarrierId
  service: ServiceLevel
  status: ShipmentStatus
  originZip: string
  destZip: string
  weightGrams: number
  priceCents: number
  eta: string
  createdAt: string
}

export const CARRIER_NAMES: Record<CarrierId, string> = {
  ups: 'UPS',
  fedex: 'FedEx',
  dhl: 'DHL',
  usps: 'USPS'
}
