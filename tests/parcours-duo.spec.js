// Parcours façon Duolingo : 10 chapitres, chemin verrouillé, boss, coffres, couronnes, compétences, raccourcis.
const { test, expect, rubrique } = require('./outils/base');

test.describe('Parcours en chemin', () => {
  test('au départ, seule la première leçon est ouverte, et la série est à zéro', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await expect(page.locator('.pc-chb')).toHaveCount(10);
    await expect(page.locator('.pc-st.lock')).toHaveCount(55); // 45 leçons + 10 coffres
    await expect(page.locator('.pc-st').first()).not.toHaveClass(/lock/);
    await expect(page.locator('#p-parcours [data-ser]')).toContainText('🔥 0');
    await expect(page.locator('#pcNext .pc-tchaki svg')).toBeVisible(); // la mascotte donne le conseil
    // une leçon verrouillée se choisit quand même
    await page.locator('.pc-st').nth(5 + 1).click();
    await expect(page.locator('#pcNext .lockmsg')).toBeVisible();
  });

  test('une leçon réussie donne des points, la série, l\'objectif du jour et une couronne', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.evaluate(() => window.__pc.ok('d1', 50));
    await expect(page.locator('#p-parcours [data-ser]')).toContainText('🔥 1');
    await expect(page.locator('#p-parcours [data-ser]')).toContainText('⭐ 10');
    await expect(page.locator('#p-parcours [data-ser]')).toContainText('🎯 1/2');
    await expect(page.locator('.pc-st.lock')).toHaveCount(54);
    await expect(page.locator('.pc-st.done').first()).toHaveAttribute('aria-label', /1 couronne sur 3/);
    // rejouée 20 BPM plus vite : 3 couronnes
    await page.evaluate(() => window.__pc.ok('d1', 70));
    await expect(page.locator('.pc-st.done').first()).toHaveAttribute('aria-label', /3 couronnes sur 3/);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.serie')));
    expect(s).toMatchObject({ streak: 1, xp: 20, n: 2 });
  });

  test('une étape de jeu lance Couloirs avec le bon rythme, réussie à 2 étoiles', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.locator('.pc-st').nth(3).click();
    await expect(page.locator('#pcNext h3')).toHaveText('Jeu : le rock (peu de notes)');
    const avant = await page.evaluate(() => window.__pc.gm());
    await page.locator('#pcGo').click();
    await expect.poll(() => page.evaluate(() => window.__pc.gm())).toMatchObject({ game: 'couloirs', rh: 'rock', lvl: 'facile', bpm: 60, on: true });
    await page.evaluate(() => window.__pc.game(1, 70));
    await expect(page.locator('#pcBar')).toHaveClass(/ko/);
    await page.evaluate(() => window.__pc.game(2, 85));
    await expect(page.locator('#pcBar')).toHaveClass(/ok/);
    await expect(page.locator('#pcBarBtns')).toContainText('Viser 3 étoiles');
    // les réglages des Jeux sont rendus
    expect(await page.evaluate(() => window.__pc.gm())).toMatchObject({ game: avant.game, rh: avant.rh, lvl: avant.lvl, bpm: avant.bpm });
  });

  test('une vraie partie terminée revient au parcours', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.locator('.pc-st').nth(3).click();
    await page.locator('#pcGo').click();
    await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
    await page.evaluate(() => { Object.assign(window.__gm.sc(), { perfect: 30, good: 0, approx: 0, miss: 0, extra: 0 }); window.__gm.pls.fin(); });
    await expect(page.locator('#pcBar')).toHaveClass(/ok/);
    await expect(page.locator('.pc-win')).toBeVisible(); // la feuille de victoire du parcours, pas le bilan du jeu
    expect(await page.evaluate(() => window.__pc.xp())).toBe(10);
  });

  test('sauter un chapitre : le boss battu valide tout, puis le coffre s\'ouvre', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.getByRole('button', { name: 'Sauter le chapitre 2 avec une épreuve' }).click();
    await expect(page.locator('#p-jeux')).toBeVisible();
    expect(await page.evaluate(() => [window.__pc.skip(), window.__pc.active()])).toEqual([1, 'c1b']);
    expect((await page.evaluate(() => window.__pc.gm())).bpm).toBe(90);
    await page.evaluate(() => window.__pc.ok(null, 90));
    await page.evaluate(() => { location.hash = '#parcours'; });
    await expect(page.locator('#p-parcours')).toBeVisible();
    // chapitres 1 et 2 : 5 + 4 leçons
    await expect(page.locator('.pc-st.done')).toHaveCount(9);
    await expect(page.locator('#pcNext h3')).toContainText('Main droite seule : 2 coups');
    expect(await page.evaluate(() => window.__pc.xp())).toBe(30);
    await expect(page.locator('.pc-chest.ready')).toHaveCount(2);
    await page.getByRole('button', { name: 'Coffre du chapitre 1, à ouvrir' }).click();
    await expect(page.locator('.pc-sk li.ok')).toHaveCount(3);
    expect(await page.evaluate(() => window.__pc.xp())).toBe(55);
  });

  test('mes compétences, chapitre par chapitre', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.evaluate(() => window.__pc.ok('d1', 50));
    await page.locator('#pcSkills').click();
    await expect(page.locator('.pc-sk')).toHaveCount(10);
    await expect(page.locator('.pc-sk li.mid')).toHaveCount(3);
    await expect(page.locator('.pc-sk li.ok')).toHaveCount(0);
  });

  test('l\'ancien parcours est repris sur le nouveau chemin', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('poumtchak.parcours', JSON.stringify({ done: { d1: 50, g1: 55 }, cur: 'd1' })));
    await page.reload();
    await rubrique(page, 'Parcours');
    await expect(page.locator('.pc-st.done')).toHaveCount(2);
    await expect(page.locator('#pcNext h3')).toHaveText('Gauche 1 coup, droite 1 coup');
  });

  test('l\'accueil propose le test de niveau', async ({ page }) => {
    await rubrique(page, 'Accueil');
    await page.locator('#acLevel').click();
    await expect(page.locator('.lv-list .btn')).toHaveCount(10);
    await page.locator('.lv-list .btn').first().click();
    expect(await page.evaluate(() => window.__pc.skip())).toBe(0);
  });
});
