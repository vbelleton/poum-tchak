// Pratique : boucler un passage d'un chant importé.
const { test, expect, rubrique } = require('./outils/base');
const { fichierChant } = require('./outils/chant');

async function importer(page) {
  await rubrique(page, 'Pratique');
  await page.locator('#gmFile').setInputFiles(fichierChant('Mon chant'));
  await expect(page.locator('#lpMsg')).toContainText('1 chant importé');
}

test.describe('Boucler un passage', () => {
  test('sans rien importer : les chants libres sont là, et une boucle se lance', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await expect(page.locator('#lpSong option')).toHaveCount(6);
    await expect(page.locator('#lpGo')).toBeVisible();
    await page.locator('#lpGo').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => window.__gm.crete())).toBeGreaterThan(0.05);
    await page.keyboard.press('Escape');
  });

  test('choisir le passage : la mesure reste dans le chant, et le choix est gardé', async ({ page }) => {
    await importer(page);
    await expect(page.locator('#lpSong')).toHaveValue('essai');
    await page.locator('#lpDown').click();
    await expect(page.locator('#lpBar')).toHaveValue('1');
    await page.locator('#lpBar').fill('99');
    await page.locator('#lpBar').press('Enter');
    await expect(page.locator('#lpBar')).toHaveValue('4');
    await page.locator('#lpBar').fill('2');
    await page.locator('#lpBar').press('Enter');
    await page.locator('#lpLen').getByRole('button', { name: '2 mesures' }).click();
    await expect(page.locator('#lpWhere')).toContainText('Mesures 2 à 3');
    await page.reload();
    await rubrique(page, 'Pratique');
    await expect(page.locator('#lpBar')).toHaveValue('2');
    await expect(page.locator('#lpLen').getByRole('button', { name: '2 mesures' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('le passage tourne, sans jauge, avec la précision de chaque tour, et ne change pas le jeu choisi', async ({ page }) => {
    test.setTimeout(60_000);
    await importer(page);
    await page.locator('#lpBar').fill('2');
    await page.locator('#lpBar').press('Enter');
    await page.locator('#lpLen').getByRole('button', { name: '1 mesure', exact: true }).click();
    await page.locator('#lpLv').getByRole('button', { name: 'Beaucoup' }).click();
    await page.locator('#lpGo').click();
    await expect(page.locator('#gm')).toBeVisible();
    await expect(page.locator('#gmGauge')).toBeHidden();
    const tours = await page.evaluate(async () => {
      const cv = document.querySelector('#gmCv');
      const r = cv.getBoundingClientRect();
      const larg = r.width / 4;
      // Trois tours et demi joués juste, puis plus rien : la boucle continue quand même.
      while (window.__gm.loop().pass < 3) {
        const note = window.__gm.notes().find((n) => n.t > window.__gm.now());
        while (window.__gm.now() < note.t) await new Promise((f) => setTimeout(f, 2));
        cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + larg * (note.lane + 0.5), clientY: r.top + 300 }));
      }
      return window.__gm.loop().pcts;
    });
    expect(tours.length).toBe(3);
    expect(Math.max(...tours)).toBeGreaterThanOrEqual(80);
    await expect(page.locator('#gmCombo')).toContainText('tour');
    // Le son a dépassé la fin de la mesure choisie sans s'arrêter, et les notes suivent.
    expect(await page.evaluate(() => window.__gm.notes().filter((n) => n.t > window.__gm.now()).length)).toBeGreaterThan(0);
    await page.locator('#gmQuit').click();
    await expect(page.locator('#gm')).toBeHidden();
    await expect(page.locator('#mnRes')).toBeHidden();
    await expect(page.locator('#lpMsg')).toContainText('tours');
    await rubrique(page, 'Jeux');
    await expect(page.locator('#gmGames [data-v="couloirs"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#gmResume')).toBeHidden();
  });
});
