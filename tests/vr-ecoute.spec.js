// VR : « Écoute puis rejoue » : la batterie joue un passage (les pads s'allument), puis on le rejoue.
const { test, expect, rubrique } = require('./outils/base');

test('aperçu VR : écoute (pads allumés), puis à toi, et le rejouer compte', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  const vr = () => page.evaluate(() => { const v = window.__gm.vr(); return v && v.debug(); });
  await expect.poll(async () => (await vr())?.placed).toBe(true);
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('echo'); v.menuPress('lvl:facile'); v.menuPress('tol:sansechec'); for (let i = 0; i < 8; i++) v.menuPress('bpm+'); });
  expect(await page.evaluate(() => [window.__gm.vrApi.opts().echo, localStorage.getItem('poumtchak.vr.ecoute')])).toEqual([true, '1']);
  await page.evaluate(() => window.__gm.vr().menuPress('play'));
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
  expect(await page.evaluate(() => window.__gm.chart().kind)).toBe('echo');
  await expect.poll(async () => (await page.evaluate(() => window.__gm.vrApi.echoNow()))?.phase, { timeout: 15_000 }).toBe('listen');
  await expect.poll(async () => (await vr()).echoFlashes, { timeout: 15_000 }).toBeGreaterThan(0);
  // le robot ne joue que pendant « À toi »
  const joue = await page.evaluate(async () => {
    const g = window.__gm, v = g.vr();
    let n = 0;
    for (const note of g.notes()) {
      while (g.on() && g.now() < note.t - 0.008) await new Promise((f) => setTimeout(f, 2));
      if (!g.on()) break;
      if (g.vrApi.echoNow().phase !== 'play') return -1;
      v.simStrike(note.lane);
      if (++n >= 3) break;
    }
    return n;
  });
  expect(joue).toBe(3);
  const sc = await page.evaluate(() => window.__gm.sc());
  expect(sc.perfect + sc.good + sc.approx).toBeGreaterThan(0);
  expect((await vr()).echoPhase).toBe('play');
});
