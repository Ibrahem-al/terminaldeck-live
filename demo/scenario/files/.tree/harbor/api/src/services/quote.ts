import type { Parcel, Quote, ServiceLevel } from '../types.js'
import { CARRIERS, type Carrier } from './carriers.js'

/** Billable weight: the greater of actual and volumetric, rounded up to 0.5 kg. */
export function billableKg(parcel: Parcel, dimDivisor: number): number {
  const actual = parcel.weightGrams / 1000
  const volumetric = (parcel.lengthCm * parcel.widthCm * parcel.heightCm) / dimDivisor
  return Math.ceil(Math.max(actual, volumetric) * 2) / 2
}

/** Rough zone from the first ZIP digit: same region 0, neighbouring 1, cross-country up to 3. */
export function zoneBetween(originZip: string, destZip: string): number {
  const a = Number(originZip[0])
  const b = Number(destZip[0])
  return Math.min(3, Math.floor(Math.abs(a - b) / 3) + (a === b ? 0 : 1))
}

/** `days` business days after `from` (Saturday and Sunday skipped). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from)
  let left = days
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) left--
  }
  return d
}

function quoteOne(carrier: Carrier, service: ServiceLevel, parcel: Parcel, zone: number, now: Date): Quote | null {
  const rate = carrier.services[service]
  if (!rate) return null
  const kg = billableKg(parcel, carrier.dimDivisor)
  // Ground slows down across zones; express and overnight don't.
  const transitDays = rate.transitDays + (service === 'ground' ? zone : 0)
  const zoneSurcharge = 1 + zone * 0.12
  const priceCents = Math.round((rate.baseCents + kg * rate.perKgCents) * zoneSurcharge)
  return {
    carrier: carrier.id,
    service,
    priceCents,
    transitDays,
    eta: addBusinessDays(now, transitDays).toISOString().slice(0, 10)
  }
}

/** Every carrier × service that can take the parcel, cheapest first. */
export function quoteAll(parcel: Parcel, originZip: string, destZip: string, now: Date): Quote[] {
  const zone = zoneBetween(originZip, destZip)
  const quotes: Quote[] = []
  for (const carrier of Object.values(CARRIERS)) {
    for (const service of ['ground', 'express', 'overnight'] as const) {
      const q = quoteOne(carrier, service, parcel, zone, now)
      if (q) quotes.push(q)
    }
  }
  return quotes.sort((a, b) => a.priceCents - b.priceCents || a.transitDays - b.transitDays)
}
