// Mots : s'entraîner à traduire une consigne en onomatopées.
const { test, expect, rubrique } = require('./outils/base');

const SENS = { poum: ['poum'], tchak: ['tchak'], pak: ['poum', 'tchak'], '.': [] };

async function consigne(page) {
  const temps = await page.locator('#trSay b').allTextContents();
  return temps.join(' ').trim().split(/\s+/);
}

test.describe("S'entraîner à traduire", () => {
  test('une consigne de huit croches et une grille vide', async ({ page }) => {
    await rubrique(page, 'Mots');
    await expect(page.locator('#trSay > div')).toHaveCount(4);
    expect(await consigne(page)).toHaveLength(8);
    await expect(page.locator('#trGrid .tr-c')).toHaveCount(16); // facile : caisse claire et grosse caisse
    await expect(page.locator('#trGrid .tr-c[aria-pressed="true"]')).toHaveCount(0);
  });

  test('traduire juste : « Juste ! » et on peut la jouer sur l\'écran', async ({ page }) => {
    await rubrique(page, 'Mots');
    const mots = await consigne(page);
    for (let i = 0; i < 8; i++) {
      for (const id of SENS[mots[i]]) await page.locator(`#trGrid .tr-c[data-id="${id}"][data-s="${i}"]`).click();
    }
    await page.locator('#trCheck').click();
    await expect(page.locator('#trMsg')).toContainText('Juste');
    await page.locator('#trPlay').click();
    await expect(page.locator('#kitView')).toBeVisible();
    // la grille principale a la consigne, en croches
    const g = await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.v2')).bars[0]);
    expect(g).toBeTruthy();
  });

  test('une erreur est montrée et le mot expliqué', async ({ page }) => {
    await rubrique(page, 'Mots');
    const mots = await consigne(page);
    // on joue la grosse caisse sur un silence ou on oublie le premier « poum »
    const i = mots.indexOf('.');
    if (i >= 0) await page.locator(`#trGrid .tr-c[data-id="poum"][data-s="${i}"]`).click();
    await page.locator('#trCheck').click();
    await expect(page.locator('#trMsg')).toContainText('à revoir');
    await expect(page.locator('#trGrid .tr-c.miss').first()).toBeVisible();
    await expect(page.locator('#trMsg')).toContainText('=');
  });

  test('voir la réponse remplit la grille', async ({ page }) => {
    await rubrique(page, 'Mots');
    await page.locator('#trShow').click();
    await expect(page.locator('#trMsg')).toContainText('bonne grille');
    await expect(page.locator('#trGrid .tr-c.good').first()).toBeVisible();
  });

  test('niveaux : moyen ajoute le charley, difficile les toms et la crash', async ({ page }) => {
    await rubrique(page, 'Mots');
    await page.locator('#trLvl').getByRole('button', { name: 'Moyen' }).click();
    await expect(page.locator('#trGrid .tr-c')).toHaveCount(24);
    await page.locator('#trLvl').getByRole('button', { name: 'Difficile' }).click();
    await expect(page.locator('#trGrid .tr-c')).toHaveCount(48);
    await page.reload();
    await rubrique(page, 'Mots');
    await expect(page.locator('#trLvl').getByRole('button', { name: 'Difficile' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('autre consigne change la phrase et vide la grille', async ({ page }) => {
    await rubrique(page, 'Mots');
    const avant = (await consigne(page)).join(' ');
    await page.locator('#trGrid .tr-c').first().click();
    let apres = avant;
    for (let k = 0; k < 5 && apres === avant; k++) {
      await page.locator('#trNew').click();
      apres = (await consigne(page)).join(' ');
    }
    expect(apres).not.toBe(avant);
    await expect(page.locator('#trGrid .tr-c[aria-pressed="true"]')).toHaveCount(0);
  });

  test('pas de débordement à 320 px au niveau difficile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await rubrique(page, 'Mots');
    await page.locator('#trLvl').getByRole('button', { name: 'Difficile' }).click();
    const l = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(l).toBeLessThanOrEqual(0);
  });
});

test.describe('Traduire sur la batterie', () => {
  test('coup par coup sur la batterie dessinée, puis vérifier', async ({ page }) => {
    await rubrique(page, 'Mots');
    await page.locator('#trView').getByRole('button', { name: 'Batterie' }).click();
    await expect(page.locator('#trKit')).toBeVisible();
    await expect(page.locator('#trGrid')).toBeHidden();
    await expect(page.locator('#trSteps .tr-step')).toHaveCount(8);
    // facile : seulement grosse caisse et caisse claire
    await expect(page.locator('#trKit .pad:not([hidden])')).toHaveCount(2);
    const mots = await consigne(page);
    for (let i = 0; i < 8; i++) {
      await page.locator('#trSteps .tr-step').nth(i).click();
      await expect(page.locator('#trCur')).toContainText(`Coup ${i + 1} sur 8`);
      for (const id of SENS[mots[i]]) await page.locator(`#trKit .pad[data-id="${id}"]`).click();
    }
    await page.locator('#trCheck').click();
    await expect(page.locator('#trMsg')).toContainText('Juste');
    await expect(page.locator('#trSteps .tr-step.good')).toHaveCount(8);
  });

  test('une erreur ramène au coup à revoir et marque le pad', async ({ page }) => {
    await rubrique(page, 'Mots');
    await page.locator('#trView').getByRole('button', { name: 'Batterie' }).click();
    await page.locator('#trCheck').click(); // rien joué : le premier « poum » manque
    await expect(page.locator('#trCur')).toContainText('Coup 1 sur 8');
    await expect(page.locator('#trKit .pad[data-id="poum"]')).toHaveClass(/miss/);
    await page.reload();
    await rubrique(page, 'Mots');
    await expect(page.locator('#trKit')).toBeVisible(); // la vue choisie est gardée
  });
});
