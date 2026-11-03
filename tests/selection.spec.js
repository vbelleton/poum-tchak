const { test, expect, rubrique } = require('./outils/base');
test('pas de sélection pendant le jeu', async ({ page }) => {
  expect(await page.locator('html').getAttribute('translate')).toBe('no');
  await rubrique(page, 'Mains');
  await page.locator('#play').click();
  await expect(page.locator('body')).toHaveClass(/mn-live/);
  const r = await page.evaluate(() => {
    const e = new Event('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector('#mnBeat').dispatchEvent(e);
    return { prevented: e.defaultPrevented, us: getComputedStyle(document.body).userSelect };
  });
  expect(r).toEqual({ prevented: true, us: 'none' });
});
