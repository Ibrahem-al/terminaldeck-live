import type { ShipmentStatus } from '../types'

const LABELS: Record<ShipmentStatus, string> = {
  booked: 'Booked',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  exception: 'Exception'
}

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>
}
