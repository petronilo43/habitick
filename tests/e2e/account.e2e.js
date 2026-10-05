import { dialog, expect, logIn, logOut, recoveryLink, register, sql, test, toast } from './helpers'

const aoife = { name: 'Aoife Byrne', email: 'aoife@example.com' }

test('a wrong password gives a clear message and keeps what was typed', async ({ page }) => {
  await register(page, aoife)
  await logOut(page)

  await page.getByRole('button', { name: 'Login' }).click()
  await dialog(page).getByLabel('Email').fill(aoife.email)
  await dialog(page).getByLabel('Password').fill('not-my-password')
  await dialog(page).getByRole('button', { name: 'Log In' }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText('Wrong email or password.')
  await expect(dialog(page).getByLabel('Email')).toHaveValue(aoife.email)
})

test('a forgotten password can be replaced through the emailed link', async ({ page }) => {
  await register(page, aoife)
  await logOut(page)

  // Asking for the link.
  await page.getByRole('button', { name: 'Login' }).click()
  await dialog(page).getByRole('button', { name: 'Forgot your password?' }).click()
  await dialog(page).getByLabel('Email').fill(aoife.email)
  await dialog(page).getByRole('button', { name: 'Send reset link' }).click()
  await expect(dialog(page)).toContainText('Check your inbox')
  await expect(dialog(page)).toContainText(aoife.email)

  // Following it (the test server hands over what the email would contain).
  await page.goto(await recoveryLink(aoife.email))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose a new password')
  await page.getByLabel('New password').fill('brand-new-password')
  await page.getByLabel('Type it again').fill('something-else')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByRole('alert')).toContainText('do not match')
  await page.getByLabel('Type it again').fill('brand-new-password')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(toast(page)).toContainText('new password is saved')

  // The new password works; the old one does not.
  await logOut(page)
  await logIn(page, { email: aoife.email, password: 'brand-new-password' })
})

test('the reset page explains itself when opened without a valid link', async ({ page }) => {
  await page.goto('/reset-password')
  await expect(page.getByText('has expired or was already used')).toBeVisible()
  await page.getByRole('button', { name: 'Send me a new link' }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Reset your password' })).toBeVisible()
})

test('a project that confirms emails sends people to their inbox first', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  const form = dialog(page)
  await form.getByLabel('Full name').fill('Cian Doyle')
  await form.getByLabel('Email', { exact: true }).fill('cian@confirm.test')
  await form.getByLabel('Confirm Email').fill('cian@confirm.test')
  await form.getByLabel('Password', { exact: true }).fill('secret123')
  await form.getByLabel('Confirm', { exact: true }).fill('secret123')
  await form.getByRole('button', { name: 'Register Account' }).click()
  await expect(toast(page)).toContainText('Check your inbox')
  await expect(dialog(page).getByRole('heading', { name: 'Welcome Back' })).toBeVisible()
})

test('people can change their name and delete their account', async ({ page }) => {
  await register(page, aoife)
  await page.getByRole('button', { name: 'Settings' }).click()

  await page.getByLabel('Full name').fill('Aoife O’Brien')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(toast(page)).toContainText('Settings saved.')

  // Deleting asks first, and "no" really means no.
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(dialog(page)).toContainText('This cannot be undone.')
  await dialog(page).getByRole('button', { name: 'No, keep it' }).click()
  expect(await sql('select full_name from public.profiles')).toEqual([{ full_name: 'Aoife O’Brien' }])

  await page.getByRole('button', { name: 'Delete my account' }).click()
  await dialog(page).getByRole('button', { name: 'Yes, delete everything' }).click()
  await expect(toast(page)).toContainText('Your account and its data have been deleted.')
  await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible()
  expect(await sql('select count(*)::int as n from auth.users')).toEqual([{ n: 0 }])

  // The login is gone too.
  await page.getByRole('button', { name: 'Login' }).click()
  await dialog(page).getByLabel('Email').fill(aoife.email)
  await dialog(page).getByLabel('Password').fill('secret123')
  await dialog(page).getByRole('button', { name: 'Log In' }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText('Wrong email or password.')
})
