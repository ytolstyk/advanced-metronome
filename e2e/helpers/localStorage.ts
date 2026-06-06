import type { Page } from '@playwright/test';

export async function seedLocalStorage(page: Page, key: string, value: unknown) {
  await page.addInitScript(({ k, v }) => {
    localStorage.setItem(k, JSON.stringify(v));
  }, { k: key, v: value });
}

export async function clearLocalStorageKey(page: Page, key: string) {
  await page.addInitScript(({ k }) => {
    localStorage.removeItem(k);
  }, { k: key });
}
