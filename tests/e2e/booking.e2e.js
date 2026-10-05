import { ageAllRequests, book, card, dialog, expect, register, sql, test, toast } from './helpers'

// Coming back to a window makes its lists refresh (see hooks/useLiveReload.js).
const comeBackTo = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')))

test('a booking goes from request to done, paid and reviewed', async ({ page, otherPage }) => {
  // ---- Aoife books a cleaning for today ----
  await register(page, { name: 'Aoife Byrne', email: 'aoife@example.com' })
  await book(page, { service: 'Home Cleaning', option: '2-3 bedrooms', notes: 'Key under the mat' })
  const booking = card(page, 'Home Cleaning')
  await expect(booking).toContainText('Waiting for a pro')
  await expect(booking).toContainText('€43.50') // 3 hours at €14.50

  // ---- Seán is a pro on the free plan: a brand-new request is not his to take yet ----
  await register(otherPage, { name: 'Seán Kelly', email: 'sean@example.com', role: 'pro' })
  await expect(otherPage.getByText('1 new request is in Pro early access')).toBeVisible()
  await expect(otherPage.getByRole('article')).toHaveCount(0)

  // ---- he starts the free trial, and now sees it ----
  await otherPage.getByRole('button', { name: 'See the Pro plan' }).click()
  await otherPage.getByRole('button', { name: 'Start my 14-day free trial' }).click()
  await expect(otherPage.getByRole('heading', { name: 'You are a Pro member' })).toBeVisible()
  await otherPage.getByRole('button', { name: 'Overview' }).click()

  const request = card(otherPage, 'Home Cleaning')
  await expect(request).toContainText('Pro early access')
  await expect(request).toContainText('€43.50')
  await expect(request).toContainText('V94 area') // the area, but not the address or the name
  await expect(request).not.toContainText('T9PX')
  await expect(request).not.toContainText('Aoife')

  // ---- he accepts, and the details open up ----
  await request.getByRole('button', { name: 'Accept job' }).click()
  await otherPage.getByRole('button', { name: 'My Jobs' }).click()
  const job = card(otherPage, 'Home Cleaning')
  await expect(job).toContainText('Aoife Byrne')
  await expect(job).toContainText('V94 T9PX')
  await expect(job).toContainText('Key under the mat')

  // ---- Aoife sees who is coming ----
  await comeBackTo(page)
  await expect(booking).toContainText('Confirmed')
  await expect(booking).toContainText('Seán Kelly')
  await expect(booking).toContainText('PRO')
  await expect(booking).toContainText('No reviews yet')

  // ---- Seán does the job ----
  await job.getByRole('button', { name: 'Mark as done' }).click()
  await expect(otherPage.getByRole('heading', { name: 'Done' })).toBeVisible()

  // ---- Aoife pays on the (pretend) Stripe page ----
  await comeBackTo(page)
  await expect(booking).toContainText('Payment due')
  await booking.getByRole('button', { name: 'Pay €43.50' }).click()
  await expect(page.getByRole('heading', { name: 'Home Cleaning: 2-3 bedrooms' })).toBeVisible()
  await expect(page.getByText('€43.50')).toBeVisible()
  await page.getByRole('button', { name: 'Pay' }).click()

  await expect(page).toHaveURL(/\/dashboard$/) // back on the site, with a clean address
  await expect(toast(page)).toContainText('Payment received')
  await expect(booking).toContainText('Paid')
  await expect(booking.getByRole('button', { name: /Pay/ })).toHaveCount(0)
  expect(await sql('select kind, amount_cents from public.payments')).toEqual([{ kind: 'booking', amount_cents: 4350 }])

  // ---- and leaves a review ----
  await booking.getByRole('button', { name: 'Leave a review' }).click()
  await dialog(page).getByRole('radio', { name: '4 stars' }).dispatchEvent('click')
  await dialog(page).getByLabel('A few words').fill('Very clean, arrived a little late.')
  await dialog(page).getByRole('button', { name: 'Send review' }).click()
  await expect(toast(page)).toContainText('review is saved')
  await expect(booking).toContainText('Very clean, arrived a little late.')
  await expect(booking.getByRole('button', { name: 'Leave a review' })).toHaveCount(0)

  // ---- Seán's numbers follow ----
  await otherPage.getByRole('button', { name: 'Overview' }).click()
  const stat = (label) => otherPage.getByText(label, { exact: true }).locator('..')
  await expect(stat('Jobs Completed')).toContainText('1')
  await expect(stat('Your Rating')).toContainText('4.0')
  await expect(stat('Earned')).toContainText('€43.50')
})

test('the booking form catches mistakes and shows the price as you choose', async ({ page }) => {
  await register(page, { name: 'Aoife Byrne', email: 'aoife@example.com' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Gardening & Lawn' }).click()
  await dialog(page).getByRole('button', { name: 'Book This Service' }).click()
  const form = dialog(page)

  await form.getByRole('button', { name: 'Send booking request' }).click()
  await expect(form.getByRole('alert')).toContainText('choose an option')

  await form.getByRole('radio', { name: /^Overgrown garden clean-up/ }).check()
  await expect(form).toContainText('Fixed price for the job')
  await expect(form.getByText('€89.00').last()).toBeVisible()

  await form.getByLabel('Eircode').fill('Limerick')
  await form.getByRole('button', { name: 'Send booking request' }).click()
  await expect(form.getByRole('alert')).toContainText('Eircode')
})

test('a client can cancel, and leaving the payment page charges nothing', async ({ page }) => {
  await register(page, { name: 'Aoife Byrne', email: 'aoife@example.com' })
  await book(page, { service: 'Dog Walking', option: '1 hour', days: 3 })
  await book(page, { service: 'Mobile Mechanic', option: 'Flat tyre change' })

  // Cancelling asks first.
  const walk = card(page, 'Dog Walking')
  await walk.getByRole('button', { name: 'Cancel booking' }).click()
  await walk.getByRole('button', { name: 'Yes, cancel it' }).click()
  await expect(card(page, 'Dog Walking')).toContainText('Cancelled')

  // Someone did the other job (set up directly in the database to keep the test short).
  await sql(`insert into auth.users (email, raw_user_meta_data) values ('pro@example.com', '{"full_name":"Niamh Walsh","role":"pro"}')`)
  await sql(`update public.bookings set status = 'completed', pro_id = (select id from public.profiles where full_name = 'Niamh Walsh') where status = 'requested'`)
  await page.reload()
  await page.getByRole('button', { name: 'My Bookings' }).click()

  const repair = card(page, 'Mobile Mechanic')
  await repair.getByRole('button', { name: 'Pay €45.00' }).click()
  await page.getByRole('link', { name: 'Cancel and go back' }).click()
  await expect(toast(page)).toContainText('Nothing was charged')
  await page.getByRole('button', { name: 'My Bookings' }).click()
  await expect(card(page, 'Mobile Mechanic')).toContainText('Payment due')
  expect(await sql('select count(*)::int as n from public.payments')).toEqual([{ n: 0 }])
})

test('Quick Book opens the booking form for that service', async ({ page }) => {
  await register(page, { name: 'Aoife Byrne', email: 'aoife@example.com' })
  await page.getByRole('button', { name: 'Eco Car Valeting' }).click()
  await expect(dialog(page).getByRole('heading')).toHaveText('Book Eco Car Valeting')
  await expect(dialog(page).getByRole('radio')).toHaveCount(3)
  await ageAllRequests() // (nothing to age; keeps the helper exercised from every file that books)
})
