// Tests for the server-side payment function (supabase/functions/payments).
// Supabase and Stripe are replaced by a small stand-in that answers the few
// requests the function makes and remembers what it was asked.

import { beforeEach, describe, expect, it } from 'vitest'
import { handleRequest } from '../supabase/functions/payments/index.ts'

const SITE = 'https://habitick.example'
const AOIFE = '11111111-1111-4111-8111-111111111111'
const BOOKING = '22222222-2222-4222-8222-222222222222'

const env = {
  STRIPE_SECRET_KEY: 'sk_test_abc',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_xyz' }),
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_xyz' }),
}

let world // what "Supabase" and "Stripe" currently hold
let calls // every outgoing request the function made

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function fakeFetch(url, options = {}) {
  const { pathname, searchParams } = new URL(url)
  const headers = options.headers ?? {}
  const call = { url: String(url), method: options.method, headers, body: options.body }
  calls.push(call)

  // --- Supabase ---
  if (pathname === '/auth/v1/user') {
    return headers.Authorization === 'Bearer aoife-token' ? json({ id: AOIFE }) : json({ msg: 'invalid token' }, 401)
  }
  if (pathname === '/rest/v1/booking_details') {
    const mine = searchParams.get('client_id') === `eq.${AOIFE}` && searchParams.get('id') === `eq.${world.booking.id}`
    return json(mine ? [world.booking] : [])
  }
  if (pathname === '/rest/v1/rpc/pro_plan') return json({ price_cents: 700, days: 30 })
  if (pathname === '/rest/v1/rpc/mark_booking_paid' || pathname === '/rest/v1/rpc/activate_pro_plan') {
    if (world.databaseRefuses) return json({ message: world.databaseRefuses }, 400)
    world.recorded = { function: pathname.split('/').pop(), ...JSON.parse(options.body) }
    return json({})
  }

  // --- Stripe ---
  if (pathname === '/v1/checkout/sessions' && options.method === 'POST') {
    world.checkoutRequest = Object.fromEntries(new URLSearchParams(options.body))
    return json({ id: 'cs_test_new', url: 'https://checkout.stripe.com/c/pay/cs_test_new' })
  }
  if (pathname.startsWith('/v1/checkout/sessions/')) {
    return world.session ? json(world.session) : json({ error: { message: 'No such checkout.session' } }, 404)
  }
  throw new Error(`The stand-in was not expecting ${options.method} ${url}`)
}

// Calls the function the way the website does.
async function ask(body, { token = 'aoife-token', origin = SITE, settings = env, method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: origin }
  if (token) headers.Authorization = `Bearer ${token}`
  const request = new Request('https://project.supabase.co/functions/v1/payments', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
  const response = await handleRequest(request, settings, fakeFetch)
  return { status: response.status, body: await response.json().catch(() => null), headers: response.headers }
}

const checkout = (extra = {}) => ask({ action: 'checkout', kind: 'booking', booking_id: BOOKING, return_url: `${SITE}/dashboard`, ...extra })
const toStripe = () => calls.filter((call) => call.url.includes('/v1/checkout'))

beforeEach(() => {
  calls = []
  world = {
    booking: { id: BOOKING, client_id: AOIFE, status: 'completed', paid_at: null, total_cents: 4350, service_name: 'Home Cleaning', option: '2-3 bedrooms' },
    session: null,
    recorded: null,
    databaseRefuses: null,
  }
})

describe('before anything else', () => {
  it('answers the browser’s permission check', async () => {
    const { status, headers } = await ask(null, { method: 'OPTIONS' })
    expect(status).toBe(200)
    expect(headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('says so when Stripe is not connected', async () => {
    const { status, body } = await ask({ action: 'checkout' }, { settings: { ...env, STRIPE_SECRET_KEY: '' } })
    expect(status).toBe(503)
    expect(body.error).toMatch(/not set up/)
  })

  it('refuses a live Stripe key, so real money can never be taken', async () => {
    const { status, body } = await ask({ action: 'checkout' }, { settings: { ...env, STRIPE_SECRET_KEY: 'sk_live_abc' } })
    expect(status).toBe(503)
    expect(body.error).toMatch(/only takes test payments/)
    expect(calls).toHaveLength(0)
  })

  it('needs a logged-in caller', async () => {
    expect((await ask({ action: 'checkout' }, { token: null })).status).toBe(401)
    expect((await ask({ action: 'checkout' }, { token: 'made-up' })).status).toBe(401)
    expect(toStripe()).toHaveLength(0)
  })

  it('only understands the two actions', async () => {
    expect((await ask({ action: 'refund' })).body.error).toMatch(/Unknown action/)
    expect((await ask(null, { method: 'GET' })).status).toBe(405)
  })
})

describe('starting a checkout', () => {
  it('asks Stripe for a page with the price from the database', async () => {
    const { status, body } = await checkout({ amount: 1, total_cents: 1 }) // a price sent by the browser is ignored
    expect(status).toBe(200)
    expect(body).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_new' })
    expect(world.checkoutRequest).toMatchObject({
      mode: 'payment',
      'line_items[0][price_data][unit_amount]': '4350',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][product_data][name]': 'Home Cleaning: 2-3 bedrooms',
      'metadata[kind]': 'booking',
      'metadata[user_id]': AOIFE,
      'metadata[booking_id]': BOOKING,
      success_url: `${SITE}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/dashboard?payment=cancelled`,
    })
    expect(toStripe()[0].headers.Authorization).toBe('Bearer sk_test_abc')
  })

  it('reads the booking as the person who is paying', async () => {
    await checkout()
    const lookup = calls.find((call) => call.url.includes('/rest/v1/booking_details'))
    expect(lookup.headers).toMatchObject({ apikey: 'sb_publishable_xyz', Authorization: 'Bearer aoife-token' })
  })

  it('only for a finished, unpaid booking of their own', async () => {
    world.booking.status = 'accepted'
    expect((await checkout()).body.error).toMatch(/once the job is done/)

    world.booking.status = 'completed'
    world.booking.paid_at = '2026-10-05T10:00:00Z'
    expect((await checkout()).body.error).toMatch(/already paid/)

    expect((await checkout({ booking_id: '33333333-3333-4333-8333-333333333333' })).status).toBe(404)
    expect((await checkout({ booking_id: 'not-an-id' })).body.error).toMatch(/Which booking/)
    expect(toStripe()).toHaveLength(0)
  })

  it('only sends people back to the site they came from', async () => {
    expect((await checkout({ return_url: 'https://elsewhere.example/dashboard' })).body.error).toMatch(/page of this site/)
    expect((await checkout({ return_url: 'javascript:alert(1)' })).body.error).toMatch(/page of this site/)
    expect((await checkout({ return_url: undefined })).body.error).toMatch(/return address/)
    expect(toStripe()).toHaveLength(0)
  })

  it('prices the Pro plan from the database too', async () => {
    const { status } = await ask({ action: 'checkout', kind: 'pro_plan', return_url: `${SITE}/dashboard` })
    expect(status).toBe(200)
    expect(world.checkoutRequest).toMatchObject({
      'line_items[0][price_data][unit_amount]': '700',
      'line_items[0][price_data][product_data][name]': 'Habitick Pro, 30 days',
      'metadata[kind]': 'pro_plan',
    })
    expect(world.checkoutRequest).not.toHaveProperty('metadata[booking_id]')
  })

  it('passes on a friendly message when Stripe says no', async () => {
    const original = globalThis.console.error
    globalThis.console.error = () => {}
    try {
      const failing = (url, options) =>
        String(url).includes('/v1/checkout/sessions') ? json({ error: { message: 'Invalid API Key' } }, 401) : fakeFetch(url, options)
      const request = new Request('https://project.supabase.co/functions/v1/payments', {
        method: 'POST',
        headers: { Authorization: 'Bearer aoife-token', Origin: SITE },
        body: JSON.stringify({ action: 'checkout', kind: 'booking', booking_id: BOOKING, return_url: `${SITE}/dashboard` }),
      })
      const response = await handleRequest(request, env, failing)
      expect(response.status).toBe(502)
      expect((await response.json()).error).not.toMatch(/API Key/) // Stripe's own words stay in the server log
    } finally {
      globalThis.console.error = original
    }
  })
})

describe('confirming a payment', () => {
  const paidSession = (extra = {}) => ({
    id: 'cs_test_paid',
    payment_status: 'paid',
    amount_total: 4350,
    metadata: { kind: 'booking', user_id: AOIFE, booking_id: BOOKING },
    ...extra,
  })
  const confirm = (sessionId = 'cs_test_paid') => ask({ action: 'confirm', session_id: sessionId })

  it('records a booking payment once Stripe says it is paid', async () => {
    world.session = paidSession()
    expect((await confirm()).body).toEqual({ status: 'paid', kind: 'booking' })
    expect(world.recorded).toEqual({ function: 'mark_booking_paid', p_booking_id: BOOKING, p_ref: 'cs_test_paid', p_amount_cents: 4350 })
  })

  it('records with the secret key, which the browser never has', async () => {
    world.session = paidSession()
    await confirm()
    const record = calls.find((call) => call.url.includes('/rpc/mark_booking_paid'))
    expect(record.headers.apikey).toBe('sb_secret_xyz')
    expect(record.headers.Authorization).toBeUndefined() // current-style keys go in the apikey header only
  })

  it('also works with a project’s older-style keys', async () => {
    world.session = paidSession()
    const settings = { STRIPE_SECRET_KEY: 'sk_test_abc', SUPABASE_URL: env.SUPABASE_URL, SUPABASE_ANON_KEY: 'anon.jwt', SUPABASE_SERVICE_ROLE_KEY: 'service.jwt' }
    expect((await ask({ action: 'confirm', session_id: 'cs_test_paid' }, { settings })).body.status).toBe('paid')
    const record = calls.find((call) => call.url.includes('/rpc/mark_booking_paid'))
    expect(record.headers).toMatchObject({ apikey: 'service.jwt', Authorization: 'Bearer service.jwt' })
  })

  it('records nothing while the checkout is unpaid', async () => {
    world.session = paidSession({ payment_status: 'unpaid' })
    expect((await confirm()).body).toEqual({ status: 'unpaid', kind: 'booking' })
    expect(world.recorded).toBeNull()
  })

  it('does not let one person confirm another person’s payment', async () => {
    world.session = paidSession({ metadata: { kind: 'booking', user_id: 'someone-else', booking_id: BOOKING } })
    expect((await confirm()).status).toBe(403)
    expect(world.recorded).toBeNull()
  })

  it('switches the Pro plan on for the person who paid', async () => {
    world.session = paidSession({ amount_total: 700, metadata: { kind: 'pro_plan', user_id: AOIFE } })
    expect((await confirm()).body).toEqual({ status: 'paid', kind: 'pro_plan' })
    expect(world.recorded).toEqual({ function: 'activate_pro_plan', p_user_id: AOIFE, p_ref: 'cs_test_paid', p_amount_cents: 700 })
  })

  it('refuses anything that is not a test checkout', async () => {
    expect((await confirm('cs_live_abc')).body.error).toMatch(/not a test payment/)
    expect((await confirm('../../v1/customers')).body.error).toMatch(/not a test payment/)
    expect(toStripe()).toHaveLength(0)
  })

  it('reports it when the database will not take the payment', async () => {
    world.session = paidSession()
    world.databaseRefuses = 'The amount paid does not match the booking.'
    const original = globalThis.console.error
    globalThis.console.error = () => {}
    try {
      const { status, body } = await confirm()
      expect(status).toBe(409)
      expect(body.error).toBe('The amount paid does not match the booking.')
    } finally {
      globalThis.console.error = original
    }
  })
})
