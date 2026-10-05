import { createContext, useContext } from 'react'

// Things every page needs, provided once by App.jsx:
//   session       the logged-in session, or null
//   showToast     show a short message at the top of the screen
//   withCurtain   run something behind the full-screen "Habitick.ie" curtain
//   openAuth      open the login / register window
export const AppContext = createContext(null)

export function useApp() {
  return useContext(AppContext)
}
