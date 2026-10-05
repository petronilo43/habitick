// The rules of a booking, in one place.
//
// The database enforces these same rules (see supabase/schema.sql), and it has the
// final say. This file exists so the interface can agree with it: which buttons to
// show, and which mistakes to catch before anything is sent.

export const STATUS = Object.freeze({
  REQUESTED: 'requested',
  ACCEPTED: 'accepted',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
})

const STATUS_LABELS = {
  [STATUS.REQUESTED]: 'Waiting for a pro',
  [STATUS.ACCEPTED]: 'Confirmed',
  [STATUS.COMPLETED]: 'Done',
  [STATUS.CANCELLED]: 'Cancelled',
}

// An Eircode is a routing key (a letter and two digits, or the one exception "D6W")
// followed by four characters. Some letters are never used, to avoid look-alikes.
const EIRCODE = /^(?:[AC-FHKNPRTV-Y][0-9]{2}|D6W)[0-9AC-FHKNPRTV-Y]{4}$/

export const MAX_DAYS_AHEAD = 90
export const MAX_DETAILS_LENGTH = 500

// "v94t9px" or " V94  T9PX " -> "V94 T9PX". Returns null if it isn't an Eircode.
export function normaliseEircode(value) {
  const compact = String(value ?? '').replace(/\s/g, '').toUpperCase()
  if (!EIRCODE.test(compact)) return null
  return `${compact.slice(0, 3)} ${compact.slice(3)}`
}

// Today's date in Ireland as "2026-10-05", the format date inputs and the database use.
export function todayInIreland(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(now)
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// Checks a booking form. Returns a message to show, or null when everything is fine.
export function validateBookingForm({ service, option, details, eircode, date }, today = todayInIreland()) {
  if (!service) return 'Please choose a service.'
  if (!service.options.includes(option)) return `Please choose an option for ${service.name}.`
  if (option === 'Other' && !String(details ?? '').trim()) return 'Please describe what you need.'
  if (String(details ?? '').trim().length > MAX_DETAILS_LENGTH) {
    return `Please keep the description under ${MAX_DETAILS_LENGTH} characters.`
  }
  if (!normaliseEircode(eircode)) return 'That does not look like an Eircode. Example: V94 T9PX.'
  if (!date || date < today) return 'Please choose today or a later date.'
  if (date > addDays(today, MAX_DAYS_AHEAD)) return `Bookings can be made up to ${MAX_DAYS_AHEAD} days ahead.`
  return null
}

// One booking, as the dashboards use it. Built from a row of the booking_details view.
export class Booking {
  constructor(row) {
    this.id = row.id
    this.clientId = row.client_id
    this.proId = row.pro_id ?? null
    this.status = row.status
    this.option = row.option
    this.details = row.details ?? ''
    this.eircode = row.eircode
    this.date = row.scheduled_date
    this.serviceName = row.service_name
    this.serviceIcon = row.service_icon
    this.priceCents = row.price_cents
    this.priceUnit = row.price_unit
    this.clientName = row.client_name ?? ''
    this.proName = row.pro_name ?? ''
  }

  get statusLabel() {
    return STATUS_LABELS[this.status] ?? this.status
  }

  // Still going on: not finished and not cancelled.
  get isActive() {
    return this.status === STATUS.REQUESTED || this.status === STATUS.ACCEPTED
  }

  // The client can cancel until the job is done.
  canBeCancelledBy(userId) {
    return this.clientId === userId && this.isActive
  }

  // The pro who took the job can give it back while it is still to be done.
  canBeReleasedBy(userId) {
    return this.proId === userId && this.status === STATUS.ACCEPTED
  }

  // The pro can mark it as done, but not before the day it was booked for.
  canBeCompletedBy(userId, today = todayInIreland()) {
    return this.proId === userId && this.status === STATUS.ACCEPTED && this.date <= today
  }
}
