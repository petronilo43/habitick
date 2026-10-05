// @ts-nocheck plain JavaScript on purpose, see the note below
// Habitick payments: a Supabase Edge Function.
//
// The website cannot talk to Stripe by itself, because that needs Stripe's secret
// key and anything in a website can be read by its visitors. So the website asks
// this function, which runs on Supabase's servers, to do two things:
//
//   { action: 'checkout', kind: 'booking', booking_id, return_url }
//   { action: 'checkout', kind: 'pro_plan', return_url }
//       Looks up what is being paid for and its price in the database (the price is
//       never taken from the browser), asks Stripe for a checkout page and answers
//       with its address: { url }.
//
//   { action: 'confirm', session_id }
//       After Stripe sends the person back: asks Stripe whether that checkout was
//       really paid and, if so, records it in the database. Answers
//       { status: 'paid' | 'unpaid', kind }.
//
// It needs one secret, set in the Supabase dashboard: STRIPE_SECRET_KEY, a Stripe
// TEST key (it starts with sk_test_). Live keys are refused on purpose: this is a
// portfolio project and must never take real money.
//
// The file has no imports and is plain JavaScript, so the same code can be run by the
// project's tests in Node (see tests/payments.test.js) as well as by Supabase. Supabase
// expects the name index.ts all the same; the first line of this file tells the
// TypeScript checker not to look for type annotations in it.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEST_CHECKOUT_ID = /^cs_test_[A-Za-z0-9_]+$/

// Something the caller did wrong, or that is not set up. Its message is shown to them.
class Refusal extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

function answer(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// ---- settings -----------------------------------------------------------------

// Supabase hands its keys to the function either as a small JSON dictionary (the
// current "publishable" / "secret" keys) or as single values (the older anon /
// service_role keys). Whichever is there is used.
function keyFrom(dictionary, single) {
  try {
    const keys = JSON.parse(dictionary)
    return keys.default ?? Object.values(keys)[0] ?? single
  } catch {
    return single
  }
}

function readSettings(env) {
  const stripeKey = env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    throw new Refusal('Payments are not set up on this site yet.', 503)
  }
  if (!/^(sk|rk)_test_/.test(stripeKey)) {
    throw new Refusal('This site only takes test payments. Its Stripe key must be a test key.', 503)
  }
  return {
    stripeKey,
    stripeUrl: env.STRIPE_API_URL ?? 'https://api.stripe.com', // only the tests change this
    supabaseUrl: env.SUPABASE_URL,
    publicKey: keyFrom(env.SUPABASE_PUBLISHABLE_KEYS, env.SUPABASE_ANON_KEY),
    secretKey: keyFrom(env.SUPABASE_SECRET_KEYS, env.SUPABASE_SERVICE_ROLE_KEY),
  }
}

// ---- talking to Supabase and to Stripe -------------------------------------------

// A request to the project's own database or login service.
//   userToken given: acts as that person, so the database's access rules apply.
//   userToken empty: acts as the server, with the secret key (used only to record a
//                    payment that Stripe has confirmed).
async function supabase(context, path, { userToken, body } = {}) {
  const key = userToken ? context.settings.publicKey : context.settings.secretKey
  const headers = { apikey: key, 'Content-Type': 'application/json' }
  if (userToken) headers.Authorization = `Bearer ${userToken}`
  // The older keys are also expected as a bearer token; the current sb_... keys must not be.
  else if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`

  const response = await context.fetch(`${context.settings.supabaseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  return { ok: response.ok, data }
}

async function stripe(context, method, path, fields) {
  const response = await context.fetch(`${context.settings.stripeUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${context.settings.stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: fields ? new URLSearchParams(fields).toString() : undefined,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    console.error('Stripe refused the request:', data?.error?.message ?? response.status)
    throw new Refusal('The payment service did not accept the request. Please try again.', 502)
  }
  return data
}

// ---- who is asking -----------------------------------------------------------------

async function whoIsCalling(context, request) {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { ok, data } = token ? await supabase(context, '/auth/v1/user', { userToken: token }) : { ok: false }
  if (!ok || !data?.id) throw new Refusal('Please log in first.', 401)
  return { id: data.id, token }
}

// ---- action: checkout ----------------------------------------------------------------

// Where Stripe sends the person afterwards. It has to be a page of the site the request
// came from, so this function cannot be used to send people somewhere else.
function checkReturnUrl(request, returnUrl) {
  let url
  try {
    url = new URL(returnUrl)
  } catch {
    throw new Refusal('A return address is needed.')
  }
  const origin = request.headers.get('Origin')
  if (!/^https?:$/.test(url.protocol) || (origin && url.origin !== origin)) {
    throw new Refusal('The return address must be a page of this site.')
  }
  return `${url.origin}${url.pathname}`
}

// What is being bought, and for how much. Read from the database as the caller.
async function whatIsBeingPaid(context, user, body) {
  if (body.kind === 'booking') {
    if (!UUID.test(body.booking_id ?? '')) throw new Refusal('Which booking is this payment for?')
    const { data } = await supabase(context, `/rest/v1/booking_details?select=*&id=eq.${body.booking_id}&client_id=eq.${user.id}`, {
      userToken: user.token,
    })
    const booking = Array.isArray(data) ? data[0] : null
    if (!booking) throw new Refusal('Booking not found.', 404)
    if (booking.status !== 'completed') throw new Refusal('A booking is paid once the job is done.')
    if (booking.paid_at) throw new Refusal('This booking is already paid.')
    return { name: `${booking.service_name}: ${booking.option}`, amount: booking.total_cents, metadata: { booking_id: booking.id } }
  }

  if (body.kind === 'pro_plan') {
    const { ok, data: plan } = await supabase(context, '/rest/v1/rpc/pro_plan', { userToken: user.token, body: {} })
    if (!ok) throw new Refusal('The Pro plan could not be loaded.', 502)
    return { name: `Habitick Pro, ${plan.days} days`, amount: plan.price_cents, metadata: {} }
  }

  throw new Refusal('Nothing to pay for.')
}

async function startCheckout(context, request, user, body) {
  const returnUrl = checkReturnUrl(request, body.return_url)
  const item = await whatIsBeingPaid(context, user, body)

  const session = await stripe(context, 'POST', '/v1/checkout/sessions', {
    mode: 'payment',
    // Stripe replaces {CHECKOUT_SESSION_ID} with the id of this checkout.
    success_url: `${returnUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnUrl}?payment=cancelled`,
    client_reference_id: user.id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(item.amount),
    'line_items[0][price_data][product_data][name]': item.name,
    'metadata[kind]': body.kind,
    'metadata[user_id]': user.id,
    ...Object.fromEntries(Object.entries(item.metadata).map(([key, value]) => [`metadata[${key}]`, value])),
  })

  return { url: session.url }
}

// ---- action: confirm -------------------------------------------------------------------

async function confirmPayment(context, user, body) {
  if (!TEST_CHECKOUT_ID.test(body.session_id ?? '')) throw new Refusal('That is not a test payment.')

  const session = await stripe(context, 'GET', `/v1/checkout/sessions/${body.session_id}`)
  const { kind, user_id: payer, booking_id: bookingId } = session.metadata ?? {}

  if (payer !== user.id) throw new Refusal('This payment belongs to another account.', 403)
  if (session.payment_status !== 'paid') return { status: 'unpaid', kind }

  // Only now, with Stripe's word that the money arrived, is the database told. These
  // two database functions accept calls from the server alone, and each ignores a
  // payment it has already recorded, so confirming twice is harmless.
  const record =
    kind === 'booking'
      ? supabase(context, '/rest/v1/rpc/mark_booking_paid', {
          body: { p_booking_id: bookingId, p_ref: session.id, p_amount_cents: session.amount_total },
        })
      : supabase(context, '/rest/v1/rpc/activate_pro_plan', {
          body: { p_user_id: user.id, p_ref: session.id, p_amount_cents: session.amount_total },
        })

  const { ok, data } = await record
  if (!ok) {
    console.error('The payment was made but could not be recorded:', data?.message)
    throw new Refusal(data?.message ?? 'The payment could not be recorded.', 409)
  }
  return { status: 'paid', kind }
}

// ---- the function itself -----------------------------------------------------------------

// `env` holds the settings and `fetchImpl` makes the outgoing requests. Supabase passes
// the real ones (see the last lines); the tests pass stand-ins.
export async function handleRequest(request, env, fetchImpl = fetch) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    if (request.method !== 'POST') throw new Refusal('Send a POST request.', 405)

    const context = { settings: readSettings(env), fetch: fetchImpl }
    const user = await whoIsCalling(context, request)
    const body = await request.json().catch(() => ({}))

    if (body.action === 'checkout') return answer(await startCheckout(context, request, user, body))
    if (body.action === 'confirm') return answer(await confirmPayment(context, user, body))
    throw new Refusal('Unknown action.')
  } catch (problem) {
    if (problem instanceof Refusal) return answer({ error: problem.message }, problem.status)
    console.error(problem)
    return answer({ error: 'Something went wrong with the payment. Please try again.' }, 500)
  }
}

// Supabase runs this file with Deno, which provides Deno.serve and Deno.env.
// In the tests Deno does not exist, and only handleRequest above is used.
if (typeof Deno !== 'undefined') {
  Deno.serve((request) => handleRequest(request, Deno.env.toObject()))
}
