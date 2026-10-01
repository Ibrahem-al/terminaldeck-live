import { describe, expect, it } from 'vitest'
import { formatDate, formatPrice, formatWeight } from './format'

describe('format', () => {
  it('formats cents as dollars', () => {
    expect(formatPrice(1874)).toBe('$18.74')
    expect(formatPrice(0)).toBe('$0.00')
  })

  it('formats an ISO calendar date without shifting the day', () => {
    expect(formatDate('2026-10-02')).toBe('Fri, Oct 2')
  })

  it('formats weights in grams under a kilo and kilos above', () => {
    expect(formatWeight(750)).toBe('750 g')
    expect(formatWeight(2300)).toBe('2.3 kg')
    expect(formatWeight(2000)).toBe('2 kg')
  })
})
