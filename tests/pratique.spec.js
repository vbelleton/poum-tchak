const { test, expect, rubrique, frapperPad } = require('./outils/base');

async function ouvrirBatterie(page) {
  await rubrique(page, 'Pratique');
  await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
  await expect(page.locator('#kitView')).toBeVisible();
}

/* Tape sur un pad au moment où la grille arrive sur une case de ce fût. */
async function frapperEnRythme(page, id, nombre) {
  return page.evaluate(([id, nombre]) => new Promise((ok) => {
    let n = 0, derniere = document.querySelector(`#grid .cell.on.now[data-id="${id}"]`);
    const iv = setInterval(() => {
      const c = document.querySelector(`#grid .cell.on.now[data-id="${id}"]`);
      if (derniere && !derniere.classList.contains('now')) derniere = null;
      if (c && c !== derniere) {
        derniere = c; n++;
        document.querySelector(`.pad[data-id="${id}"]`).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, cancelable: true, pressure: 1 }));
        if (n >= nombre) { clearInterval(iv); setTimeout(() => ok(n), 50); }
      }
    }, 4);
  }), [id, nombre]);
}

test.describe("Jouer sur l'écran", () => {
  test('la batterie occupe l\'écran, avec des pads assez grands', async ({ page }) => {
    await ouvrirBatterie(page);
    await expect(page.locator('.pad')).toHaveCount(7);
    for (const id of ['poum', 'tchak', 'doum', 'toum', 'tss', 'tchaa', 'psch']) {
      const b = await page.locator(`.pad[data-id="${id}"]`).boundingBox();
      expect(b.width, id).toBeGreaterThanOrEqual(44);
      expect(b.height, id).toBeGreaterThanOrEqual(44);
    }
    const kick = await page.locator('.pad[data-id="poum"]').boundingBox();
    const crash = await page.locator('.pad[data-id="psch"]').boundingBox();
    expect(kick.y).toBeGreaterThan(crash.y);
    await expect(page.locator('.dock')).toBeVisible();
    await expect(page.locator('#play')).toBeInViewport();
    await expect(page.locator('#kvRead')).toContainText('pouts');
    await expect(page.locator('#kvBeats i')).toHaveCount(4);
  });

  test('une frappe allume le pad et affiche le mot', async ({ page }) => {
    await ouvrirBatterie(page);
    await frapperPad(page, 'toum');
    await expect(page.locator('#kvWord')).toHaveText('toum');
  });

  test('deux doigts en même temps donnent le mot fondu', async ({ page }) => {
    await ouvrirBatterie(page);
    await frapperPad(page, 'poum', 1);
    await frapperPad(page, 'tss', 2);
    await expect(page.locator('#kvWord')).toHaveText('pouts');
  });

  test('pendant la lecture, les frappes en rythme sont notées justes', async ({ page }) => {
    await ouvrirBatterie(page);
    await expect(page.locator('#kvScore')).toHaveText('Lance la lecture pour être noté.');
    await page.locator('#play').click();
    await expect(page.locator('#kvScore')).toHaveText('À toi de jouer');
    await expect(page.locator('#kvBeats i.on')).toHaveCount(1);
    await frapperEnRythme(page, 'poum', 4);
    await expect(page.locator('#kvScore')).toHaveText(/^4 coups justes · ±\d+ ms/);
    await frapperPad(page, 'psch');
    await expect(page.locator('#kvScore')).toContainText('1 à côté');
  });

  test('Échap ferme la vue et rend le focus au bouton', async ({ page }) => {
    await ouvrirBatterie(page);
    await expect(page.getByRole('button', { name: 'Fermer' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#kitView')).toBeHidden();
    await expect(page.getByRole('button', { name: "Jouer sur l'écran" }).first()).toBeFocused();
  });
});

test.describe('Parle-le avant de le jouer', () => {
  const etape = (page, nom) => page.locator('#drillSteps').getByRole('button', { name: new RegExp(nom) });

  test('Écouter joue la mesure, retoucher arrête', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await etape(page, 'Écouter').click();
    await expect(etape(page, 'Écouter')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#play')).toHaveText('Stop');
    await expect(page.locator('#drillMsg')).toContainText('suis les syllabes');
    await etape(page, 'Écouter').click();
    await expect(etape(page, 'Écouter')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#play')).toHaveText('Jouer');
  });

  test('passer de Dire à Écouter garde une seule étape active', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await etape(page, 'Dire').click();
    await expect(page.locator('#drillMsg')).toContainText('à voix haute');
    await etape(page, 'Écouter').click();
    await expect(page.locator('#drillSteps [aria-pressed="true"]')).toHaveCount(1);
    await expect(etape(page, 'Écouter')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Jouer sur l\'écran ouvre la batterie, la mesure se tait et la note reste à la fin', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await etape(page, "Jouer sur l'écran").click();
    await expect(page.locator('#kitView')).toBeVisible();
    await expect(page.locator('#play')).toHaveText('Stop');
    expect(await page.evaluate(() => document.querySelector('#drillSteps [data-v="screen"]').getAttribute('aria-pressed'))).toBe('true');
    await frapperEnRythme(page, 'tchak', 2);
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.locator('#play')).toHaveText('Jouer');
    await expect(page.locator('#drillMsg')).toHaveText(/^Dernier passage : 2 coups justes/);
    await expect(etape(page, "Jouer sur l'écran")).toHaveAttribute('aria-pressed', 'false');
  });

  test('le bouton Jouer du bas sort de l\'étape en cours', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await etape(page, 'Dire').click();
    await page.locator('#play').click();
    await expect(page.locator('#drillSteps [aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('#play')).toHaveText('Jouer');
  });
});
