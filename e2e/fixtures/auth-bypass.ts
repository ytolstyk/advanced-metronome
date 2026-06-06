import { test as base, type Page } from '@playwright/test';

async function blockAmplifyNetwork(page: Page) {
  await page.route('**appsync**', route => route.abort());
  await page.route('**/cognito-idp/**', route => route.abort());
  await page.route('**cognito.us-west-2.amazonaws.com**', route => route.abort());
}

export const test = base.extend<object>({
  page: async ({ page }, use) => {
    await blockAmplifyNetwork(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
