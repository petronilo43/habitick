// Shared by the browser tests: a `test` that starts every test from a clean slate,
// and small helpers for things many tests do (register, log in, book a service).

import { test as base, expect } from '@playwright/test'

const SERVER = 'http://localhost:54321'

// ---- talking to the stand-in server directly ----------------------------------------

async function post(path, body = {}) {
  const response = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.json()
}

// Runs SQL in the test database, as its owner. Used to set a scene quickly
// (for example, to make a request look old) and to check what was stored.
export const sql = (text, values = []) => post('/__test/sql', { sql: text, values })

// A new request is shown to Pro members only for its first few minutes. Tests that are
// not about that make every request look an hour old, so every pro can see it.
export const ageAllRequests = () => sql(`update public.bookings set created_at = now() - interval '1 hour'`)

// What following the link in a password-reset email would put in the address bar.
export async function recoveryLink(email) {
  const session = await post('/__test/recovery-session', { email })
  const fragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in),
    expires_at: String(session.expires_at),
    token_type: 'bearer',
    type: 'recovery',
  })
  return `/reset-password#${fragment}`
}

// ---- the test itself ------------------------------------------------------------------

export const test = base.extend({
  page: async ({ page }, use) => {
    await post('/__test/reset') // every test starts with an empty database
    await page.addInitScript(() => sessionStorage.setItem('habitickIntroSeen', 'true')) // skip the opening animation
    await use(page)
  },

  // A second, separate browser window: someone else using the site at the same time.
  otherPage: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.addInitScript(() => sessionStorage.setItem('habitickIntroSeen', 'true'))
    await use(page)
    await context.close()
  },
})

export { expect }

// ---- things people do ------------------------------------------------------------------

export const dialog = (page) => page.getByRole('dialog')
export const toast = (page) => page.getByRole('status').last()

// Dates for the date field, counted from today in Ireland.
export function inDays(days) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(new Date())
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function register(page, { name, email, role = 'client', password = 'secret123' }) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  const form = dialog(page)
  if (role === 'pro') await form.getByRole('button', { name: 'Pro' }).click()
  await form.getByLabel('Full name').fill(name)
  await form.getByLabel('Email', { exact: true }).fill(email)
  await form.getByLabel('Confirm Email').fill(email)
  await form.getByLabel('Password', { exact: true }).fill(password)
  await form.getByLabel('Confirm', { exact: true }).fill(password)
  await form.getByRole('button', { name: 'Register Account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name.split(' ')[0])
}

// Logs out and waits until the site shows it, so the next step never starts while the
// log-out is still on its way to the server.
export async function logOut(page) {
  await page.getByRole('button', { name: 'Log Out' }).click()
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
}

export async function logIn(page, { email, password = 'secret123' }) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Login' }).click()
  const form = dialog(page)
  await form.getByLabel('Email').fill(email)
  await form.getByLabel('Password').fill(password)
  await form.getByRole('button', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

// Books a service from the home page. `option` is the start of the option's name
// (add " €" when one name is the start of another, as in "Lawn mowing €").
export async function book(page, { service, option, eircode = 'V94 T9PX', days = 0, notes = '' }) {
  await page.goto('/')
  await page.getByRole('button', { name: service }).click()
  await dialog(page).getByRole('button', { name: 'Book This Service' }).click()
  const form = dialog(page)
  await form.getByRole('radio', { name: new RegExp(`^${option}`) }).check()
  if (notes) await form.getByLabel('Notes for the pro').fill(notes)
  await form.getByLabel('Eircode').fill(eircode)
  await form.getByLabel('Date').fill(inDays(days))
  await form.getByRole('button', { name: 'Send booking request' }).click()
  await expect(page.getByRole('heading', { name: 'Active Bookings' })).toBeVisible()
}

// The card of one booking or job, found by the name of its service.
export const card = (page, service) => page.getByRole('article').filter({ hasText: service })
