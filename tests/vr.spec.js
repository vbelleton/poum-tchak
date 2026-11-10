// Réalité virtuelle : sans casque, le bouton reste caché ; avec ?vr=apercu, la scène 3D s'ouvre à l'écran
// et un robot y joue avec des baguettes simulées (la même détection de coups que les manettes).
const { test, expect, rubrique } = require('./outils/base');

test('sans casque, pas de bouton VR', async ({ page }) => {
  await rubrique(page, 'Jeux');
  await expect(page.locator('#gmGo')).toBeVisible();
  await expect(page.locator('#gmVR')).toBeHidden();
});

test('aperçu VR : vérifier les pads, jouer aux baguettes, revenir', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmGames [data-v="couloirs"]').click();
  for (let i = 0; i < 25; i++) await page.locator('#gmUp').click();
  await page.locator('#gmVR').click();
  await expect(page.locator('#vrPreview')).toBeVisible();
  const vr = () => page.evaluate(() => window.__gm.vr().debug());
  await expect.poll(async () => (await vr()).placed).toBe(true);
  expect((await vr()).pads).toEqual(['poum', 'tchak', 'tss', 'doum', 'toum', 'psch']);

  // vérification des pads : chaque coup de baguette coche son pad, sans lancer la partie
  await page.evaluate(() => [0, 1, 2, 3, 4, 5].forEach((l) => window.__gm.vr().simStrike(l)));
  await expect.poll(async () => (await vr()).checked.length).toBe(6);
  expect(await page.evaluate(() => window.__gm.on())).toBe(false);

  // le menu du casque : changer le rythme, le nombre de notes et la tolérance, sans retirer le casque
  const ids = await page.evaluate(() => window.__gm.vr().menuIds());
  expect(ids).toEqual(expect.arrayContaining(['src-', 'src+', 'lvl:moyen', 'tol:indulgent', 'bpm+', 'slow', 'play', 'quit']));
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('lvl:moyen'); v.menuPress('tol:indulgent'); v.menuPress('bpm-'); });
  let o = await page.evaluate(() => window.__gm.vrApi.opts());
  expect([o.lvl, o.tol, o.bpm]).toEqual(['moyen', 'indulgent', 210]);
  const avant = o.rh;
  await page.evaluate(() => window.__gm.vr().menuPress('src+'));
  expect((await page.evaluate(() => window.__gm.vrApi.opts())).rh).not.toBe(avant);
  await page.evaluate(() => window.__gm.vr().menuPress('src-'));
  expect((await page.evaluate(() => window.__gm.vrApi.opts())).rh).toBe(avant);
  await page.evaluate(() => window.__gm.vr().menuPress('lvl:facile'));

  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
  // Peu de notes : grosse caisse et caisse claire seulement
  expect((await vr()).active.sort()).toEqual([0, 1]);

  // le robot frappe chaque note à son instant, avec la baguette simulée (ou la gâchette pour la grosse caisse)
  const joue = await page.evaluate(async () => {
    const g = window.__gm, v = g.vr();
    let n = 0;
    for (const note of g.notes()) {
      if (note.t > 4) break;
      while (g.on() && g.now() < note.t - 0.008) await new Promise((f) => setTimeout(f, 2));
      if (!g.on()) break;
      v.simStrike(note.lane); n++;
    }
    await new Promise((f) => setTimeout(f, 60));
    return n;
  });
  expect(joue).toBeGreaterThan(4);
  const sc = await page.evaluate(() => window.__gm.sc());
  // chaque coup simulé donne une frappe, et une seule (notée, ou « en trop » si le robot, ralenti par
  // le dessin 3D sur un ordinateur sans carte graphique, frappe trop tard)
  expect(sc.perfect + sc.good + sc.approx + sc.extra).toBe(joue);

  // Échap arrête la partie (menu VR), puis quitte l'aperçu ; le jeu choisi revient à Couloirs
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(false);
  await expect.poll(async () => (await vr()).menu).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#vrPreview')).toHaveCount(0);
  await expect(page.locator('#gmGames [data-v="couloirs"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#gmGames [data-v="vr"]')).toHaveCount(0);
  const jeux = await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.jeux') || '{}'));
  expect(jeux.game).toBe('couloirs');
  // les réglages faits dans le casque sont gardés pour la page
  expect([jeux.tol, jeux.bpm]).toEqual(['indulgent', 210]);
  await expect(page.locator('#gmTol [aria-pressed="true"]')).toHaveText('Indulgent');
});
