import { book, card, expect, sql, test, toast } from './helpers'

test('a visitor can try both sides of the site without registering', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try it as a client' }).click()

  // ---- as a client: sample bookings in every state ----
  await expect(page.getByText('You are in the demo.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Guest')
  await page.getByRole('button', { name: 'My Bookings' }).click()
  await expect(page.getByRole('article')).toHaveCount(4)
  await expect(card(page, 'Home Cleaning')).toContainText('Seán Kelly')
  await expect(card(page, 'Home Cleaning')).toContainText('4.7 (3 reviews)')

  // Nobody is really on the other side, so the guest plays Seán's part.
  const walk = card(page, 'Dog Walking')
  await expect(walk).toContainText('Waiting for a pro')
  await walk.getByRole('button', { name: 'Demo: let Seán accept this' }).click()
  await expect(walk).toContainText('Confirmed')
  await walk.getByRole('button', { name: 'Demo: let Seán finish the job' }).click()
  await expect(card(page, 'Dog Walking')).toContainText('Payment due')

  // A new booking works like anyone else's.
  await book(page, { service: 'Item Transport', option: 'Small bags', days: 2 })
  await expect(card(page, 'Item Transport')).toContainText('€20.00')

  // ---- as a professional ----
  await page.getByRole('button', { name: 'Switch to providing mode' }).click()
  await expect(page.getByText('1 new request is in Pro early access')).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByRole('article').filter({ hasText: 'Item Transport' })).toHaveCount(0) // never your own request

  await card(page, 'Eco Car Valeting').getByRole('button', { name: 'Accept job' }).click()
  await page.getByRole('button', { name: 'My Jobs' }).click()
  await expect(card(page, 'Eco Car Valeting')).toContainText('Aoife Byrne')

  // Today's job: do it, then let "Aoife" pay and review.
  const today = card(page, 'Item Transport')
  await today.getByRole('button', { name: 'Mark as done' }).click()
  await card(page, 'Item Transport').getByRole('button', { name: 'Demo: let Aoife pay and review' }).click()
  await expect(card(page, 'Item Transport')).toContainText('Paid')
  await expect(card(page, 'Item Transport')).toContainText('Great job, thank you!')
  await page.getByRole('button', { name: 'Overview' }).click()
  await expect(page.getByText('Earned', { exact: true }).locator('..')).toContainText('€109.00') // €74 from before, €35 now

  // ---- ending the demo removes everything it made ----
  await page.getByRole('button', { name: 'End the demo' }).first().click()
  await page.getByRole('button', { name: 'End the demo' }).last().click()
  await page.getByRole('button', { name: 'Yes, end it' }).click()
  await expect(toast(page)).toContainText('The demo and its data have been deleted.')
  await expect(page.getByRole('button', { name: 'Try it as a client' })).toBeVisible()
  expect(await sql('select (select count(*) from public.profiles)::int as people, (select count(*) from public.bookings)::int as bookings')).toEqual([
    { people: 0, bookings: 0 },
  ])
})

test('a demo never mixes with real accounts', async ({ page, otherPage }) => {
  // A real pro is logged in elsewhere.
  await sql(`insert into auth.users (email, raw_user_meta_data) values ('real@example.com', '{"full_name":"Real Client"}')`)
  await sql(
    `insert into public.bookings (client_id, service_id, option_id, option, total_cents, eircode, scheduled_date, created_at)
     select id, 4, 42, '1 hour', 1500, 'V94 T9PX', public.today() + 1, now() - interval '1 hour' from public.profiles where full_name = 'Real Client'`,
  )

  await otherPage.goto('/')
  await otherPage.getByRole('button', { name: 'Try it as a professional' }).click()
  await expect(otherPage.getByRole('heading', { name: 'Available Jobs' })).toBeVisible()

  // The guest sees the two sample requests, not the real one (a dog walk).
  await expect(otherPage.getByRole('article')).toHaveCount(2)
  await expect(otherPage.getByRole('article').filter({ hasText: 'Dog Walking' })).toHaveCount(0)
  await expect(page).toHaveURL('about:blank') // the first window was not needed
})
