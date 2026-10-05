import { describe, expect, it } from 'vitest'
import { FixedPrice, HourlyPrice, PricingRule, durationNote, priceLabel } from '../src/lib/pricing'
import { Membership } from '../src/lib/plan'

const cleaning = { name: 'Home Cleaning', price_unit: 'hour', hourly_rate_cents: 1450, from_cents: 2900 }
const gardening = { name: 'Gardening & Lawn', price_unit: 'fixed', hourly_rate_cents: null, from_cents: 2900 }

describe('prices', () => {
  it('uses the hourly rule for services paid by the hour', () => {
    const price = PricingRule.for(cleaning, { hours: 3, price_cents: null })
    expect(price).toBeInstanceOf(HourlyPrice)
    expect(price.totalCents).toBe(4350)
    expect(price.totalLabel).toBe('€43.50')
    expect(price.describe()).toBe('3 hours at €14.50 an hour')
  })

  it('uses the fixed rule for services paid per job', () => {
    const price = PricingRule.for(gardening, { hours: null, price_cents: 4900 })
    expect(price).toBeInstanceOf(FixedPrice)
    expect(price.totalCents).toBe(4900)
    expect(price.totalLabel).toBe('€49.00')
    expect(price.describe()).toBe('Fixed price for the job')
  })

  it('can be used without knowing which kind it is', () => {
    // The point of having one shape: this code never asks "hourly or fixed?".
    const basket = [new HourlyPrice(1500, 0.5), new FixedPrice(3500), new HourlyPrice(2500, 1.5)]
    expect(basket.every((price) => price instanceof PricingRule)).toBe(true)
    expect(basket.map((price) => price.totalCents)).toEqual([750, 3500, 3750])
    expect(basket.reduce((sum, price) => sum + price.totalCents, 0)).toBe(8000)
  })

  it('reads hours that arrive as text, and rounds to whole cents', () => {
    expect(PricingRule.for(cleaning, { hours: '2.0' }).totalCents).toBe(2900)
    expect(new HourlyPrice(1850, 1.5).totalCents).toBe(2775)
    expect(new HourlyPrice(1333, 0.5).totalCents).toBe(667) // 666.5 rounds up
  })

  it('is unfinished on its own: every kind must say its total and describe itself', () => {
    const blank = new PricingRule()
    expect(() => blank.totalCents).toThrow(/total/)
    expect(() => blank.describe()).toThrow(/describe/)
  })

  it('labels a service card with the rate or the cheapest option', () => {
    expect(priceLabel(cleaning)).toBe('€14.50 an hour')
    expect(priceLabel(gardening)).toBe('From €29.00')
  })

  it('says how long an option takes, unless its name already does', () => {
    expect(durationNote({ label: '2-3 bedrooms', hours: 3 })).toBe('3 hours')
    expect(durationNote({ label: '1 hour', hours: '1.0' })).toBeNull()
    expect(durationNote({ label: '30 minutes', hours: 0.5 })).toBeNull()
    expect(durationNote({ label: 'Lawn mowing', hours: null, price_cents: 2900 })).toBeNull()
  })
})

describe('the Pro plan for one person', () => {
  const plan = { price_cents: 700, days: 30, trial_days: 14, early_access_minutes: 5, free_active_jobs: 3, member_active_jobs: 10 }
  const now = new Date('2026-10-05T12:00:00Z')

  it('starts on the free plan, with the trial available', () => {
    const membership = new Membership({ pro_until: null, trial_used: false }, plan, now)
    expect(membership.isMember).toBe(false)
    expect(membership.daysLeft).toBe(0)
    expect(membership.canStartTrial).toBe(true)
    expect(membership.activeJobLimit).toBe(3)
  })

  it('is a member until the end date, counting a started day as a day', () => {
    const membership = new Membership({ pro_until: '2026-10-08T09:00:00Z', trial_used: true }, plan, now)
    expect(membership.isMember).toBe(true)
    expect(membership.daysLeft).toBe(3)
    expect(membership.canStartTrial).toBe(false)
    expect(membership.activeJobLimit).toBe(10)
  })

  it('goes back to free when the time runs out, and the trial stays used', () => {
    const membership = new Membership({ pro_until: '2026-10-01T00:00:00Z', trial_used: true }, plan, now)
    expect(membership.isMember).toBe(false)
    expect(membership.canStartTrial).toBe(false)
  })

  it('describes its benefits with the plan’s own numbers', () => {
    expect(new Membership(null, plan, now).benefits).toEqual([
      'See new requests 5 minutes before everyone else',
      'Hold up to 10 jobs at once instead of 3',
      'A PRO badge next to your name when you accept a booking',
    ])
  })
})
