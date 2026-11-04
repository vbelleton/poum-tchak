// Test du jour : mesurer sa forme pour régler le tempo de départ.
const { test, expect, rubrique } = require('./outils/base');

test.describe('Test du jour', () => {
  test('proposé en haut de Parcours et de Mains, on peut le passer pour la journée', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await expect(page.locator('#p-parcours .pl-ban')).toBeVisible();
    await page.locator('#p-parcours .pl-no').click();
    await expect(page.locator('#p-parcours .pl-ban')).toBeHidden();
    await rubrique(page, 'Mains');
    await expect(page.locator('#p-mains .pl-ban')).toBeHidden();
    await page.reload();
    await rubrique(page, 'Mains');
    await expect(page.locator('#p-mains .pl-ban')).toBeHidden();
  });

  test('le tempo monte à chaque mesure tant que tu suis, puis la séance part sous ta forme', async ({ page }) => {
    test.setTimeout(120_000);
    await rubrique(page, 'Mains');
    await page.locator('#p-mains .pl-go').click();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
    await expect(page.locator('#bpmIn')).toHaveValue('50');
    // on tape toutes les croches de la main droite jusqu'à ce qu'on décroche
    await page.evaluate(async () => {
      const pad = document.querySelector('#mnPadR');
      const fin = performance.now() + 60000;
      let n = 0;
      while (performance.now() < fin && document.body.classList.contains('mn-live')) {
        const x = window.__mnExp('r');
        if (x != null) {
          await new Promise((r) => setTimeout(r, x * 1000));
          // à partir de 100 BPM on ne tape plus : le test s'arrête
          if (+document.querySelector('#bpmIn').value < 100) pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          n++;
          await new Promise((r) => setTimeout(r, 40));
        } else await new Promise((r) => setTimeout(r, 10));
      }
    });
    const res = page.locator('#mnRes');
    await expect(res).toBeVisible({ timeout: 10000 });
    await expect(res).toContainText('Ta forme du jour');
    await expect(res).toContainText('premier test');
    const m = await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.progres')));
    expect(m.place.length).toBe(1);
    const best = m.place[0].bpm;
    expect(best).toBeGreaterThanOrEqual(58);
    expect(best).toBeLessThan(110);
    // la séance part à ~80 % de la forme, arrondie à 5
    const depart = Math.round((best * 0.8) / 5) * 5;
    await expect(page.locator('#bpmIn')).toHaveValue(String(depart));
    await expect(page.locator('#plPlay')).toHaveText('Jouer à ' + depart + ' BPM');
    // il n'est plus proposé aujourd'hui, et l'historique est dans Parcours
    await expect(page.locator('#p-mains .pl-ban')).toBeHidden();
    // le résultat est en plein écran par-dessus tout : on le ferme
    await page.locator('#plX').click();
    await expect(page.locator('#mnRes')).toBeHidden();
    await rubrique(page, 'Parcours');
    await expect(page.locator('#prBox')).toContainText('Ta forme');
    await expect(page.locator('#prBox')).toContainText(best + ' BPM');
    // les réglages d'avant le test sont revenus
    await rubrique(page, 'Mains');
    await expect(page.locator('#mnColL .mn-opt[aria-checked="true"]')).toHaveAttribute('data-v', '2');
  });

  test('on peut taper sur le pad gauche : n\'importe quel pad compte, et le tempo attend qu\'on ait trouvé le rythme', async ({ page }) => {
    test.setTimeout(90_000);
    await rubrique(page, 'Mains');
    await page.locator('#p-mains .pl-go').click();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
    const bpms = await page.evaluate(async () => {
      const pad = document.querySelector('#mnPadL'); // pas le bon pad exprès
      const vus = new Set(); const fin = performance.now() + 28000;
      while (performance.now() < fin && document.body.classList.contains('mn-live')) {
        vus.add(document.querySelector('#bpmIn').value);
        const x = window.__mnExp('r');
        if (x != null) { await new Promise((r) => setTimeout(r, x * 1000)); pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise((r) => setTimeout(r, 40)); }
        else await new Promise((r) => setTimeout(r, 10));
      }
      return [...vus];
    });
    expect(bpms.length, bpms.join(',')).toBeGreaterThanOrEqual(2); // le tempo a monté parce que les frappes comptent
  });

  test('sans aucun coup, on l\'explique et on peut recommencer', async ({ page }) => {
    test.setTimeout(90_000);
    await rubrique(page, 'Parcours');
    await page.locator('#p-parcours .pl-go').click();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
    await expect(page.locator('#mnRes')).toContainText('Pas assez de coups justes', { timeout: 50000 });
    await expect(page.locator('#plAgain')).toBeVisible();
    await expect(page.locator('#bpmIn')).toHaveValue('50');
  });
});
