import { describe, expect, it } from 'vitest'
import { Booking, STATUS, addDays, normaliseEircode, todayInIreland, validateBookingForm } from '../src/lib/booking'
import { firstName, formatDate, formatPrice, greeting } from '../src/lib/format'

const CLIENT = 'client-1'
const PRO = 'pro-1'
const STRANGER = 'someone-else'

function booking(overrides = {}) {
  return new Booking({
    id: 'b1',
    client_id: CLIENT,
    pro_id: null,
    status: STATUS.REQUESTED,
    option: '1 Hour',
    details: '',
    eircode: 'V94 T9PX',
    scheduled_date: '2026-10-12',
    service_name: 'Dog Walking',
    service_icon: '🐕',
    price_cents: 1500,
    price_unit: 'hour',
    client_name: 'Aoife',
    pro_name: null,
    ...overrides,
  })
}

describe('Eircodes', () => {
  it('accepts real formats and tidies them up', () => {
    expect(normaliseEircode('V94 T9PX')).toBe('V94 T9PX')
    expect(normaliseEircode('v94t9px')).toBe('V94 T9PX')
    expect(normaliseEircode('  d6w  f2k3 ')).toBe('D6W F2K3')
  })

  it('rejects anything else', () => {
    expect(normaliseEircode('Limerick')).toBeNull()
    expect(normaliseEircode('V94')).toBeNull()
    expect(normaliseEircode('B94 T9PX')).toBeNull() // B is never used in an Eircode
    expect(normaliseEircode('')).toBeNull()
    expect(normaliseEircode(undefined)).toBeNull()
  })
})

describe('the booking form', () => {
  const service = { name: 'Dog Walking', options: ['30 Minutes', '1 Hour', 'Other'] }
  const today = '2026-10-05'
  const good = { service, option: '1 Hour', details: '', eircode: 'V94 T9PX', date: '2026-10-06' }

  it('passes when everything is filled in properly', () => {
    expect(validateBookingForm(good, today)).toBeNull()
    expect(validateBookingForm({ ...good, date: today }, today)).toBeNull()
  })

  it('needs one of the service’s own options', () => {
    expect(validateBookingForm({ ...good, option: '' }, today)).toMatch(/choose an option/)
    expect(validateBookingForm({ ...good, option: '4+ Bedrooms' }, today)).toMatch(/choose an option/)
  })

  it('needs a description when the option is "Other"', () => {
    expect(validateBookingForm({ ...good, option: 'Other', details: '  ' }, today)).toMatch(/describe/)
    expect(validateBookingForm({ ...good, option: 'Other', details: 'Two dogs' }, today)).toBeNull()
  })

  it('needs a valid Eircode', () => {
    expect(validateBookingForm({ ...good, eircode: 'my house' }, today)).toMatch(/Eircode/)
  })

  it('does not allow dates in the past or too far ahead', () => {
    expect(validateBookingForm({ ...good, date: '2026-10-04' }, today)).toMatch(/today or a later date/)
    expect(validateBookingForm({ ...good, date: addDays(today, 90) }, today)).toBeNull()
    expect(validateBookingForm({ ...good, date: addDays(today, 91) }, today)).toMatch(/90 days/)
  })
})

describe('what each person may do with a booking', () => {
  it('lets only the client cancel, and only while it is still going on', () => {
    expect(booking().canBeCancelledBy(CLIENT)).toBe(true)
    expect(booking({ status: STATUS.ACCEPTED, pro_id: PRO }).canBeCancelledBy(CLIENT)).toBe(true)
    expect(booking({ status: STATUS.COMPLETED, pro_id: PRO }).canBeCancelledBy(CLIENT)).toBe(false)
    expect(booking({ status: STATUS.CANCELLED }).canBeCancelledBy(CLIENT)).toBe(false)
    expect(booking().canBeCancelledBy(STRANGER)).toBe(false)
    expect(booking({ status: STATUS.ACCEPTED, pro_id: PRO }).canBeCancelledBy(PRO)).toBe(false)
  })

  it('lets only the assigned pro give the job back', () => {
    const accepted = booking({ status: STATUS.ACCEPTED, pro_id: PRO })
    expect(accepted.canBeReleasedBy(PRO)).toBe(true)
    expect(accepted.canBeReleasedBy(CLIENT)).toBe(false)
    expect(booking().canBeReleasedBy(PRO)).toBe(false)
  })

  it('lets the assigned pro finish the job, but not before its day', () => {
    const accepted = booking({ status: STATUS.ACCEPTED, pro_id: PRO, scheduled_date: '2026-10-12' })
    expect(accepted.canBeCompletedBy(PRO, '2026-10-11')).toBe(false)
    expect(accepted.canBeCompletedBy(PRO, '2026-10-12')).toBe(true)
    expect(accepted.canBeCompletedBy(PRO, '2026-10-20')).toBe(true)
    expect(accepted.canBeCompletedBy(STRANGER, '2026-10-12')).toBe(false)
  })

  it('knows when a booking is still active', () => {
    expect(booking().isActive).toBe(true)
    expect(booking({ status: STATUS.ACCEPTED }).isActive).toBe(true)
    expect(booking({ status: STATUS.COMPLETED }).isActive).toBe(false)
    expect(booking({ status: STATUS.CANCELLED }).isActive).toBe(false)
  })
})

describe('dates and text', () => {
  it('works out today in Ireland, not in the visitor’s time zone', () => {
    // 23:30 UTC on 5 October is already 00:30 on the 6th in Ireland (summer time).
    expect(todayInIreland(new Date('2026-10-05T23:30:00Z'))).toBe('2026-10-06')
    expect(todayInIreland(new Date('2026-12-05T23:30:00Z'))).toBe('2026-12-05')
  })

  it('adds days across the end of a month', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })

  it('formats prices, dates, names and greetings', () => {
    expect(formatPrice(1450, 'hour')).toBe('From €14.50/hr')
    expect(formatPrice(2900, 'fixed')).toBe('From €29.00 fixed')
    expect(formatDate('2026-10-12')).toBe('Mon 12 Oct')
    expect(firstName('  Thiago Petronilo ')).toBe('Thiago')
    expect(firstName('')).toBe('')
    expect(greeting(new Date('2026-10-05T08:00:00Z'))).toBe('Good morning')
    expect(greeting(new Date('2026-10-05T14:00:00Z'))).toBe('Good afternoon')
    expect(greeting(new Date('2026-10-05T19:00:00Z'))).toBe('Good evening')
  })
})
