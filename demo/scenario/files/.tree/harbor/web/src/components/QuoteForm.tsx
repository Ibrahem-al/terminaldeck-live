import { useState, type FormEvent } from 'react'
import { api, type QuoteInput } from '../api'
import type { Quote } from '../types'

interface Props {
  onQuotes: (quotes: Quote[]) => void
}

const EMPTY: QuoteInput = {
  originZip: '94107',
  destZip: '',
  parcel: { weightGrams: 1000, lengthCm: 30, widthCm: 20, heightCm: 15 }
}

export function QuoteForm({ onQuotes }: Props) {
  const [input, setInput] = useState<QuoteInput>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setParcel = (key: keyof QuoteInput['parcel'], value: string) =>
    setInput((i) => ({ ...i, parcel: { ...i.parcel, [key]: Number(value) } }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { quotes } = await api.quote(input)
      onQuotes(quotes)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="quote-form" onSubmit={submit}>
      <label>
        From ZIP
        <input value={input.originZip} onChange={(e) => setInput({ ...input, originZip: e.target.value })} maxLength={5} />
      </label>
      <label>
        To ZIP
        <input value={input.destZip} onChange={(e) => setInput({ ...input, destZip: e.target.value })} maxLength={5} required />
      </label>
      <label>
        Weight (g)
        <input type="number" min={1} value={input.parcel.weightGrams} onChange={(e) => setParcel('weightGrams', e.target.value)} />
      </label>
      <label>
        L × W × H (cm)
        <span className="dims">
          <input type="number" min={1} value={input.parcel.lengthCm} onChange={(e) => setParcel('lengthCm', e.target.value)} />
          <input type="number" min={1} value={input.parcel.widthCm} onChange={(e) => setParcel('widthCm', e.target.value)} />
          <input type="number" min={1} value={input.parcel.heightCm} onChange={(e) => setParcel('heightCm', e.target.value)} />
        </span>
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Quoting…' : 'Get rates'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
