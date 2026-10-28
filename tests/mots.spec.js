const { test, expect, rubrique } = require('./outils/base');

test.describe('Dictionnaire', () => {
  test.beforeEach(async ({ page }) => { await rubrique(page, 'Mots'); });

  const carte = (page, id) => page.locator(`#dictDrums summary[data-k="${id}"]`);

  test('renommer le mot principal change toute l\'appli', async ({ page }) => {
    await carte(page, 'poum').click();
    const champ = page.getByLabel('Mot pour Grosse caisse, actuellement « poum »');
    await champ.fill('boom');
    await champ.press('Enter');
    await expect(page.locator('.dm[data-k="poum"]')).toHaveText('Mot enregistré : « boom ».');
    await expect(page.locator('#kit .ic').first()).toContainText('boom');
    await expect(page.locator('#txtPhrase')).toHaveValue(/tss/);
    await expect(page.getByLabel('Mot pour Grosse caisse, actuellement « boom »')).toBeFocused();
  });

  test('un mot déjà pris par un autre fût est refusé', async ({ page }) => {
    await carte(page, 'poum').click();
    const champ = page.getByLabel('Mot pour Grosse caisse, actuellement « poum »');
    await champ.fill('tchak');
    await champ.press('Enter');
    await expect(page.locator('.dm[data-k="poum"]')).toHaveText('Erreur : « tchak » est déjà utilisé pour tchak.');
    await expect(champ).toHaveValue('poum');
  });

  test('ajouter un synonyme puis en faire le mot principal', async ({ page }) => {
    await carte(page, 'toum').click();
    await page.getByLabel('Nouveau mot pour Tom basse', { exact: true }).fill('boum');
    await page.getByRole('button', { name: 'Ajouter le mot à Tom basse' }).click();
    await expect(page.locator('.dm[data-k="toum"]')).toHaveText('Erreur : « boum » est déjà utilisé pour poum.');
    await page.getByLabel('Nouveau mot pour Tom basse', { exact: true }).fill('dong');
    await page.getByLabel('Source du nouveau mot pour Tom basse').fill('Mon prof');
    await page.getByRole('button', { name: 'Ajouter le mot à Tom basse' }).click();
    await expect(page.locator('.dm[data-k="toum"]')).toHaveText('« dong » ajouté.');
    await page.getByRole('button', { name: 'Définir « dong » comme mot principal' }).click();
    await expect(page.locator('#kit .ic:nth-child(4)')).toContainText('dong');
  });

  test('chaque fût garde au moins un mot', async ({ page }) => {
    await carte(page, 'tss').click();
    await page.getByRole('button', { name: 'Retirer « ts »' }).click();
    await page.getByRole('button', { name: 'Retirer « tss »' }).click();
    await expect(page.locator('.dm[data-k="tss"]')).toHaveText('Erreur : Chaque fût garde au moins un mot.');
  });

  test('ajouter un mot fondu', async ({ page }) => {
    await page.locator('#combosDet summary').click();
    await expect(page.locator('#dictCombos .el').first()).toHaveText('poum + tchak = grosse caisse + caisse claire');
    await page.locator('#comboPick').getByRole('button', { name: 'toum' }).click();
    await page.locator('#comboPick').getByRole('button', { name: 'psch' }).click();
    await page.locator('#comboPick').getByRole('button', { name: 'tss' }).click();
    await page.getByLabel('Nouveau mot fondu', { exact: true }).fill('tapouf');
    await page.locator('#comboAdd').click();
    await expect(page.locator('.dm[data-k="combos"]')).toHaveText('« tapouf » ajouté pour toum + tss + psch.');
    await expect(page.locator('#comboCount')).toHaveText('26 mots');
  });

  test('exporter, tout remettre, puis recharger l\'export', async ({ page }) => {
    await carte(page, 'tchak').click();
    const champ = page.getByLabel('Mot pour Caisse claire, actuellement « tchak »');
    await champ.fill('clap');
    await champ.press('Enter');
    await page.getByRole('button', { name: 'Exporter' }).click();
    const json = await page.locator('#dictJson').inputValue();
    expect(JSON.parse(json).entries.length).toBeGreaterThan(40);
    const remettre = page.getByRole('button', { name: "Remettre l'original" });
    await remettre.click();
    await expect(page.getByRole('button', { name: 'Confirmer : tout remettre' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer : tout remettre' }).click();
    await expect(page.locator('#kit .ic:nth-child(2)')).toContainText('tchak');
    await page.locator('#dictJson').fill(json);
    await page.getByRole('button', { name: 'Charger ce texte' }).click();
    await expect(page.locator('.dm[data-k="tools"]')).toHaveText(/^Dictionnaire chargé : \d+ mots\.$/);
    await expect(page.locator('#kit .ic:nth-child(2)')).toContainText('clap');
  });

  test('un texte qui n\'est pas un dictionnaire est refusé', async ({ page }) => {
    await page.locator('#dictJson').fill('pas du json');
    await page.getByRole('button', { name: 'Charger ce texte' }).click();
    await expect(page.locator('.dm[data-k="tools"]')).toHaveText("Erreur : Ce texte n'est pas un dictionnaire valide.");
  });
});
