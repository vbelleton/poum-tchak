// VR, côté ludique : bannière quand le multiplicateur monte (et quand une série est perdue),
// avance/retard sous « Bien », et la progression dans le chant au tableau des scores.
const { test, expect, rubrique } = require('./outils/base');

test('aperçu VR : ×2 annoncé, série perdue annoncée, progression du chant affichée', async ({ page }) => {
  test.setTimeout(100_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  const vr = () => page.evaluate(() => { const v = window.__gm.vr(); return v && v.debug(); });
  await expect.poll(async () => (await vr())?.placed).toBe(true);
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('lvl:facile'); v.menuPress('tol:indulgent'); v.menuPress('play'); });
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
  // le robot joue juste jusqu'à 9 coups de suite, puis s'arrête : la série casse
  await page.evaluate(async () => {
    const g = window.__gm, v = g.vr();
    let n = 0;
    for (const note of g.notes()) {
      while (g.on() && g.now() < note.t - 0.008) await new Promise((f) => setTimeout(f, 2));
      if (!g.on()) break;
      v.simStrike(note.lane);
      if (++n >= 9 && g.sc().streak >= 9) break;
    }
  });
  await expect.poll(async () => (await vr()).banners).toContain('×2 !');
  expect((await vr()).hudText).toMatch(/Série de \d+ {2}· {2}\d+ % du chant/);
  await expect.poll(async () => (await vr()).banners, { timeout: 40_000 }).toContain('Série perdue');
});
