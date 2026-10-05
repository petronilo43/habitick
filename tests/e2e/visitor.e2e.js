import { dialog, expect, test } from './helpers'

test.describe('a visitor who is not logged in', () => {
  test('sees the services and the exact price of every option', async ({ page }) => {
    await page.goto('/')
    const services = page.locator('#services-grid')
    await expect(services.getByRole('heading', { level: 3 })).toHaveCount(9)
    await expect(services).toContainText('€14.50 an hour') // paid by the hour
    await expect(services).toContainText('From €29.00') // paid per job

    await page.getByRole('button', { name: 'Home Cleaning' }).click()
    await expect(dialog(page)).toContainText('Studio or 1 bedroom · 2 hours')
    await expect(dialog(page)).toContainText('€43.50')
  })

  test('is asked to create an account before booking', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Dog Walking' }).click()
    await dialog(page).getByRole('button', { name: 'Book This Service' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Create Account' })).toBeVisible()
  })

  test('can use the windows with the keyboard alone', async ({ page }) => {
    await page.goto('/')
    const opener = page.getByRole('button', { name: 'Dog Walking' })
    await opener.focus()
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeVisible()

    // Tab goes round inside the window and never reaches the page behind it.
    for (let presses = 0; presses < 5; presses++) {
      await page.keyboard.press('Tab')
      expect(await dialog(page).evaluate((node) => node.contains(document.activeElement))).toBe(true)
    }

    // Escape closes it and puts the focus back where it was.
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('is told what working as a pro involves, with the plan’s real numbers', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Become a Pro' }).click()
    await expect(dialog(page)).toContainText('€7.00')
    await expect(dialog(page)).toContainText('See new requests 5 minutes before everyone else')
    await dialog(page).getByRole('button', { name: 'Create a pro account' }).click()
    await expect(dialog(page).getByRole('button', { name: 'Pro' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('can read what the site stores about people', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Privacy and your data' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy and your data')
    await expect(page.getByText('first three characters')).toBeVisible()
  })

  test('gets a helpful page for an address that does not exist', async ({ page }) => {
    await page.goto('/this/page/does-not-exist')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('There is no page at this address')
    await page.getByRole('link', { name: 'See the services' }).click()
    await expect(page.locator('#services-grid')).toBeVisible()
  })

  test('cannot open the dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible()
  })
})
