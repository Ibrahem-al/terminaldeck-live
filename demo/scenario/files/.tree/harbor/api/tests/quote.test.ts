import { describe, expect, it } from 'vitest'
import { addBusinessDays, billableKg, quoteAll, zoneBetween } from '../src/services/quote.js'

describe('billableKg', () => {
  it('uses actual weight for dense parcels', () => {
    expect(billableKg({ weightGrams: 4200, lengthCm: 20, widthCm: 20, heightCm: 10 }, 5000)).toBe(4.5)
  })

  it('uses volumetric weight for bulky parcels', () => {
    // 60×40×40 / 5000 = 19.2 kg → 19.5
    expect(billableKg({ weightGrams: 3000, lengthCm: 60, widthCm: 40, heightCm: 40 }, 5000)).toBe(19.5)
  })
})

describe('zoneBetween', () => {
  it('is 0 inside a region and grows with distance', () => {
    expect(zoneBetween('94107', '94110')).toBe(0)
    expect(zoneBetween('94107', '85001')).toBe(1)
    expect(zoneBetween('94107', '10001')).toBe(3)
  })
})

describe('addBusinessDays', () => {
  it('skips the weekend', () => {
    // Friday + 1 business day = Monday
    expect(addBusinessDays(new Date('2026-09-25T12:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-09-28')
  })
})

describe('quoteAll', () => {
  it('returns quotes sorted by price', () => {
    const quotes = quoteAll({ weightGrams: 1000, lengthCm: 10, widthCm: 10, heightCm: 10 }, '94107', '94110', new Date('2026-09-28T09:00:00Z'))
    expect(quotes.length).toBe(9)
    expect(quotes[0]).toMatchObject({ carrier: 'usps', service: 'ground' })
  })
})
