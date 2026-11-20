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

test('aperçu VR : les mains fantômes jouent pendant l\'écoute, et on peut les cacher', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  const vr = () => page.evaluate(() => { const v = window.__gm.vr(); return v && v.debug(); });
  await expect.poll(async () => (await vr())?.placed).toBe(true);
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('echo'); v.menuPress('lvl:facile'); v.menuPress('tol:sansechec'); for (let i = 0; i < 8; i++) v.menuPress('bpm+'); });
  // le bouton n'est là qu'avec Écoute puis rejoue ; par défaut, les mains sont visibles
  expect(await page.evaluate(() => window.__gm.vr().menuIds())).toContain('ghost');
  expect((await vr()).ghostOn).toBe(true);
  // « Fantôme » passe écoute → avec moi → non → écoute ; « Kick » se règle ; tout est retenu
  expect((await vr()).ghostMode).toBe('ecoute');
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('ghostkick'); v.menuPress('ghost'); v.menuPress('ghost'); });
  expect(await page.evaluate(() => [localStorage.getItem('poumtchak.vr.fantome'), localStorage.getItem('poumtchak.vr.fantomekick')])).toEqual(['non', 'non']);
  expect(await vr()).toMatchObject({ ghostOn: false, ghostKick: false });
  expect(await page.evaluate(() => window.__gm.vr().menuIds())).not.toContain('ghostkick');
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('ghost'); v.menuPress('ghostkick'); });
  expect(await vr()).toMatchObject({ ghostOn: true, ghostKick: true, ghostMode: 'ecoute' });
  await page.evaluate(() => window.__gm.vr().menuPress('play'));
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
  // pendant l'écoute, au moins une main fantôme est là, et elle descend jusqu'à la surface à l'instant d'un coup
  let minLift = 1, vues = 0, pied = 0;
  for (let i = 0; i < 400 && (await page.evaluate(() => window.__gm.vrApi.echoNow()))?.phase !== 'count'; i++) {
    const d = await vr();
    if (d.pedal) pied = Math.max(pied, d.pedal.presses);
    if (d.ghost.some((h) => h.v)) { vues++; for (const h of d.ghost) if (h.v) minLift = Math.min(minLift, h.lift); }
    await page.waitForTimeout(15);
  }
  expect(vues).toBeGreaterThan(3);
  expect(minLift).toBeLessThan(0.05);
  expect(pied).toBeGreaterThan(0); // le pied appuie sur la pédale aux coups de grosse caisse
});


test('aperçu VR : « Fantôme : avec moi » joue les notes du chant avec moi, et « Mes mains » montre mes mains', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  const vr = () => page.evaluate(() => { const v = window.__gm.vr(); return v && v.debug(); });
  await expect.poll(async () => (await vr())?.placed).toBe(true);
  expect((await vr()).handVis).toBe('non');
  await page.evaluate(() => window.__gm.vr().menuPress('myhands'));
  expect(await vr()).toMatchObject({ handVis: 'oui' });
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('ghost'); v.menuPress('lvl:facile'); v.menuPress('tol:sansechec'); });
  expect((await vr()).ghostMode).toBe('avec');
  expect(await page.evaluate(() => localStorage.getItem('poumtchak.vr.fantome'))).toBe('avec');
  await page.evaluate(() => window.__gm.vr().menuPress('play'));
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
  expect(await page.evaluate(() => window.__gm.chart().kind)).not.toBe('echo');
  let minLift = 1, vues = 0, anneaux = 0;
  for (let i = 0; i < 250; i++) {
    const d = await vr();
    if (d.ghost.some((h) => h.v)) { vues++; for (const h of d.ghost) if (h.v) { minLift = Math.min(minLift, h.lift); if (h.ring) anneaux++; } }
    if (vues > 10 && minLift < 0.05 && anneaux) break;
    await page.waitForTimeout(15);
  }
  expect(vues).toBeGreaterThan(3);
  expect(minLift).toBeLessThan(0.05);
  expect(anneaux).toBeGreaterThan(0);
  // les mains du fantôme sont les vraies mains (modèle chargé)
  await expect.poll(async () => (await vr()).ghost.map((h) => h.model)).toEqual([true, true]);
});
