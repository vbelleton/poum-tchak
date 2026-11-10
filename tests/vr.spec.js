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
  expect(ids).toEqual(expect.arrayContaining(['src-', 'src+', 'lvl:moyen', 'tol:indulgent', 'bpm+', 'kick:auto', 'kick:tete', 'slow', 'tilt+', 'haut-', 'play', 'mini', 'quit']));
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('lvl:moyen'); v.menuPress('tol:indulgent'); v.menuPress('bpm-'); });
  let o = await page.evaluate(() => window.__gm.vrApi.opts());
  expect([o.lvl, o.tol, o.bpm]).toEqual(['moyen', 'indulgent', 210]);
  const avant = o.rh;
  await page.evaluate(() => window.__gm.vr().menuPress('src+'));
  expect((await page.evaluate(() => window.__gm.vrApi.opts())).rh).not.toBe(avant);
  await page.evaluate(() => window.__gm.vr().menuPress('src-'));
  expect((await page.evaluate(() => window.__gm.vrApi.opts())).rh).toBe(avant);
  await page.evaluate(() => window.__gm.vr().menuPress('lvl:facile'));

  await page.evaluate(() => window.__gm.vr().menuPress('play'));
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

  // Échap met la partie en pause ; « Arrêter » revient au menu ; Échap quitte l'aperçu
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await page.evaluate(() => window.__gm.vr().state())).paused).toBe(true);
  await page.evaluate(() => window.__gm.vr().menuPress('menu'));
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

test('aperçu VR : pause, grosse caisse automatique, menu masqué, navigation au clavier', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmGames [data-v="couloirs"]').click();
  await page.locator('#gmVR').click();
  const etat = () => page.evaluate(() => window.__gm.vr()?.state());
  await expect.poll(async () => (await etat())?.mode).toBe('main');

  // flèches et Entrée : du bouton Jouer, on remonte sur « Grosse caisse » et on choisit « Automatique »
  expect((await etat()).focus).toBe('play');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  expect((await etat()).focus).toMatch(/^kick:/);
  await page.evaluate(() => window.__gm.vr().menuPress('kick:gachette'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  expect((await page.evaluate(() => window.__gm.vrApi.opts())).kick).toBe('auto');
  expect(await page.evaluate(() => localStorage.getItem('poumtchak.vr.grossecaisse'))).toBe('auto');

  // masquer le menu laisse jouer librement sur la batterie ; Échap le rouvre
  await page.evaluate(() => window.__gm.vr().menuPress('mini'));
  expect((await etat()).mode).toBe('mini');
  await page.keyboard.press('Escape');
  expect((await etat()).mode).toBe('main');

  // grosse caisse automatique : plus de notes à jouer sur son couloir, elle est dans l'accompagnement
  await page.evaluate(() => window.__gm.vr().menuPress('play'));
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
  const c = await page.evaluate(() => { const ch = window.__gm.chart(); return { kicks: ch.notes.filter((n) => n.lane === 0).length, autres: ch.notes.length, acc: ch.backing.filter((b) => b.id === 'poum').length }; });
  expect(c.kicks).toBe(0);
  expect(c.autres).toBeGreaterThan(0);
  expect(c.acc).toBeGreaterThan(0);

  // P : pause, le temps du jeu s'arrête et une frappe ne compte pas ; P encore : on reprend
  await page.waitForTimeout(400);
  await page.keyboard.press('p');
  await expect.poll(async () => (await etat()).mode).toBe('pause');
  const t0 = await page.evaluate(() => window.__gm.now());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__gm.now())).toBeCloseTo(t0, 2);
  const avant = await page.evaluate(() => { const s = window.__gm.sc(); return s.perfect + s.good + s.approx + s.extra; });
  await page.evaluate(() => window.__gm.vr().simStrike(1));
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => { const s = window.__gm.sc(); return s.perfect + s.good + s.approx + s.extra; })).toBe(avant);
  await page.keyboard.press('p');
  await expect.poll(async () => (await etat()).paused).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__gm.now())).toBeGreaterThan(t0 + 0.1);

  // en pause, « Recommencer » relance la partie du début
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await etat()).paused).toBe(true);
  await page.evaluate(() => window.__gm.vr().menuPress('restart'));
  await expect.poll(() => page.evaluate(() => window.__gm.on() && window.__gm.now() < 0.5)).toBe(true);
  expect((await etat()).paused).toBe(false);
  // « Arrêter » revient au menu
  await page.keyboard.press('p');
  await page.evaluate(() => window.__gm.vr().menuPress('menu'));
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(false);
  expect((await etat()).mode).toBe('main');
  await page.evaluate(() => window.__gm.vr().menuPress('kick:gachette'));
});
