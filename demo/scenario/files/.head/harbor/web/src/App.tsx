import { useState } from 'react'
import { Header } from './components/Header'
import { QuoteForm } from './components/QuoteForm'
import { RateCard } from './components/RateCard'
import { ShipmentTable } from './components/ShipmentTable'
import { useShipments } from './hooks/useShipments'
import type { Quote } from './types'

export function App() {
  const { shipments, loading, error, reload } = useShipments()
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
          <h2>Shipments</h2>
          {error && <p className="error">Couldn't load shipments: {error}</p>}
          <ShipmentTable shipments={shipments} loading={loading} />
        </section>
      </main>
    </div>
  )
}
