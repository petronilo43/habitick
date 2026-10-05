import { describe, expect, it } from 'vitest'
import { Booking, STATUS, addDays, normaliseEircode, parseAreas, todayInIreland, validateBookingForm, validateReview } from '../src/lib/booking'
import { firstName, formatDate, formatHours, formatMoney, formatRating, greeting } from '../src/lib/format'

const CLIENT = 'client-1'
const PRO = 'pro-1'
const STRANGER = 'someone-else'

function booking(overrides = {}) {
  return new Booking({
    id: 'b1',
    client_id: CLIENT,
    pro_id: null,
    status: STATUS.REQUESTED,
    option: '1 hour',
    details: '',
    eircode: 'V94 T9PX',
    scheduled_date: '2026-10-12',
    total_cents: 1500,
    paid_at: null,
    service_name: 'Dog Walking',
    service_icon: '🐕',
    client_name: 'Aoife',
    pro_name: null,
    pro_is_member: false,
    pro_rating: null,
    pro_reviews: 0,
    review_rating: null,
    review_comment: null,
    ...overrides,
  })
}

const done = (overrides = {}) => booking({ status: STATUS.COMPLETED, pro_id: PRO, ...overrides })

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

  it('reads the list of areas a pro covers', () => {
    expect(parseAreas('v94, T12  d6w')).toEqual(['V94', 'T12', 'D6W'])
    expect(parseAreas('V94; v94')).toEqual(['V94']) // no doubles
    expect(parseAreas('')).toEqual([]) // empty means "anywhere"
    expect(parseAreas('V94, Limerick')).toBeNull()
    expect(parseAreas('V94 T9PX')).toBeNull() // a whole Eircode is not an area
  })
})

describe('the booking form', () => {
  const service = {
    name: 'Dog Walking',
    options: [
      { id: 41, label: '30 minutes' },
      { id: 42, label: '1 hour' },
    ],
  }
  const today = '2026-10-05'
  const good = { service, optionId: 42, details: '', eircode: 'V94 T9PX', date: '2026-10-06' }

  it('passes when everything is filled in properly', () => {
    expect(validateBookingForm(good, today)).toBeNull()
    expect(validateBookingForm({ ...good, date: today }, today)).toBeNull()
  })

  it('needs one of the service’s own options', () => {
    expect(validateBookingForm({ ...good, optionId: null }, today)).toMatch(/choose an option/)
    expect(validateBookingForm({ ...good, optionId: 12 }, today)).toMatch(/choose an option/) // an option of another service
  })

  it('needs a valid Eircode', () => {
    expect(validateBookingForm({ ...good, eircode: 'my house' }, today)).toMatch(/Eircode/)
  })

  it('does not allow dates in the past or too far ahead', () => {
    expect(validateBookingForm({ ...good, date: '2026-10-04' }, today)).toMatch(/today or a later date/)
    expect(validateBookingForm({ ...good, date: addDays(today, 90) }, today)).toBeNull()
    expect(validateBookingForm({ ...good, date: addDays(today, 91) }, today)).toMatch(/90 days/)
  })

  it('keeps the notes short', () => {
    expect(validateBookingForm({ ...good, details: 'x'.repeat(500) }, today)).toBeNull()
    expect(validateBookingForm({ ...good, details: 'x'.repeat(501) }, today)).toMatch(/500 characters/)
  })
})

describe('what each person may do with a booking', () => {
  it('lets only the client cancel, and only while it is still going on', () => {
    expect(booking().canBeCancelledBy(CLIENT)).toBe(true)
    expect(booking({ status: STATUS.ACCEPTED, pro_id: PRO }).canBeCancelledBy(CLIENT)).toBe(true)
    expect(done().canBeCancelledBy(CLIENT)).toBe(false)
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
    expect(done().isActive).toBe(false)
    expect(booking({ status: STATUS.CANCELLED }).isActive).toBe(false)
  })

  it('lets the client pay once the job is done, and only once', () => {
    expect(booking().canBePaidBy(CLIENT)).toBe(false)
    expect(booking({ status: STATUS.ACCEPTED, pro_id: PRO }).canBePaidBy(CLIENT)).toBe(false)
    expect(done().canBePaidBy(CLIENT)).toBe(true)
    expect(done().canBePaidBy(PRO)).toBe(false)
    expect(done({ paid_at: '2026-10-12T10:00:00Z' }).canBePaidBy(CLIENT)).toBe(false)
    expect(done({ paid_at: '2026-10-12T10:00:00Z' }).isPaid).toBe(true)
  })

  it('lets the client review a finished job once', () => {
    expect(booking({ status: STATUS.ACCEPTED, pro_id: PRO }).canBeReviewedBy(CLIENT)).toBe(false)
    expect(done().canBeReviewedBy(CLIENT)).toBe(true)
    expect(done().canBeReviewedBy(PRO)).toBe(false)
    expect(done({ review_rating: 5, review_comment: 'Great' }).canBeReviewedBy(CLIENT)).toBe(false)
    expect(done({ pro_id: null }).canBeReviewedBy(CLIENT)).toBe(false) // the pro's account is gone
  })

  it('carries the review and the pro’s reputation', () => {
    const reviewed = done({ review_rating: 4, review_comment: 'Good', pro_rating: '4.7', pro_reviews: 3, pro_is_member: true })
    expect(reviewed.review).toEqual({ rating: 4, comment: 'Good' })
    expect(reviewed.proRating).toBe(4.7)
    expect(reviewed.proReviews).toBe(3)
    expect(reviewed.proIsMember).toBe(true)
    expect(done().review).toBeNull()
  })
})

describe('reviews', () => {
  it('need 1 to 5 whole stars and a comment of reasonable length', () => {
    expect(validateReview({ rating: 5, comment: '' })).toBeNull()
    expect(validateReview({ rating: 0, comment: '' })).toMatch(/1 and 5 stars/)
    expect(validateReview({ rating: 6, comment: '' })).toMatch(/1 and 5 stars/)
    expect(validateReview({ rating: 4.5, comment: '' })).toMatch(/1 and 5 stars/)
    expect(validateReview({ rating: 3, comment: 'x'.repeat(501) })).toMatch(/500 characters/)
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

  it('formats money, durations, dates, ratings, names and greetings', () => {
    expect(formatMoney(4350)).toBe('€43.50')
    expect(formatMoney(700)).toBe('€7.00')
    expect(formatHours(0.5)).toBe('30 minutes')
    expect(formatHours(1)).toBe('1 hour')
    expect(formatHours(1.5)).toBe('1.5 hours')
    expect(formatDate('2026-10-12')).toBe('Mon 12 Oct')
    expect(formatRating('4.7', 3)).toBe('4.7 (3 reviews)')
    expect(formatRating(5, 1)).toBe('5.0 (1 review)')
    expect(formatRating(null, 0)).toBe('No reviews yet')
    expect(firstName('  Thiago Petronilo ')).toBe('Thiago')
    expect(firstName('')).toBe('')
    expect(greeting(new Date('2026-10-05T08:00:00Z'))).toBe('Good morning')
    expect(greeting(new Date('2026-10-05T14:00:00Z'))).toBe('Good afternoon')
    expect(greeting(new Date('2026-10-05T19:00:00Z'))).toBe('Good evening')
  })
})
