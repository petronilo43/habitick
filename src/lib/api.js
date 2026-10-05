// Every conversation with the backend (Supabase) happens in this file.
// The rest of the app calls these functions and never touches `supabase` directly,
// so there is one place to look when something about the data changes.
//
// Each function either returns what was asked for or throws an Error whose message
// is fit to show to the person using the app.

import { supabase } from '../supabaseClient'
import { Booking } from './booking'

// Paying needs Stripe to be connected (see the README). Until it is, the site works
// without the pay buttons.
export const paymentsEnabled = import.meta.env.VITE_PAYMENTS_ENABLED === 'true'

// Supabase answers with { data, error }. This turns that into "return or throw".
function unwrap({ data, error }) {
  if (error) {
    const offline = /failed to fetch|networkerror|load failed/i.test(error.message ?? '')
    throw new Error(offline ? 'Could not reach the server. Check your connection and try again.' : error.message)
  }
  return data
}

// Calls one of the database functions from supabase/schema.sql.
async function call(name, args) {
  return unwrap(await supabase.rpc(name, args))
}

// ---- accounts ---------------------------------------------------------------

// Returns the new session, or null when Supabase wants the email confirmed first.
export async function signUp({ email, password, fullName, role }) {
  const data = unwrap(
    await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    }),
  )
  return data.session
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      throw new Error('Please confirm your email first. Check your inbox for the link.')
    }
    if (/invalid login credentials/i.test(error.message)) {
      throw new Error('Wrong email or password.')
    }
    unwrap({ error })
  }
  return data.session
}

export async function signOut() {
  unwrap(await supabase.auth.signOut())
}

// Sends an email with a link to /reset-password. Supabase answers the same way
// whether or not the address has an account, so nobody can use this to find out.
export async function requestPasswordReset(email) {
  unwrap(await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }))
}

// Sets a new password for whoever is logged in (after following the reset link).
export async function updatePassword(password) {
  unwrap(await supabase.auth.updateUser({ password }))
}

export async function getProfile(userId) {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).single())
}

// `changes` may hold full_name and role (the dashboard that opens first).
export async function updateProfile(userId, changes) {
  return unwrap(await supabase.from('profiles').update(changes).eq('id', userId).select().single())
}

// Removes the account and everything that belongs to it. There is no way back.
export async function deleteAccount() {
  await call('delete_my_account')
  // The login no longer exists, so only this browser's copy of it is left to clear.
  await supabase.auth.signOut({ scope: 'local' })
}

// ---- the demo ---------------------------------------------------------------

// Signs the visitor in as a guest and fills a private sandbox with sample data.
// `role` is the dashboard to open: 'client' or 'pro'.
export async function startDemo(role) {
  const { error } = await supabase.auth.signInAnonymously()
  if (error) {
    if (/anonymous sign-?ins are disabled/i.test(error.message ?? '')) {
      throw new Error('The demo is not switched on for this site yet.')
    }
    unwrap({ error })
  }
  try {
    await call('start_demo', { p_role: role })
  } catch (problem) {
    // Without its sample data a guest session is no use to anyone: end it again.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    throw problem
  }
}

// In the demo: plays the other person's next step on a booking.
export async function demoAdvance(bookingId) {
  return call('demo_advance', { p_booking_id: bookingId })
}

// ---- services ---------------------------------------------------------------

// Each service comes with its options, and each option with its exact price.
export async function listServices() {
  return unwrap(await supabase.from('service_catalogue').select('*').order('sort_order'))
}

// ---- bookings, from the client's side -----------------------------------------

export async function createBooking({ optionId, details, eircode, date }) {
  return call('create_booking', { p_option_id: optionId, p_details: details, p_eircode: eircode, p_date: date })
}

export async function listMyBookings(userId) {
  const rows = unwrap(
    await supabase.from('booking_details').select('*').eq('client_id', userId).order('scheduled_date', { ascending: false }),
  )
  return rows.map((row) => new Booking(row))
}

export async function cancelBooking(bookingId) {
  return call('cancel_booking', { p_booking_id: bookingId })
}

export async function reviewBooking(bookingId, { rating, comment }) {
  return call('review_booking', { p_booking_id: bookingId, p_rating: rating, p_comment: comment })
}

// ---- bookings, from the pro's side ---------------------------------------------

// Requests nobody has taken yet. These carry only the area, not the full Eircode.
export async function listOpenJobs() {
  return call('open_jobs')
}

// On the free plan: how many requests are still in Pro early access, and when the
// next one opens. Returns { jobs, next_opens_at }.
export async function getLockedJobs() {
  const rows = await call('locked_jobs')
  return rows[0] ?? { jobs: 0, next_opens_at: null }
}

export async function listMyJobs(userId) {
  const rows = unwrap(
    await supabase.from('booking_details').select('*').eq('pro_id', userId).order('scheduled_date', { ascending: true }),
  )
  return rows.map((row) => new Booking(row))
}

export async function acceptBooking(bookingId) {
  return call('accept_booking', { p_booking_id: bookingId })
}

export async function releaseBooking(bookingId) {
  return call('release_booking', { p_booking_id: bookingId })
}

export async function completeBooking(bookingId) {
  return call('complete_booking', { p_booking_id: bookingId })
}

// ---- being a pro: preferences and the Pro plan -----------------------------------

// The plan's numbers: price, length, trial, early access and job limits.
export async function getProPlan() {
  return call('pro_plan')
}

export async function startProTrial() {
  return call('start_pro_trial')
}

// Which services a pro offers and which areas they cover. Empty means "all".
export async function getProPreferences(userId) {
  const [services, areas] = await Promise.all([
    supabase.from('pro_services').select('service_id').eq('pro_id', userId),
    supabase.from('pro_areas').select('routing_key').eq('pro_id', userId),
  ])
  return {
    serviceIds: unwrap(services).map((row) => row.service_id),
    areas: unwrap(areas).map((row) => row.routing_key).sort(),
  }
}

export async function setProPreferences({ serviceIds, areas }) {
  await call('set_pro_preferences', { p_service_ids: serviceIds, p_areas: areas })
}

// ---- payments ---------------------------------------------------------------
// Money is handled by a small server-side function (supabase/functions/payments),
// because it needs Stripe's secret key, which must never be in the browser.

async function callPayments(body) {
  const { data, error } = await supabase.functions.invoke('payments', { body })
  if (!error) return data

  // When the function refuses, its answer carries the reason as { error: "..." }.
  let message = null
  if (error.context?.status === 404) message = 'Payments are not set up on this site yet.'
  else {
    try {
      message = (await error.context.json()).error
    } catch {
      // no readable answer: the function could not be reached at all
    }
  }
  // A 401 without a reason did not come from the function: Supabase stopped the
  // request before the function ran. This note is for whoever is setting the site up.
  if (!message && error.context?.status === 401) {
    console.warn('The payments function was not reached (401). In Supabase, turn off "Verify JWT with legacy secret" for it. See the README.')
  }
  throw new Error(message ?? 'Could not reach the payment service. Please try again.')
}

// Sends the browser to Stripe's checkout page. `what` is { kind: 'booking', bookingId }
// or { kind: 'pro_plan' }. Stripe sends the person back to the dashboard afterwards.
export async function goToCheckout(what) {
  const { url } = await callPayments({
    action: 'checkout',
    kind: what.kind,
    booking_id: what.bookingId,
    return_url: `${window.location.origin}/dashboard`,
  })
  window.location.assign(url)
}

// Back from Stripe: asks the server to check the payment and record it.
// Returns { status: 'paid' | 'unpaid', kind }.
export async function confirmPayment(sessionId) {
  return callPayments({ action: 'confirm', session_id: sessionId })
}

// ---- live updates -------------------------------------------------------------

// Calls `onChange` whenever one of this person's bookings changes (Supabase Realtime).
// Returns a function that stops listening.
export function watchMyBookings(onChange) {
  const channel = supabase
    .channel(`bookings-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => onChange())
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
