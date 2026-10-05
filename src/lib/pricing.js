// How a price is worked out.
//
// There are two kinds of price, and code that shows or adds up prices should not
// have to care which one it has. So both are a PricingRule: they answer the same
// two questions (totalCents and describe()), each in its own way.
//
// The database works the same totals out again when a booking is made (see
// option_total() in supabase/schema.sql). A test compares the two for every option.

import { formatHours, formatMoney } from './format'

// The shared shape. Never used directly: it only says what every rule can do.
export class PricingRule {
  // The price of the whole job, in cents.
  get totalCents() {
    throw new Error('A pricing rule has to say what its total is.')
  }

  // One line that explains the price, e.g. "3 hours at €14.50 an hour".
  describe() {
    throw new Error('A pricing rule has to be able to describe itself.')
  }

  // The total as text, e.g. "€43.50". The same for every kind of rule.
  get totalLabel() {
    return formatMoney(this.totalCents)
  }

  // Picks the right kind of rule for an option of a service.
  static for(service, option) {
    if (service.price_unit === 'hour') return new HourlyPrice(service.hourly_rate_cents, Number(option.hours))
    return new FixedPrice(option.price_cents)
  }
}

// Paid by the hour: a rate, and how long the option takes.
export class HourlyPrice extends PricingRule {
  constructor(rateCents, hours) {
    super()
    this.rateCents = rateCents
    this.hours = hours
  }

  get totalCents() {
    return Math.round(this.rateCents * this.hours)
  }

  describe() {
    return `${formatHours(this.hours)} at ${formatMoney(this.rateCents)} an hour`
  }
}

// One price for the whole job.
export class FixedPrice extends PricingRule {
  constructor(cents) {
    super()
    this.cents = cents
  }

  get totalCents() {
    return this.cents
  }

  describe() {
    return 'Fixed price for the job'
  }
}

// The short price line on a service card: the hourly rate, or the cheapest option.
export function priceLabel(service) {
  if (service.price_unit === 'hour') return `${formatMoney(service.hourly_rate_cents)} an hour`
  return `From ${formatMoney(service.from_cents)}`
}

// How long an option takes, for options of services paid by the hour. Left out when
// the option's own name already says it ("30 minutes", "1 hour").
export function durationNote(option) {
  if (option.hours == null) return null
  const duration = formatHours(Number(option.hours))
  return duration.toLowerCase() === option.label.toLowerCase() ? null : duration
}
