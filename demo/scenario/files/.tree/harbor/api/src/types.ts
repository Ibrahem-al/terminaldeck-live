export type CarrierId = 'ups' | 'fedex' | 'dhl' | 'usps'

export type ServiceLevel = 'ground' | 'express' | 'overnight'

export type ShipmentStatus = 'booked' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception'

export interface Parcel {
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

export interface Quote {
  carrier: CarrierId
  service: ServiceLevel
  priceCents: number
  /** Business days in transit. */
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

export type NewShipment = Omit<Shipment, 'id' | 'status' | 'createdAt'>

export interface TrackingEvent {
  status: ShipmentStatus
  note: string | null
  at: string
}
