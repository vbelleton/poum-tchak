const { test, expect, rubrique } = require('./outils/base');
test('casque : mots et verdicts réglés comme sur le téléphone, playlist précédent', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  const vr = () => page.evaluate(() => { const v = window.__gm.vr(); return v && v.debug(); });
  await expect.poll(async () => (await vr())?.placed).toBe(true);
  await page.evaluate(() => { window.__gm.vr().menuPress('affmenu'); window.__gm.vr().menuPress('words:non'); });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.jeux')).words)).toBe('non');
  await page.evaluate(() => window.__gm.vr().menuPress('popAt:cache'));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.jeux')).popAt)).toBe('cache');
  expect(await page.evaluate(() => window.__gm.vr().menuIds())).toContain('back');
});
