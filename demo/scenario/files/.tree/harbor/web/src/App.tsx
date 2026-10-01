import { useState } from 'react'
import { Header } from './components/Header'
import { QuoteForm } from './components/QuoteForm'
import { RateCard } from './components/RateCard'
import { ShipmentTable } from './components/ShipmentTable'
import { useShipments } from './hooks/useShipments'
import type { Quote, ShipmentStatus } from './types'

const FILTERS: Array<{ label: string; value: ShipmentStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'In transit', value: 'in_transit' },
  { label: 'Out for delivery', value: 'out_for_delivery' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Exceptions', value: 'exception' }
]

export function App() {
  const [status, setStatus] = useState<ShipmentStatus | undefined>()
  const { shipments, loading, error, reload } = useShipments(status)
  const [quotes, setQuotes] = useState<Quote[]>([])

  return (
    <div className="layout">
      <Header onRefresh={reload} />
      <main>
        <section className="panel">
          <h2>Quote a parcel</h2>
          <QuoteForm onQuotes={setQuotes} />
          <div className="rates">
            {quotes.map((q, i) => (
              <RateCard key={`${q.carrier}-${q.service}`} quote={q} best={i === 0} />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Shipments</h2>
            <div className="filters" role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f.label}
                  role="tab"
                  aria-selected={status === f.value}
                  className={status === f.value ? 'chip chip-on' : 'chip'}
                  onClick={() => setStatus(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="error">Couldn't load shipments: {error}</p>}
          <ShipmentTable shipments={shipments} loading={loading} />
        </section>
      </main>
    </div>
  )
}
