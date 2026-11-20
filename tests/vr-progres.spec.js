// VR : après chaque partie, la courbe des dernières parties sur ce chant (justesse) s'affiche dans le casque.
const { test, expect, rubrique } = require('./outils/base');

test('aperçu VR : deux parties sur le même chant, la deuxième montre la progression', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  const vr = () => page.evaluate(() => { const v = window.__gm.vr(); return v && v.debug(); });
  await expect.poll(async () => (await vr())?.placed).toBe(true);
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('lvl:facile'); v.menuPress('tol:sansechec'); });
  // une partie : le robot joue juste les `n` premières notes, puis la partie se termine
  const partie = async (n) => {
    await page.evaluate(() => window.__gm.vr().menuPress('play'));
    await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
    await page.evaluate(async (n) => {
      const g = window.__gm, v = g.vr();
      for (const note of g.notes().slice(0, n)) {
        while (g.on() && g.now() < note.t - 0.008) await new Promise((f) => setTimeout(f, 2));
        v.simStrike(note.lane);
      }
      await new Promise((f) => setTimeout(f, 300));
      g.vrApi.gm.ended = true; g.pls.fin();
    }, n);
    await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(false);
  };
  await partie(1);
  await expect.poll(async () => (await vr()).hist).toBe(1);
  expect((await vr()).histText).toContain('Première partie notée');
  await partie(6);
  await expect.poll(async () => (await vr()).hist).toBe(2);
  expect((await vr()).histText).toMatch(/(-?\+?\d+ %|pareil) depuis la dernière fois  ·  record \d+ %/);
  expect((await vr()).histShown).toBe(true);
});
