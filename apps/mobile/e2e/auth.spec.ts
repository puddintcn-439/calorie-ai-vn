import { test, expect } from '@playwright/test';
import { jsonResponse } from './helpers';

test.describe('Auth flows', () => {
  test('register stores token in localStorage', async ({ page }) => {
    await page.route('**/auth/register', async (route) => {
      await route.fulfill(jsonResponse({ access_token: 'reg-token', user_id: 'user-1' }));
    });

    await page.goto('/register');

    await page.getByPlaceholder('Họ và tên (tuỳ chọn)').fill('Test User');
    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Mật khẩu (tối thiểu 6 ký tự)').fill('password123');

    await page.getByText('Tạo tài khoản').click();

    // wait briefly for store and localStorage to update
    await page.waitForTimeout(300);

    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBe('reg-token');
  });

  test('login stores token in localStorage', async ({ page }) => {
    await page.route('**/auth/login', async (route) => {
      await route.fulfill(jsonResponse({ access_token: 'login-token', user_id: 'user-1' }));
    });

    await page.goto('/login');

    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Mật khẩu').fill('password123');

    await page.getByText('Đăng nhập').click();

    await page.waitForTimeout(300);

    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBe('login-token');
  });
});
