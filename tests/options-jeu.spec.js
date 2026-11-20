// Jeux : options d'affichage, ambiance, allègement et navigation dans une playlist.
const { test, expect, rubrique } = require('./outils/base');

test.describe('Options de jeu', () => {
  test('les réglages d\'affichage et d\'ambiance sont gardés', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await page.locator('#gmWords [data-v="non"]').click();
    await page.locator('#gmPopAt [data-v="haut"]').click();
    await page.locator('#gmAmbi [data-v="visuel"]').click();
    await page.locator('#gmThinBtn').click();
    await expect(page.locator('#gmThinBtn')).toHaveAttribute('aria-pressed', 'true');
    const o = await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.jeux')));
    expect(o).toMatchObject({ words: 'non', popAt: 'haut', ambi: 'visuel', thin: true });
    await page.reload();
    await rubrique(page, 'Jeux');
    await expect(page.locator('#gmPopAt [data-v="haut"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('quand ça coince : moins de notes, et le public soupire', async ({ page }) => {
    test.setTimeout(60_000);
    await rubrique(page, 'Jeux');
    await page.locator('#gmLv [data-v="difficile"]').click();
    await page.locator('#gmAmbi [data-v="visuel"]').click();
    await page.locator('#gmThinBtn').click();
    await page.locator('#gmGo').click();
    await page.waitForFunction(() => window.__gm.on());
    // on ne tape rien : les ratés s'enchaînent
    await page.waitForFunction(() => window.__gm.legeres() > 0, null, { timeout: 30_000 });
    await expect(page.locator('#gmAmbiFx')).toHaveClass(/\boh\b/);
  });

  test('playlist : chant N sur M, précédent et suivant', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await page.locator('#gmPlNew').click();
    const ids = await page.locator('#plAdd option').evaluateAll((l) => l.map((o) => o.value).filter(Boolean));
    await page.locator('#plAdd').selectOption(ids[0]);
    await page.locator('#plAdd').selectOption(ids[1]);
    await page.locator('#plOk').click();
    await page.locator('#gmPlGo').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#gmPlTop')).toHaveText('Playlist · chant 1/2');
    await expect(page.locator('#gmPlLive')).toBeVisible();
    await page.locator('#gmQuit').click();
    await expect(page.locator('#gmPlPos')).toContainText('Chant 1 sur 2');
    await expect(page.locator('#gmPlPrev')).toBeDisabled();
    await page.locator('#gmPlNext').click();
    await expect(page.locator('#gmPlPos')).toContainText('Chant 2 sur 2');
    await expect(page.locator('#gmPlNext')).toBeDisabled();
    await page.locator('#gmPlPrev').click();
    await expect(page.locator('#gmPlPos')).toContainText('Chant 1 sur 2');
  });
});
