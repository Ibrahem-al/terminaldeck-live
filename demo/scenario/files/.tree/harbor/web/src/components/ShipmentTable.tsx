import { formatDate, formatPrice, formatWeight } from '../format'
import { CARRIER_NAMES, type Shipment } from '../types'
import { StatusBadge } from './StatusBadge'

interface Props {
  shipments: Shipment[]
  loading: boolean
}

export function ShipmentTable({ shipments, loading }: Props) {
  if (!loading && shipments.length === 0) {
    return <p className="muted empty">No shipments yet — book one from a quote.</p>
  }
  return (
    <table className="shipments" aria-busy={loading}>
      <thead>
        <tr>
          <th>Reference</th>
          <th>Carrier</th>
          <th>Route</th>
          <th>Status</th>
          <th>ETA</th>
          <th className="num">Weight</th>
          <th className="num">Price</th>
        </tr>
      </thead>
      <tbody>
        {shipments.map((s) => (
          <tr key={s.id}>
            <td className="mono">{s.reference}</td>
            <td>
              {CARRIER_NAMES[s.carrier]} <span className="muted">{s.service}</span>
            </td>
            <td className="mono">
              {s.originZip} → {s.destZip}
            </td>
            <td>
              <StatusBadge status={s.status} />
            </td>
            <td className={isLate(s) ? 'late' : undefined}>{formatDate(s.eta)}</td>
            <td className="num">{formatWeight(s.weightGrams)}</td>
            <td className="num">{formatPrice(s.priceCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Past its ETA and still not delivered. */
function isLate(s: Shipment): boolean {
  return s.status !== 'delivered' && new Date(`${s.eta}T23:59:59`) < new Date()
}
