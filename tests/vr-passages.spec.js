// VR : travailler un passage difficile depuis la pause : reculer, avancer de 4 mesures, boucler 4 mesures.
const { test, expect, rubrique } = require('./outils/base');

test('aperçu VR : pause → 4 mesures plus loin, plus tôt, puis boucle sur 4 mesures', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  const vr = () => page.evaluate(() => { const v = window.__gm.vr(); return v && v.debug(); });
  await expect.poll(async () => (await vr())?.placed).toBe(true);
  const api = (f, a) => page.evaluate(([f, a]) => window.__gm.vrApi[f](a), [f, a]);
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('tol:sansechec'); for (let i = 0; i < 8; i++) v.menuPress('bpm+'); v.menuPress('play'); });
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
  await expect.poll(async () => (await api('bars')).n).toBeGreaterThan(8);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await page.evaluate(() => window.__gm.vr().state())).paused).toBe(true);
  expect(await page.evaluate(() => window.__gm.vr().menuIds())).toEqual(expect.arrayContaining(['resume', 'bar-', 'loop4', 'bar+']));
  const i0 = (await api('bars')).i;
  await page.evaluate(() => window.__gm.vr().menuPress('bar+'));
  expect((await api('bars')).i).toBe(i0 + 4);
  await page.evaluate(() => window.__gm.vr().menuPress('bar-'));
  expect((await api('bars')).i).toBe(i0);
  // les notes de ce passage redeviennent à jouer
  const t = await page.evaluate(() => window.__gm.now());
  expect(await page.evaluate((t) => window.__gm.notes().filter((n) => n.t >= t && n.done).length, t)).toBe(0);
  // boucle : la partie reprend, et revient au début du passage à la fin des 4 mesures
  await page.evaluate(() => window.__gm.vr().menuPress('loop4'));
  await expect.poll(async () => (await page.evaluate(() => window.__gm.vr().state())).paused).toBe(false);
  const ab = (await api('bars')).ab;
  expect(ab.j - ab.i).toBe(4);
  await expect.poll(async () => (await api('bars')).ab?.laps, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.__gm.on())).toBe(true);
  const b = await api('bars');
  expect(b.i).toBeGreaterThanOrEqual(ab.i - 1);
  expect(b.i).toBeLessThan(ab.j);
  // en pause, « Fin de boucle » arrête la boucle
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__gm.vr().menuPress('loop4'));
  expect((await api('bars')).ab).toBe(null);
});
