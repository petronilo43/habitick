import { useEffect, useState } from 'react'
import { listServices } from '../lib/api'

// The services and their prices change rarely, so they are fetched once and shared
// by every part of the app that needs them.
let cache = null

export function useCatalogue() {
  const [state, setState] = useState({ status: 'loading', services: [], error: '' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    cache ??= listServices()
    cache.then(
      (services) => {
        if (active) setState({ status: 'ready', services, error: '' })
      },
      (problem) => {
        cache = null // so the next try asks again
        if (active) setState({ status: 'error', services: [], error: problem.message })
      },
    )
    return () => {
      active = false
    }
  }, [attempt])

  const retry = () => {
    setState({ status: 'loading', services: [], error: '' })
    setAttempt((n) => n + 1)
  }

  return { ...state, retry }
}
