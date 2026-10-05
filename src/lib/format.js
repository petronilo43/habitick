// Turning stored values into text for the screen.

const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

// 1450, 'hour' -> "From €14.50/hr"      2900, 'fixed' -> "From €29.00 fixed"
export function formatPrice(cents, unit) {
  const amount = euro.format(cents / 100)
  return unit === 'hour' ? `From ${amount}/hr` : `From ${amount} fixed`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-12" -> "Mon 12 Oct". Written out by hand because browsers disagree on the
// punctuation when asked to format a date like this.
export function formatDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

// "Thiago Petronilo" -> "Thiago"
export function firstName(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] || ''
}

export function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-IE', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Dublin' }).format(now))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
