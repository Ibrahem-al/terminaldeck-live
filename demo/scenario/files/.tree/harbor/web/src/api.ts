import type { Quote, Shipment, ShipmentStatus } from './types'

const TOKEN = import.meta.env.VITE_API_TOKEN ?? 'dev-token-change-me'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...init.headers }
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return (await res.json()) as T
}

export interface QuoteInput {
  originZip: string
  destZip: string
  parcel: { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number }
}

export const api = {
  quote: (input: QuoteInput) =>
    request<{ quotes: Quote[]; cheapest: Quote | null }>('/rates/quote', { method: 'POST', body: JSON.stringify(input) }),

  shipments: (status?: ShipmentStatus) =>
    request<{ items: Shipment[] }>(`/shipments${status ? `?status=${status}` : ''}`).then((r) => r.items),

  book: (quote: Quote, input: QuoteInput, reference: string) =>
    request<Shipment>('/shipments', {
      method: 'POST',
      body: JSON.stringify({
        reference,
        carrier: quote.carrier,
        service: quote.service,
        originZip: input.originZip,
        destZip: input.destZip,
        weightGrams: input.parcel.weightGrams,
        priceCents: quote.priceCents,
        eta: quote.eta
      })
    })
}
