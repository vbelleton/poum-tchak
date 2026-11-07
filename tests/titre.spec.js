const { test, expect } = require('@playwright/test');
test('titre revient', async ({ page }) => {
  await page.goto('/');
  await page.locator('#kit button').first().click();
  await expect(page.locator('#word')).not.toHaveText('Poum Tchak');
  await expect(page.locator('#word')).toHaveText('Poum Tchak', { timeout: 6000 });
});
