import { createContext, useContext } from 'react'

// Things every page needs, provided once by App.jsx:
//   session       the logged-in session; null when nobody is; undefined while checking
//   plan          the Pro plan's numbers from the database (null until loaded)
//   showToast     show a short message at the top of the screen
//   withCurtain   run something behind the full-screen "Habitick.ie" curtain
//   openAuth      open the login / register window
export const AppContext = createContext(null)

export function useApp() {
  return useContext(AppContext)
}
