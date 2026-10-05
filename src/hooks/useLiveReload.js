import { useEffect } from 'react'
import { watchMyBookings } from '../lib/api'

// Keeps a list fresh without the person having to reload the page. `reload` is called:
//   * the moment one of their bookings changes (pushed by the server),
//   * when they come back to the window,
//   * and every so often while the page is visible, as a safety net and for things
//     the server does not push (such as new requests appearing for pros).
// `reload` must be a stable function (made with useCallback).
export function useLiveReload(reload, everyMs = 30_000) {
  useEffect(() => {
    const whenVisible = () => {
      if (document.visibilityState === 'visible') reload()
    }
    const timer = setInterval(whenVisible, everyMs)
    window.addEventListener('focus', reload)
    document.addEventListener('visibilitychange', whenVisible)
    const stopWatching = watchMyBookings(reload)

    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', reload)
      document.removeEventListener('visibilitychange', whenVisible)
      stopWatching()
    }
  }, [reload, everyMs])
}
