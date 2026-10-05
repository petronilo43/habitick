import { book, card, dialog, expect, register, sql, test, toast } from './helpers'

// The site as it runs before Stripe is connected, which is how it starts out. These
// tests use a second copy of the site, built with payments switched off (.env.e2e-nopay).
test.use({ baseURL: 'http://localhost:4174' })

test('without payments, a finished job asks for a review and for nothing else', async ({ page }) => {
  await register(page, { name: 'Aoife Byrne', email: 'aoife@example.com' })
  await book(page, { service: 'Dog Walking', option: '1 hour' })

  // A pro did the job (set up directly in the database to keep the test short).
  await sql(`insert into auth.users (email, raw_user_meta_data) values ('pro@example.com', '{"full_name":"Niamh Walsh","role":"pro"}')`)
  await sql(`update public.bookings set status = 'completed', pro_id = (select id from public.profiles where full_name = 'Niamh Walsh')`)
  await page.reload()
  await page.getByRole('button', { name: 'Overview' }).click()

  const waiting = page.getByRole('heading', { name: 'Finished: Waiting For Your Review' })
  await expect(waiting).toBeVisible()
  const walk = card(page, 'Dog Walking')
  await expect(walk).toContainText('Done')
  await expect(walk).not.toContainText('Payment due')
  await expect(walk.getByRole('button', { name: /Pay/ })).toHaveCount(0)

  // Once it is reviewed, nothing is left to do and it moves to the past bookings.
  await walk.getByRole('button', { name: 'Leave a review' }).click()
  await dialog(page).getByRole('radio', { name: '5 stars' }).dispatchEvent('click')
  await dialog(page).getByRole('button', { name: 'Send review' }).click()
  await expect(toast(page)).toContainText('review is saved')
  await expect(waiting).toHaveCount(0)
  await page.getByRole('button', { name: 'My Bookings' }).click()
  await expect(card(page, 'Dog Walking')).toContainText('Done')
})

test('without payments, a pro can still try the plan and sees what their jobs were worth', async ({ page }) => {
  await register(page, { name: 'Seán Kelly', email: 'sean@example.com', role: 'pro' })

  // A finished job that was never paid for, because nothing can be paid for here.
  await sql(`insert into auth.users (email, raw_user_meta_data) values ('client@example.com', '{"full_name":"Aoife Byrne"}')`)
  await sql(`insert into public.bookings (client_id, pro_id, service_id, option_id, option, total_cents, eircode, scheduled_date, status)
             select c.id, p.id, 2, 21, 'Lawn mowing', 2900, 'V94 T9PX', public.today(), 'completed'
               from public.profiles c, public.profiles p
              where c.full_name = 'Aoife Byrne' and p.full_name = 'Seán Kelly'`)
  await page.reload()

  const earned = page.getByText('Earned', { exact: true }).locator('..')
  await expect(earned).toContainText('€29.00')
  await expect(earned).toContainText('From the jobs you completed')

  // The plan can be tried for free; buying it is not offered.
  await page.getByRole('button', { name: 'Pro Plan' }).click()
  await expect(page.getByRole('button', { name: /Get 30 days/ })).toHaveCount(0)
  await expect(page.getByText('Buying the plan is not switched on')).toBeVisible()
  await page.getByRole('button', { name: 'Start my 14-day free trial' }).click()
  await expect(page.getByRole('heading', { name: /You are a Pro member/ })).toBeVisible()
})
