// Turning stored values into text for the screen.

const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

// 4350 -> "€43.50"
export function formatMoney(cents) {
  return euro.format(cents / 100)
}

// 0.5 -> "30 minutes"   1 -> "1 hour"   1.5 -> "1.5 hours"
export function formatHours(hours) {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`
  return hours === 1 ? '1 hour' : `${hours} hours`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-12" -> "Mon 12 Oct". Written out by hand because browsers disagree on the
// punctuation when asked to format a date like this.
export function formatDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

// A moment in time -> "12 Oct 2026", in Irish time.
export function formatDay(timestamp) {
  return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Dublin' }).format(
    new Date(timestamp),
  )
}

// 4.5, 12 -> "4.5 (12 reviews)"      null, 0 -> "No reviews yet"
export function formatRating(rating, reviews) {
  if (!reviews) return 'No reviews yet'
  return `${Number(rating).toFixed(1)} (${reviews} ${reviews === 1 ? 'review' : 'reviews'})`
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
