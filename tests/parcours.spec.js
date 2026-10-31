// Parcours : une étape à la fois, de la main seule aux mélanges.
const { test, expect, rubrique } = require('./outils/base');

const SENS = { poum: ['poum'], tchak: ['tchak'], pak: ['poum', 'tchak'], '.': [] };

test.describe('Parcours', () => {
  test('la première étape et les 25 étapes en 5 chapitres', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await expect(page.locator('#pcNext h3')).toHaveText('Main droite seule : 1 coup par temps');
    await expect(page.locator('#pcProgTxt')).toHaveText('0 sur 25 étapes');
    await expect(page.locator('.pc-st')).toHaveCount(25);
    await expect(page.locator('.pc-ch')).toHaveCount(5);
    await expect(page.locator('.pc-st').first()).toHaveAttribute('aria-current', 'step');
  });

  test('une étape de mains réussie ouvre la suivante, et c\'est gardé', async ({ page }) => {
    test.setTimeout(90_000);
    await rubrique(page, 'Parcours');
    await page.locator('#pcGo').click();
    await expect(page.locator('#p-mains')).toBeVisible();
    await expect(page.locator('.mn-tab')).toBeHidden(); // pendant l'étape, seulement l'essentiel
    await expect(page.locator('#mnL .mn-dot')).toHaveCount(0); // main gauche au repos
    await expect(page.locator('#mnR .mn-dot')).toHaveCount(4);
    await expect(page.locator('#bpmIn')).toHaveValue('60');
    await expect(page.locator('#pcBar')).toContainText('Étape 1/25');
    // la main droite joue en rythme jusqu'à la fin
    await page.evaluate(async () => {
      const pad = document.querySelector('#mnPadR');
      const fin = performance.now() + 26000;
      while (performance.now() < fin && !document.querySelector('#pcBar.ok')) {
        const x = window.__mnExp('r');
        if (x != null) {
          await new Promise((r) => setTimeout(r, x * 1000));
          pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 40));
        } else await new Promise((r) => setTimeout(r, 10));
      }
    });
    await expect(page.locator('#pcBar')).toHaveClass(/ok/, { timeout: 5000 });
    await expect(page.locator('#pcBar')).toContainText('Réussi à 60 BPM');
    await expect(page.locator('#pcBar')).toContainText('droite');
    await expect(page.locator('#pcBarTxt')).not.toContainText('gauche'); // la main au repos n'est pas notée
    await expect(page.locator('#pcBarBtns')).toContainText('Étape suivante : Main gauche seule');
    await page.reload();
    await rubrique(page, 'Parcours');
    await expect(page.locator('#pcProgTxt')).toHaveText('1 sur 25 étapes');
    await expect(page.locator('#pcNext h3')).toHaveText('Main gauche seule : 1 coup par temps');
    await expect(page.locator('.pc-st.done')).toHaveCount(1);
  });

  test('arrêter en route propose de recommencer', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.locator('#pcGo').click();
    await page.waitForTimeout(500);
    await page.locator('#play').click();
    await expect(page.locator('#pcBar')).toContainText('Arrêté avant la fin');
    await expect(page.locator('#pcBarBtns')).toContainText('Recommencer');
    await page.locator('#pcBarBtns').getByRole('button', { name: "Quitter l'étape" }).click();
    await expect(page.locator('#pcBar')).toBeHidden();
    await expect(page.locator('#p-parcours')).toBeVisible();
    await rubrique(page, 'Mains');
    await expect(page.locator('.mn-tab')).toBeVisible();
  });

  test('une étape de traduction : 3 consignes justes du premier coup', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.locator('.pc-st').nth(8).click();
    await expect(page.locator('#pcNext h3')).toContainText('Traduire 3 consignes (facile)');
    await page.locator('#pcGo').click();
    await expect(page.locator('#p-mots')).toBeVisible();
    await expect(page.locator('#pcBar')).toContainText('0 sur 3');
    await page.locator('#trView').getByRole('button', { name: 'Grille' }).click();
    for (let n = 1; n <= 3; n++) {
      const mots = (await page.locator('#trSay b').allTextContents()).join(' ').trim().split(/\s+/);
      for (let i = 0; i < 8; i++) {
        for (const id of SENS[mots[i]]) await page.locator(`#trGrid .tr-c[data-id="${id}"][data-s="${i}"]`).click();
      }
      await page.locator('#trCheck').click();
      if (n < 3) {
        await expect(page.locator('#pcBar')).toContainText(`${n} sur 3`);
        await expect(page.locator('#trGrid .tr-c[aria-pressed="true"]')).toHaveCount(0, { timeout: 4000 }); // consigne suivante
      }
    }
    await expect(page.locator('#pcBar')).toHaveClass(/ok/);
    await expect(page.locator('#pcBarBtns')).toContainText('Étape suivante : Main droite seule : 3 coups');
  });

  test('voir la réponse ne compte pas', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.locator('.pc-st').nth(8).click();
    await page.locator('#pcGo').click();
    await page.locator('#trShow').click();
    await expect(page.locator('#pcBar')).toContainText('0 sur 3');
  });

  test('les onglets tiennent sur un petit écran', async ({ page }) => {
    for (const w of [320, 390]) {
      await page.setViewportSize({ width: w, height: 700 });
      const coupe = await page.evaluate(() => [...document.querySelectorAll('.tabs [role=tab]')].some((e) => e.scrollWidth > e.clientWidth + 1));
      expect(coupe, `onglets à ${w} px`).toBe(false);
      const l = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(l).toBeLessThanOrEqual(0);
    }
  });
});
