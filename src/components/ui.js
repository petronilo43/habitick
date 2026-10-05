// The class names shared by forms and buttons across the app, so they look the same
// everywhere and can be changed in one place.

export const input = 'w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500'
export const label = 'block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1'
export const errorBox = 'text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2'

const button = 'font-bold rounded-xl transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

// Large buttons: the one main action of a form or a window.
export const primary = `${button} w-full bg-slate-900 text-white py-3 hover:bg-slate-800`
export const primaryGreen = `${button} w-full bg-emerald-600 text-white py-3 hover:bg-emerald-500 shadow-md`

// Small buttons: actions on a card or in a list.
export const small = `${button} text-sm px-4 py-2`
export const smallGreen = `${small} bg-emerald-600 text-white hover:bg-emerald-500`
export const smallDark = `${small} bg-slate-900 text-white hover:bg-slate-800`
export const smallQuiet = `${small} border border-slate-200 text-slate-700 hover:bg-slate-50`
export const smallDanger = `${small} bg-red-600 text-white hover:bg-red-500`
export const smallDangerQuiet = `${small} border border-red-200 text-red-700 hover:bg-red-50`
