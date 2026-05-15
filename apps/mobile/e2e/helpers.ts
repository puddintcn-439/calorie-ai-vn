import { Page } from '@playwright/test';

export async function setAuthToken(page: Page, token = 'test-token', userId = 'user-1') {
  await page.addInitScript((t: string, u: string) => {
    localStorage.setItem('auth_token', t);
    localStorage.setItem('user_id', u);
  }, token, userId);
}

export function jsonResponse(obj: any) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(obj),
  };
}
