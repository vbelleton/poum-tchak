// Point de départ commun : page neuve, mémoire vide, polices externes coupées,
// et toute erreur JavaScript fait échouer le test.
const base = require('@playwright/test');

const test = base.test.extend({
  page: async ({ page }, use) => {
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto('index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#grid .cell').first().waitFor();
    await use(page);
    base.expect(erreurs, 'erreurs JavaScript dans la page').toEqual([]);
  },
});

const expect = base.expect;

/** Ouvre une rubrique par son onglet. */
async function rubrique(page, nom) {
  await page.getByRole('tab', { name: nom }).click();
  await expect(page.getByRole('tab', { name: nom })).toHaveAttribute('aria-selected', 'true');
}

/** Cellule de la grille : fût et numéro de pas (0 = premier pas). */
const cellule = (page, id, pas) => page.locator(`#grid .cell[data-id="${id}"][data-s="${pas}"]`);

/** Frappe sur un pad de la vue « Jouer sur l'écran », avec un identifiant de doigt. */
async function frapperPad(page, id, doigt = 1) {
  await page.locator(`.pad[data-id="${id}"]`).dispatchEvent('pointerdown', {
    pointerId: doigt, pointerType: 'touch', isPrimary: doigt === 1, pressure: 1, bubbles: true, cancelable: true,
  });
}

/** Ce que la mémoire locale contient. */
const memoire = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.v2') || '{}'));

module.exports = { test, expect, rubrique, cellule, frapperPad, memoire };
