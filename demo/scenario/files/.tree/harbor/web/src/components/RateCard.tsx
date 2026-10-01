import { CARRIER_NAMES, type Quote } from '../types'
import { formatDate, formatPrice } from '../format'

interface Props {
  quote: Quote
  /** The cheapest quote gets the "Best price" ribbon. */
  best?: boolean
}

export function RateCard({ quote, best }: Props) {
  return (
    <article className={best ? 'rate rate-best' : 'rate'}>
      {best && <span className="ribbon">Best price</span>}
      <h3>
        {CARRIER_NAMES[quote.carrier]} <small>{quote.service}</small>
      </h3>
      <p className="price">{formatPrice(quote.priceCents)}</p>
      <p className="muted">
        {quote.transitDays} business {quote.transitDays === 1 ? 'day' : 'days'} · arrives {formatDate(quote.eta)}
      </p>
    </article>
  )
}
