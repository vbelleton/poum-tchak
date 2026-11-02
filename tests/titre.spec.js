const { test, expect } = require('@playwright/test');
test('titre revient', async ({ page }) => {
  await page.goto('/');
  await page.locator('#kit button').first().click();
  await expect(page.locator('#word')).not.toHaveText('poum tchak');
  await expect(page.locator('#word')).toHaveText('poum tchak', { timeout: 6000 });
});
