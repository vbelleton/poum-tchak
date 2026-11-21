// Parcours façon Duolingo : chemin verrouillé, série et points, raccourci par chapitre, test de niveau.
const { test, expect, rubrique } = require('./outils/base');

test.describe('Parcours en chemin', () => {
  test('au départ, seule la première leçon est ouverte, et la série est à zéro', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await expect(page.locator('.pc-chb')).toHaveCount(5);
    await expect(page.locator('.pc-st.lock')).toHaveCount(24);
    await expect(page.locator('.pc-st').first()).not.toHaveClass(/lock/);
    await expect(page.locator('#p-parcours [data-ser]')).toContainText('🔥 0');
    // une leçon verrouillée se choisit quand même
    await page.locator('.pc-st').nth(5).click();
    await expect(page.locator('#pcNext .lockmsg')).toBeVisible();
  });

  test('une leçon réussie donne des points, la série et l\'objectif du jour', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.evaluate(() => window.__pc.ok('d1', 50));
    await expect(page.locator('#p-parcours [data-ser]')).toContainText('🔥 1');
    await expect(page.locator('#p-parcours [data-ser]')).toContainText('⭐ 10');
    await expect(page.locator('#p-parcours [data-ser]')).toContainText('🎯 1/2');
    await expect(page.locator('.pc-st.lock')).toHaveCount(23);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.serie')));
    expect(s).toMatchObject({ streak: 1, xp: 10, n: 1 });
  });

  test('sauter un chapitre : l\'épreuve réussie valide tout le chapitre', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.getByRole('button', { name: 'Sauter le chapitre 2 avec une épreuve' }).click();
    await expect(page.locator('#p-mains')).toBeVisible();
    expect(await page.evaluate(() => [window.__pc.skip(), window.__pc.active()])).toEqual([1, 'g2d2']);
    await page.evaluate(() => window.__pc.ok(null, 65));
    await page.evaluate(() => { location.hash = '#parcours'; });
    await expect(page.locator('#p-parcours')).toBeVisible();
    // chapitres 1 et 2 : 3 + 6 leçons
    await expect(page.locator('.pc-st.done')).toHaveCount(9);
    await expect(page.locator('#pcNext h3')).toContainText('Main droite seule : 3 coups');
    expect(await page.evaluate(() => window.__pc.xp())).toBe(30);
  });

  test('l\'accueil propose le test de niveau', async ({ page }) => {
    await rubrique(page, 'Accueil');
    await page.locator('#acLevel').click();
    await expect(page.locator('.lv-list .btn')).toHaveCount(5);
    await page.locator('.lv-list .btn').first().click();
    expect(await page.evaluate(() => window.__pc.skip())).toBe(0);
  });
});
