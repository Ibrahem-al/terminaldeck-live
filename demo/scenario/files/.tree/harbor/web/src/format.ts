const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const date = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export const formatPrice = (cents: number): string => price.format(cents / 100)

/** `2026-10-02` → `Fri, Oct 2` (dates from the API are calendar dates, not instants). */
export const formatDate = (iso: string): string => date.format(new Date(`${iso}T12:00:00`))

/** `750` → `750 g`, `2300` → `2.3 kg`. */
export const formatWeight = (grams: number): string => (grams < 1000 ? `${grams} g` : `${(grams / 1000).toFixed(1)} kg`)
