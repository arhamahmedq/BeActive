import { test, expect } from '@playwright/test'

test.describe('Authentication flows', () => {
  test('unauthenticated user is redirected from /feed to /login', async ({ page }) => {
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/login/)
  })

  test('root / redirects to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page renders with email and password fields', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('signup page renders with all fields', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Username')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  })

  test('login page has link to signup', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('link', { name: 'Create one' })).toBeVisible()
  })

  test('signup page has link to login', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  test('shows error on invalid login credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('notauser@example.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Invalid email or password.')).toBeVisible({ timeout: 5000 })
  })

  test('shows validation error for short password on signup', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Username').fill('testuser')
    await page.getByLabel('Password').fill('short')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText(/8/)).toBeVisible({ timeout: 5000 })
  })

  test('verify-email page renders with check your email heading', async ({ page }) => {
    await page.goto('/verify-email?email=test%40example.com')
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    await expect(page.getByText('test@example.com')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resend confirmation email' })).toBeVisible()
  })

  test('verify-email page has links back to signup and login', async ({ page }) => {
    await page.goto('/verify-email')
    await expect(page.getByRole('link', { name: 'Sign up again' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  test('signup page shows error from callback verification_failed param', async ({ page }) => {
    await page.goto('/signup?error=verification_failed')
    await expect(
      page.getByText('Email verification link has expired or already been used.')
    ).toBeVisible()
  })
})
