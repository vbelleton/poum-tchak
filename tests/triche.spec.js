// Pas de triche : taper sans arrêt ne fait pas réussir.
const { test, expect, rubrique } = require('./outils/base');

test('marteler le pad fait baisser le score : les coups en trop comptent comme ratés', async ({ page }) => {
  test.setTimeout(60_000);
  await rubrique(page, 'Mains');
  await page.locator('#bpmIn').fill('80');
  await page.locator('#bpmIn').press('Enter');
  await page.locator('#mnColL .mn-opt[data-v="1"]').click();
  await page.locator('#mnColR .mn-opt[data-v="1"]').click();
  await page.locator('#play').click();
  await page.evaluate(async () => {
    const pad = document.querySelector('#mnPadR');
    const fin = performance.now() + 9000;
    while (performance.now() < fin) { pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise((r) => setTimeout(r, 45)); }
  });
  const txt = await page.locator('#mnStatR').textContent();
  const pct = parseInt(txt.match(/(\d+) %/)[1], 10);
  expect(pct, txt).toBeLessThan(30);
  expect(txt).toContain('comptés comme ratés');
});
