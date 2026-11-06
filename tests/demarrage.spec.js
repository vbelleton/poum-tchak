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
    for (const [onglet, panneau] of [['Pratique', '#p-pratique'], ['Écoute', '#p-ecoute'], ['Mots', '#p-mots'], ['Parcours', '#p-parcours'], ['Mains', '#p-mains'], ['Rythme', '#p-rythme']]) {
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
    await expect(page.getByRole('tab', { name: 'Parcours' })).toHaveAttribute('aria-selected', 'true');
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

  test('les fûts sont nommés, sans notes de musique', async ({ page }) => {
    await expect(page.locator('#kit .ic').first()).toContainText('Grosse caisse');
    await expect(page.locator('#kit .ic').nth(4)).toContainText('Charley');
    await expect(page.locator('#grid .rl').first()).toContainText('Crash');
    await expect(page.locator('#kit')).not.toContainText(/\b(do|ré|mi|fa|sol|la|si)\b/);
  });

  test('toucher un fût en haut le joue et affiche son mot', async ({ page }) => {
    await page.getByRole('button', { name: 'tchak Caisse claire' }).first().click();
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

  test('la barre du tempo dit son unité, et se cache là où elle ne sert pas', async ({ page }) => {
    await expect(page.locator('.bpm-u')).toHaveText('BPM');
    await expect(page.locator('#bpmIn')).toHaveAttribute('aria-label', /battements par minute/);
    for (const [t, vu] of [['Parcours', false], ['Mots', false], ['Rythme', true], ['Pratique', true], ['Mains', true], ['Écoute', true]]) {
      await rubrique(page, t);
      if (vu) await expect(page.locator('.dock'), t).toBeVisible();
      else await expect(page.locator('.dock'), t).toBeHidden();
    }
  });
});

test.describe('Menu et batterie du haut', () => {
  const places = (page) => page.evaluate(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect();
    return { menu: r('.tabs').top, batterie: r('.stage').top, hauteur: r('.stage').height, contenu: r('.stage').bottom };
  });

  test('rien ne bouge d\'une rubrique à l\'autre, et chacune s\'ouvre par son début', async ({ page }) => {
    const depart = await places(page);
    for (const nom of ['Parcours', 'Pratique', 'Jeux', 'Mains', 'Écoute', 'Mots', 'Rythme']) {
      await page.getByRole('tab', { name: nom, exact: true }).click();
      expect(await places(page)).toEqual(depart);
    }
    await page.getByRole('tab', { name: 'Mots', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.getByRole('tab', { name: 'Pratique', exact: true }).click();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('le menu reste visible en descendant, et sa hauteur ne dépend pas du mot affiché', async ({ page }) => {
    const depart = await places(page);
    await page.locator('#word').evaluate((e) => { e.textContent = 'un mot vraiment beaucoup trop long pour tenir sur une seule ligne du téléphone'; });
    await page.locator('#wsub').evaluate((e) => { e.textContent = 'poum + tchak + tss + doum + toum + tchaa + psch'; });
    expect(await places(page)).toEqual(depart);
    await page.getByRole('tab', { name: 'Mots', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 800));
    expect((await places(page)).menu).toBe(0);
    await expect(page.locator('.tabs')).toBeInViewport();
  });
});
