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
  expect(ids).toEqual(expect.arrayContaining(['src-', 'src+', 'lvl:moyen', 'tol:indulgent', 'bpm+', 'kick:auto', 'kick:tete', 'slow', 'kitmenu', 'import', 'play', 'mini', 'quit']));
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

  // reculer la batterie pour la voir plus petite : les pads s'éloignent de la tête, le réglage est gardé
  const vr = () => page.evaluate(() => window.__gm.vr().debug());
  const z0 = (await vr()).padsWorld[1][2];
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('dist+'); v.menuPress('dist+'); });
  expect(Math.abs((await vr()).padsWorld[1][2] - z0)).toBeGreaterThan(0.15);
  expect(await page.evaluate(() => localStorage.getItem('poumtchak.vr.distance'))).toBe('0.2');
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('dist-'); v.menuPress('dist-'); });

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

test('aperçu VR : ma batterie (sons, style, disposition) et se déplacer', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  const vr = () => page.evaluate(() => window.__gm.vr().debug());
  const etat = () => page.evaluate(() => window.__gm.vr()?.state());
  await expect.poll(async () => (await etat())?.mode).toBe('main');

  // « Ma batterie » : un sous-menu, Échap revient au menu
  await page.evaluate(() => window.__gm.vr().menuPress('kitmenu'));
  expect((await etat()).mode).toBe('kit');
  expect(await page.evaluate(() => window.__gm.vr().menuIds())).toEqual(expect.arrayContaining(['sound:rock', 'sound:jazz', 'sound:electro', 'style:bois', 'lay:gaucher', 'lay:large', 'tilt+', 'haut-', 'dist+', 'back']));

  // le son : gardé pour toute l'appli
  await page.evaluate(() => window.__gm.vr().menuPress('sound:jazz'));
  expect((await page.evaluate(() => window.__gm.vrApi.opts())).sound).toBe('jazz');

  // le style : des fûts sous les peaux
  expect((await vr()).shells).toBe(0);
  await page.evaluate(() => window.__gm.vr().menuPress('style:bois'));
  expect((await vr()).shells).toBe(3);
  expect(await page.evaluate(() => localStorage.getItem('poumtchak.vr.style'))).toBe('bois');

  // gaucher : le charley passe à droite ; large : des pads plus grands
  const x0 = (await vr()).padsWorld[2][0];
  expect(x0).toBeLessThan(0);
  await page.evaluate(() => window.__gm.vr().menuPress('lay:gaucher'));
  expect((await vr()).padsWorld[2][0]).toBeCloseTo(-x0, 2);
  const r0 = (await vr()).padR[1];
  await page.evaluate(() => window.__gm.vr().menuPress('lay:large'));
  expect((await vr()).padR[1]).toBeGreaterThan(r0 * 1.1);
  // un coup de baguette compte toujours sur le pad agrandi
  await page.evaluate(() => window.__gm.vr().simStrike(3));
  await expect.poll(async () => (await vr()).checked).toContain(3);

  // le décor : la chapelle par défaut (bougies allumées au repos), la colline, ou la nuit sobre
  expect((await vr()).decor).toBe('chapelle');
  await expect.poll(async () => (await vr()).flames).toBe(4);
  await page.evaluate(() => window.__gm.vr().menuPress('decor:nuit'));
  expect((await vr()).bg).toBe('0b0e14');
  await page.evaluate(() => window.__gm.vr().menuPress('decor:colline'));
  expect(await page.evaluate(() => localStorage.getItem('poumtchak.vr.decor'))).toBe('colline');
  await expect.poll(async () => (await vr()).bg).not.toBe('0b0e14');

  await page.keyboard.press('Escape');
  expect((await etat()).mode).toBe('main');
  // le mode où on ne peut pas perdre est dans le menu
  expect(await page.evaluate(() => window.__gm.vr().menuIds())).toContain('tol:sansechec');

  // se déplacer : un pas en avant rapproche la batterie, tourner la fait pivoter autour de soi
  const z0 = (await vr()).padsWorld[1][2];
  await page.evaluate(() => window.__gm.vr().simMove(0, 0.5));
  expect((await vr()).padsWorld[1][2] - z0).toBeCloseTo(0.5, 2);
  const yaw = (await vr()).yaw;
  await page.evaluate(() => window.__gm.vr().simTurn(1));
  expect(Math.abs((await vr()).yaw - yaw)).toBeCloseTo(Math.PI / 6, 2);

  // remettre les réglages
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('kitmenu'); v.menuPress('sound:synth'); v.menuPress('style:pads'); v.menuPress('lay:standard'); v.menuPress('decor:chapelle'); });
});

test('aperçu VR : « Mes chants » ramène à la page, sur le bouton d\'import', async ({ page }) => {
  test.setTimeout(40_000);
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  await expect(page.locator('#vrPreview')).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.__gm.vr()?.state()))?.mode).toBe('main');
  await page.evaluate(() => window.__gm.vr().menuPress('import'));
  await expect(page.locator('#vrPreview')).toHaveCount(0);
  await expect(page.locator('#gmMsg')).toContainText('Importer des chants');
  await expect(page.locator('#gmImp')).toHaveClass(/flash/);
  await expect(page.locator('#gmImp')).toBeInViewport();
});
