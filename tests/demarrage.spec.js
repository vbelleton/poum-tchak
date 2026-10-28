const { test, expect, rubrique, memoire } = require('./outils/base');

test.describe('Démarrage et rubriques', () => {
  test("la page s'ouvre sur le rythme rock, sans erreur", async ({ page }) => {
    await expect(page).toHaveTitle('Poum Tchak');
    await expect(page.locator('#kit .ic')).toHaveCount(7);
    await expect(page.getByRole('tab', { name: 'Rythme' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#patterns [data-v="rock"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#grid .cell')).toHaveCount(7 * 16);
    await expect(page.locator('#txtPhrase')).toHaveValue(/^pouts \. tss \. tchats/);
    await expect(page.locator('#bpmIn')).toHaveValue('100');
    await expect(page.locator('#tempoRead')).toHaveText('100 BPM · 4/4');
  });

  test('une seule rubrique est visible à la fois', async ({ page }) => {
    for (const [onglet, panneau] of [['Pratique', '#p-pratique'], ['Écoute', '#p-ecoute'], ['Mots', '#p-mots'], ['Rythme', '#p-rythme']]) {
      await rubrique(page, onglet);
      await expect(page.locator(panneau)).toBeVisible();
      await expect(page.locator('.panel:visible')).toHaveCount(1);
    }
  });

  test('les flèches du clavier passent d\'un onglet à l\'autre', async ({ page }) => {
    await page.getByRole('tab', { name: 'Rythme' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Pratique' })).toBeFocused();
    await expect(page.locator('#p-pratique')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Mots' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Rythme' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[role=tab][tabindex="0"]')).toHaveCount(1);
  });

  test('la rubrique ouverte est retrouvée au rechargement', async ({ page }) => {
    await rubrique(page, 'Écoute');
    await expect.poll(async () => (await memoire(page)).tab).toBe('ecoute');
    await page.reload();
    await expect(page.locator('#p-ecoute')).toBeVisible();
  });

  test('toucher un fût en haut le joue et affiche son mot', async ({ page }) => {
    await page.getByRole('button', { name: /^tchak ré/ }).click();
    await expect(page.locator('#word')).toHaveText('tchak');
  });

  test('deux fûts touchés ensemble donnent le mot fondu', async ({ page }) => {
    await page.evaluate(() => {
      const [a, b] = ['#kit .ic:nth-child(1)', '#kit .ic:nth-child(2)'].map((s) => document.querySelector(s));
      for (const el of [a, b]) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    await expect(page.locator('#word')).toHaveText('pak');
    await expect(page.locator('#wsub')).toHaveText('poum + tchak');
  });
});
