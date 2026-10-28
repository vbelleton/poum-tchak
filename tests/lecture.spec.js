const { test, expect, rubrique, cellule } = require('./outils/base');

const temps = (page) => page.locator('#bpmIn');

test.describe('Lecture et tempo', () => {
  test('jouer puis arrêter', async ({ page }) => {
    const bouton = page.locator('#play');
    await expect(bouton).toHaveText('Jouer');
    await bouton.click();
    await expect(bouton).toHaveText('Stop');
    await expect(page.locator('#grid .cell.now').first()).toBeVisible();
    await expect(page.locator('#word')).not.toHaveText('poum tchak');
    await bouton.click();
    await expect(bouton).toHaveText('Jouer');
    await expect(page.locator('#grid .cell.now')).toHaveCount(0);
  });

  test('saisir le tempo au clavier, avec les bornes 40 et 220', async ({ page }) => {
    await temps(page).fill('137');
    await temps(page).press('Enter');
    await expect(temps(page)).toHaveValue('137');
    await expect(page.locator('#tempoRead')).toHaveText('137 BPM · 4/4');
    await temps(page).fill('500');
    await temps(page).press('Enter');
    await expect(temps(page)).toHaveValue('220');
    await temps(page).fill('3');
    await temps(page).press('Enter');
    await expect(temps(page)).toHaveValue('40');
  });

  test('− et + changent le tempo d\'un cran, et défilent si on reste appuyé', async ({ page }) => {
    await page.getByRole('button', { name: 'Accélérer' }).click();
    await expect(temps(page)).toHaveValue('101');
    await page.getByRole('button', { name: 'Ralentir' }).click();
    await page.getByRole('button', { name: 'Ralentir' }).click();
    await expect(temps(page)).toHaveValue('99');
    const plus = page.getByRole('button', { name: 'Accélérer' });
    const box = await plus.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1500);
    await page.mouse.up();
    const v = +(await temps(page).inputValue());
    expect(v).toBeGreaterThan(105);
    await page.waitForTimeout(300);
    expect(+(await temps(page).inputValue())).toBe(v);
  });

  test('le bouton Tap règle le tempo sur les frappes', async ({ page }) => {
    await page.evaluate(() => new Promise((ok) => {
      const tap = document.querySelector('#tap');
      let n = 0;
      const iv = setInterval(() => {
        tap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        if (++n === 5) { clearInterval(iv); ok(); }
      }, 500);
    }));
    const v = +(await temps(page).inputValue());
    expect(v).toBeGreaterThanOrEqual(110);
    expect(v).toBeLessThanOrEqual(122);
  });

  test('le clic se coupe et se remet', async ({ page }) => {
    const clic = page.getByRole('button', { name: 'Clic' });
    await expect(clic).toHaveAttribute('aria-pressed', 'true');
    await clic.click();
    await expect(clic).toHaveAttribute('aria-pressed', 'false');
  });

  test('la grille suit la mesure jouée', async ({ page }) => {
    await page.locator('#barBar').getByRole('button', { name: 'Ajouter une mesure vide' }).click();
    await temps(page).fill('200');
    await temps(page).press('Enter');
    await page.locator('#play').click();
    const vues = new Set();
    for (let i = 0; i < 20; i++) {
      vues.add(await page.locator('#barBar [aria-pressed="true"]').getAttribute('aria-label'));
      await page.waitForTimeout(150);
    }
    await page.locator('#play').click();
    expect([...vues].sort()).toEqual(['Mesure 1 sur 2', 'Mesure 2 sur 2']);
  });
});

test.describe('Pratique : tempo progressif et mesures muettes', () => {
  test('le tempo monte pendant la lecture puis revient', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.getByLabel('Accélérer tout seul pendant la lecture').check();
    await page.getByLabel('Monter de').selectOption('5');
    await page.getByLabel('toutes les').selectOption('1');
    await temps(page).fill('200');
    await temps(page).press('Enter');
    await page.locator('#play').click();
    await expect(temps(page)).toHaveValue('210', { timeout: 6000 });
    await page.locator('#play').click();
    await expect(temps(page)).toHaveValue('200');
    await expect(page.locator('#workMsg')).toContainText('Retour à 200 BPM');
  });

  test('une mesure sur deux est muette, et signalée', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.getByLabel('Couper le son par moments pour tester ton horloge interne').check();
    await page.getByLabel('Couper', { exact: true }).selectOption('2');
    await temps(page).fill('220');
    await temps(page).press('Enter');
    await rubrique(page, 'Rythme');
    await page.locator('#play').click();
    const muet = page.locator('#silFlag');
    await expect(muet).toBeVisible({ timeout: 5000 });
    await expect(muet).toBeHidden({ timeout: 5000 });
    await page.locator('#play').click();
    await expect(muet).toBeHidden();
  });
});

test.describe('Sons', () => {
  test('passer aux sons de vraie batterie, et le garder', async ({ page }) => {
    await page.locator('#soundSeg').getByRole('button', { name: 'Batterie' }).click();
    await expect(page.locator('#soundMsg')).toHaveText('Sons de la batterie enregistrée.');
    await expect(page.locator('#soundSeg [data-v="kit"]')).toHaveAttribute('aria-pressed', 'true');
    await cellule(page, 'psch', 0).click();
    await page.reload();
    await expect(page.locator('#soundSeg [data-v="kit"]')).toHaveAttribute('aria-pressed', 'true');
  });
});
