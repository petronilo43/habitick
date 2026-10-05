import { ageAllRequests, book, card, expect, logIn, logOut, register, test, toast } from './helpers'

const aoife = { name: 'Aoife Byrne', email: 'aoife@example.com' }
const sean = { name: 'Seán Kelly', email: 'sean@example.com', role: 'pro' }
const niamh = { name: 'Niamh Walsh', email: 'niamh@example.com', role: 'pro' }

test('when two pros go for the same job, the second is told it is gone', async ({ page, otherPage, browser }) => {
  await register(page, aoife)
  await book(page, { service: 'House Painting', option: 'One room', days: 2 })
  await ageAllRequests()

  await register(otherPage, sean)
  const third = await (await browser.newContext()).newPage()
  await third.addInitScript(() => sessionStorage.setItem('habitickIntroSeen', 'true'))
  await register(third, niamh)

  // Both have the job on screen; Seán is quicker.
  await expect(card(third, 'House Painting')).toBeVisible()
  await card(otherPage, 'House Painting').getByRole('button', { name: 'Accept job' }).click()
  await expect(toast(otherPage)).toContainText('Job accepted')

  await card(third, 'House Painting').getByRole('button', { name: 'Accept job' }).click()
  await expect(toast(third)).toContainText('This job is no longer available.')
  await expect(third.getByText('No open requests at the moment.')).toBeVisible()
  await third.context().close()
})

test('a pro only sees requests for the services and areas they chose', async ({ page, otherPage }) => {
  await register(page, aoife)
  await book(page, { service: 'Dog Walking', option: '30 minutes', eircode: 'V94 T9PX', days: 1 })
  await book(page, { service: 'Gardening & Lawn', option: 'Lawn mowing €', eircode: 'T12 X70A', days: 1 })
  await ageAllRequests()

  await register(otherPage, sean)
  await expect(otherPage.getByRole('article')).toHaveCount(2)

  // Gardening only.
  await otherPage.getByRole('button', { name: 'Settings' }).click()
  await otherPage.getByRole('checkbox', { name: 'Gardening & Lawn' }).check()
  await otherPage.getByRole('button', { name: 'Save what I offer' }).click()
  await expect(toast(otherPage)).toContainText('Saved')
  await otherPage.getByRole('button', { name: 'Overview' }).click()
  await expect(otherPage.getByRole('article')).toHaveCount(1)
  await expect(card(otherPage, 'Gardening & Lawn')).toContainText('T12 area')

  // Gardening, but only around Limerick: nothing matches.
  await otherPage.getByRole('button', { name: 'Settings' }).click()
  await otherPage.getByLabel('Areas you cover').fill('Limerick')
  await otherPage.getByRole('button', { name: 'Save what I offer' }).click()
  await expect(otherPage.getByRole('alert')).toContainText('first 3 characters of an Eircode')
  await otherPage.getByLabel('Areas you cover').fill('v94')
  await otherPage.getByRole('button', { name: 'Save what I offer' }).click()
  await expect(toast(otherPage)).toContainText('Saved')
  await otherPage.getByRole('button', { name: 'Overview' }).click()
  await expect(otherPage.getByText('No open requests at the moment.')).toBeVisible()

  // The choices are still there after logging in again.
  await logOut(otherPage)
  await logIn(otherPage, sean)
  await otherPage.getByRole('button', { name: 'Settings' }).click()
  await expect(otherPage.getByRole('checkbox', { name: 'Gardening & Lawn' })).toBeChecked()
  await expect(otherPage.getByLabel('Areas you cover')).toHaveValue('V94')
})

test('a job for a later day cannot be finished yet, and can be given back', async ({ page, otherPage }) => {
  await register(page, aoife)
  await book(page, { service: 'Massage Therapy', option: 'Deep tissue', days: 5 })
  await ageAllRequests()

  await register(otherPage, sean)
  await card(otherPage, 'Massage Therapy').getByRole('button', { name: 'Accept job' }).click()
  await otherPage.getByRole('button', { name: 'My Jobs' }).click()

  const job = card(otherPage, 'Massage Therapy')
  await expect(job.getByRole('button', { name: 'Mark as done' })).toHaveCount(0)
  await expect(job).toContainText('You can mark it as done on')

  await job.getByRole('button', { name: 'Give job back' }).click()
  await job.getByRole('button', { name: 'Yes, give it back' }).click()
  await expect(otherPage.getByText('Nothing booked in yet.')).toBeVisible()

  // It is on offer again, and Aoife is back to waiting.
  await otherPage.getByRole('button', { name: 'Overview' }).click()
  await expect(card(otherPage, 'Massage Therapy')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(card(page, 'Massage Therapy')).toContainText('Waiting for a pro')
})

test('the Pro plan can be bought on the payment page', async ({ page }) => {
  await register(page, sean)
  await page.getByRole('button', { name: 'Pro Plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'You are on the free plan' })).toBeVisible()

  await page.getByRole('button', { name: 'Get 30 days for €7.00' }).click()
  await expect(page.getByRole('heading', { name: 'Habitick Pro, 30 days' })).toBeVisible()
  await page.getByRole('button', { name: 'Pay' }).click()

  await expect(toast(page)).toContainText('Welcome to Pro')
  await expect(page.getByRole('heading', { name: 'You are a Pro member' })).toBeVisible()
  await expect(page.getByText('30 days left')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add 30 days for €7.00' })).toBeVisible()
})
