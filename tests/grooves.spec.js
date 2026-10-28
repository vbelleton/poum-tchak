const { test, expect, cellule } = require('./outils/base');

test.describe('Mes grooves', () => {
  test('enregistrer, retrouver, charger, supprimer', async ({ page }) => {
    await page.locator('#patterns').getByRole('button', { name: 'Funk' }).click();
    await page.locator('#bpmIn').fill('92');
    await page.locator('#bpmIn').press('Enter');
    await page.getByLabel('Nom du groove').fill('Funk du mardi');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('#grooveMsg')).toHaveText('« Funk du mardi » enregistré.');
    await expect(page.locator('.grv')).toContainText('4/4 · 92 BPM · 1 mesure');

    await page.locator('#patterns').getByRole('button', { name: 'Valse' }).click();
    await page.getByRole('button', { name: 'Charger le groove Funk du mardi' }).click();
    await expect(page.locator('#bpmIn')).toHaveValue('92');
    await expect(page.locator('#grid .cell')).toHaveCount(7 * 16);
    await expect(cellule(page, 'tchak', 2)).toHaveClass(/lv1/);

    await page.reload();
    await expect(page.locator('.grv')).toHaveCount(1);
    await page.getByRole('button', { name: 'Supprimer le groove Funk du mardi' }).click();
    await expect(page.locator('.grv')).toHaveCount(0);
  });

  test('un même nom remplace le groove', async ({ page }) => {
    await page.getByLabel('Nom du groove').fill('Essai');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('#grooveMsg')).toHaveText('« Essai » remplacé.');
    await expect(page.locator('.grv')).toHaveCount(1);
  });

  test('un groove sans nom est refusé', async ({ page }) => {
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('#grooveMsg')).toHaveText('Erreur : Donne un nom au groove.');
    await expect(page.getByLabel('Nom du groove')).toBeFocused();
  });

  test('le lien partagé ouvre le même groove', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#barBar').getByRole('button', { name: 'Dupliquer cette mesure' }).click();
    await page.locator('#brushSeg').getByRole('button', { name: 'Forte' }).click();
    await cellule(page, 'psch', 0).click();
    await page.getByLabel('Nom du groove').fill('Pour le prof');
    await page.getByRole('button', { name: 'Copier le lien' }).click();
    await expect(page.locator('#grooveMsg')).toHaveText(/^(Lien copié\.|Lien : )/);
    let lien = await page.locator('#grooveMsg').textContent();
    if (lien.startsWith('Lien copié')) lien = await page.evaluate(() => navigator.clipboard.readText());
    else lien = lien.replace('Lien : ', '');
    expect(lien).toContain('#g=');

    const autre = await context.newPage();
    await autre.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await autre.goto(lien);
    await expect(autre.locator('#grooveMsg')).toHaveText('Groove reçu par le lien : « Pour le prof ». Enregistre-le pour le garder.');
    await expect(autre.locator('#barBar').getByRole('button', { name: /^Mesure \d sur 2$/ })).toHaveCount(2);
    await autre.locator('#barBar').getByRole('button', { name: 'Mesure 2 sur 2' }).click();
    await expect(cellule(autre, 'psch', 0)).toHaveClass(/lv3/);
    expect(await autre.evaluate(() => location.hash)).toBe('');
  });

  test('un lien abîmé est signalé', async ({ page }) => {
    await page.goto('index.html#g=nimportequoi');
    await expect(page.locator('#grooveMsg')).toHaveText('Erreur : Ce lien ne contient pas de groove lisible.');
  });
});
