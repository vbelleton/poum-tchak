const { test, expect, rubrique, cellule, memoire } = require('./outils/base');

test.describe('Grille', () => {
  test('une case se remplit et se vide, la phrase suit', async ({ page }) => {
    await page.locator('#patterns').getByRole('button', { name: 'Rock' }).click();
    const c = cellule(page, 'tchak', 2);
    await c.click();
    await expect(c).toHaveAttribute('aria-pressed', 'true');
    await expect(c).toHaveAttribute('aria-label', /tchak, temps 1 &, normal/);
    await expect(page.locator('#txtPhrase')).toHaveValue(/^pouts \. tchats/);
    await c.click();
    await expect(c).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#patterns [aria-pressed="true"]')).toHaveCount(0);
  });

  test('frappe forte en majuscules, faible entre parenthèses', async ({ page }) => {
    await page.locator('#barBar').getByRole('button', { name: 'Vider cette mesure' }).click();
    await page.locator('#brushSeg').getByRole('button', { name: 'Forte' }).click();
    await cellule(page, 'poum', 0).click();
    await page.locator('#brushSeg').getByRole('button', { name: 'Faible' }).click();
    await cellule(page, 'tchak', 4).click();
    await expect(cellule(page, 'poum', 0)).toHaveClass(/lv3/);
    await expect(cellule(page, 'tchak', 4)).toHaveClass(/lv1/);
    await expect(page.locator('#txtPhrase')).toHaveValue('POUM . . . (tchak) . . . . . . . . . . .');
    await expect(page.locator('#phrase .tk.ac')).toHaveText('POUM');
  });

  test('toucher une case avec la même force la vide', async ({ page }) => {
    await page.locator('#brushSeg').getByRole('button', { name: 'Forte' }).click();
    const c = cellule(page, 'psch', 0);
    await c.click();
    await expect(c).toHaveClass(/lv3/);
    await c.click();
    await expect(c).toHaveAttribute('aria-pressed', 'false');
  });

  test('ajouter, dupliquer, supprimer des mesures', async ({ page }) => {
    const barre = page.locator('#barBar');
    await barre.getByRole('button', { name: 'Ajouter une mesure vide' }).click();
    await expect(barre.getByRole('button', { name: /^Mesure \d sur 2$/ })).toHaveCount(2);
    await expect(barre.getByRole('button', { name: 'Mesure 2 sur 2' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#grid .cell.on')).toHaveCount(0);
    await cellule(page, 'toum', 6).click();
    await barre.getByRole('button', { name: 'Dupliquer cette mesure' }).click();
    await expect(barre.getByRole('button', { name: 'Mesure 3 sur 3' })).toHaveAttribute('aria-pressed', 'true');
    await expect(cellule(page, 'toum', 6)).toHaveAttribute('aria-pressed', 'true');
    await barre.getByRole('button', { name: 'Supprimer cette mesure' }).click();
    await expect(barre.getByRole('button', { name: /^Mesure \d sur 2$/ })).toHaveCount(2);
    await barre.getByRole('button', { name: 'Mesure 1 sur 2' }).click();
    await expect(page.locator('#grid .cell.on')).toHaveCount(12);
  });

  test('pas plus de huit mesures', async ({ page }) => {
    const ajouter = page.locator('#barBar').getByRole('button', { name: 'Ajouter une mesure vide' });
    for (let i = 0; i < 7; i++) await ajouter.click();
    await expect(ajouter).toBeDisabled();
    await expect(page.locator('#barBar').getByRole('button', { name: 'Mesure 8 sur 8' })).toBeVisible();
  });

  test('le focus clavier reste sur la barre des mesures', async ({ page }) => {
    const ajouter = page.locator('#barBar').getByRole('button', { name: 'Ajouter une mesure vide' });
    await ajouter.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#barBar').getByRole('button', { name: 'Ajouter une mesure vide' })).toBeFocused();
  });

  test('les mesures changent la grille et le solfège', async ({ page }) => {
    await page.locator('#meterSeg').getByRole('button', { name: '3/4' }).click();
    await expect(page.locator('#grid .cell')).toHaveCount(7 * 12);
    await page.locator('#meterSeg').getByRole('button', { name: '6/8' }).click();
    await expect(page.locator('#grid .cell')).toHaveCount(7 * 6);
    await expect(page.locator('#swingSeg button').first()).toBeDisabled();
    await page.locator('#patterns').getByRole('button', { name: 'Shuffle' }).click();
    await expect(page.locator('#swingSeg [data-v="1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tempoRead')).toContainText('ternaire');
  });

  test('les trois systèmes de solfège', async ({ page }) => {
    await expect(page.locator('#solf')).toContainText('ti-ti');
    await page.locator('#solfSeg').getByRole('button', { name: 'Takadimi' }).click();
    await expect(page.locator('#solf .sw').first()).toHaveText('ta-di');
    await page.locator('#solfSeg').getByRole('button', { name: 'Konnakol' }).click();
    await expect(page.locator('#solf .sw').first()).toHaveText('ta – di –');
  });

  test('la grille et les mesures sont gardées au rechargement', async ({ page }) => {
    await page.locator('#barBar').getByRole('button', { name: 'Ajouter une mesure vide' }).click();
    await page.locator('#brushSeg').getByRole('button', { name: 'Forte' }).click();
    await cellule(page, 'doum', 3).click();
    await expect.poll(async () => (await memoire(page)).bars?.length).toBe(2);
    await page.reload();
    await expect(page.locator('#barBar').getByRole('button', { name: /^Mesure \d sur 2$/ })).toHaveCount(2);
    await page.locator('#barBar').getByRole('button', { name: 'Mesure 2 sur 2' }).click();
    await expect(cellule(page, 'doum', 3)).toHaveClass(/lv3/);
  });
});

test.describe('Traduire', () => {
  test('des onomatopées vers la grille, et retour', async ({ page }) => {
    await rubrique(page, 'Mots');
    await page.getByLabel('Onomatopées, un mot par pas').fill('POUM . (tchak) . pak tss');
    await page.locator('#applyPhrase').click();
    await expect(page.locator('#msg')).toHaveText('Appliqué sur 16 pas.');
    await rubrique(page, 'Rythme');
    await expect(cellule(page, 'poum', 0)).toHaveClass(/lv3/);
    await expect(cellule(page, 'tchak', 2)).toHaveClass(/lv1/);
    await expect(cellule(page, 'poum', 4)).toHaveAttribute('aria-pressed', 'true');
    await expect(cellule(page, 'tchak', 4)).toHaveAttribute('aria-pressed', 'true');
    await expect(cellule(page, 'tss', 5)).toHaveAttribute('aria-pressed', 'true');
  });

  test('un mot inconnu est signalé sans rien changer', async ({ page }) => {
    await rubrique(page, 'Mots');
    const avant = await page.locator('#txtPhrase').inputValue();
    await page.locator('#txtPhrase').fill('poum blurp');
    await page.locator('#applyPhrase').click();
    await expect(page.locator('#msg')).toHaveText(/^Erreur : Mot inconnu : « blurp »/);
    await expect(page.locator('#msg')).toHaveClass(/err/);
    await page.locator('#txtPhrase').blur();
    await rubrique(page, 'Rythme');
    await expect(page.locator('#grid .cell.on')).toHaveCount(12);
    expect(avant).toMatch(/^pouts/);
  });

  test('du solfège vers un fût', async ({ page }) => {
    await rubrique(page, 'Mots');
    await page.getByLabel('Solfège rythmique, un mot par temps').fill('ta ti-ti tiri-tiri ·');
    await page.getByLabel('Fût qui joue ce rythme').selectOption('toum');
    await page.locator('#applySolf').click();
    await expect(page.locator('#msg')).toContainText('toum joue maintenant ce rythme sur 4 temps');
    await rubrique(page, 'Rythme');
    const pas = await page.locator('#grid .cell.on[data-id="toum"]').evaluateAll((els) => els.map((e) => +e.dataset.s).sort((a, b) => a - b));
    expect(pas).toEqual([0, 4, 6, 8, 9, 10, 11]);
  });
});
