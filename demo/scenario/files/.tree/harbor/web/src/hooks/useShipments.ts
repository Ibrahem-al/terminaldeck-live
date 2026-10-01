import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { Shipment, ShipmentStatus } from '../types'

interface State {
  shipments: Shipment[]
  loading: boolean
  error: string | null
}

/** Shipments from the API, refetched when the filter changes and every 30 s. */
export function useShipments(status?: ShipmentStatus): State & { reload: () => void } {
  const [state, setState] = useState<State>({ shipments: [], loading: true, error: null })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    api
      .shipments(status)
      .then((shipments) => !cancelled && setState({ shipments, loading: false, error: null }))
      .catch((err: Error) => !cancelled && setState((s) => ({ ...s, loading: false, error: err.message })))
    return () => {
      cancelled = true
    }
  }, [status, tick])

  useEffect(() => {
    const id = setInterval(reload, 30_000)
    return () => clearInterval(id)
  }, [reload])

  return { ...state, reload }
}
