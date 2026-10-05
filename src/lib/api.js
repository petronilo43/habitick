// Every conversation with the backend (Supabase) happens in this file.
// The rest of the app calls these functions and never touches `supabase` directly,
// so there is one place to look when something about the data changes.
//
// Each function either returns what was asked for or throws an Error whose message
// is fit to show to the person using the app.

import { supabase } from '../supabaseClient'
import { Booking } from './booking'

// Supabase answers with { data, error }. This turns that into "return or throw".
function unwrap({ data, error }) {
  if (error) {
    const offline = /failed to fetch|networkerror|load failed/i.test(error.message ?? '')
    throw new Error(offline ? 'Could not reach the server. Check your connection and try again.' : error.message)
  }
  return data
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

export async function getProfile(userId) {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).single())
}

// `changes` may hold full_name and role (the dashboard that opens first).
export async function updateProfile(userId, changes) {
  return unwrap(await supabase.from('profiles').update(changes).eq('id', userId).select().single())
}

// ---- services ---------------------------------------------------------------

export async function listServices() {
  return unwrap(await supabase.from('services').select('*').order('sort_order'))
}

// ---- bookings, from the client's side -----------------------------------------

export async function createBooking({ serviceId, option, details, eircode, date }) {
  return unwrap(
    await supabase.rpc('create_booking', {
      p_service_id: serviceId,
      p_option: option,
      p_details: details,
      p_eircode: eircode,
      p_date: date,
    }),
  )
}

export async function listMyBookings(userId) {
  const rows = unwrap(
    await supabase.from('booking_details').select('*').eq('client_id', userId).order('scheduled_date', { ascending: false }),
  )
  return rows.map((row) => new Booking(row))
}

export async function cancelBooking(bookingId) {
  return unwrap(await supabase.rpc('cancel_booking', { p_booking_id: bookingId }))
}

// ---- bookings, from the pro's side ---------------------------------------------

// Requests nobody has taken yet. These carry only the area, not the full Eircode.
export async function listOpenJobs() {
  return unwrap(await supabase.rpc('open_jobs'))
}

export async function listMyJobs(userId) {
  const rows = unwrap(
    await supabase.from('booking_details').select('*').eq('pro_id', userId).order('scheduled_date', { ascending: true }),
  )
  return rows.map((row) => new Booking(row))
}

export async function acceptBooking(bookingId) {
  return unwrap(await supabase.rpc('accept_booking', { p_booking_id: bookingId }))
}

export async function releaseBooking(bookingId) {
  return unwrap(await supabase.rpc('release_booking', { p_booking_id: bookingId }))
}

export async function completeBooking(bookingId) {
  return unwrap(await supabase.rpc('complete_booking', { p_booking_id: bookingId }))
}
