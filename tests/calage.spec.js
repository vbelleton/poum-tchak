// Calage express avant de jouer : 2 clics d'écoute, 5 frappes, le délai mesuré est compensé.
const { test, expect, rubrique } = require('./outils/base');

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => { window.__calibForce = true; });
});

// Tape sur le grand bouton, « decal » ms après chacun des clics à frapper (n frappes).
async function taperCalage(page, decal, n = 5) {
  return page.evaluate(async ({ decal, n }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    while (!window.__cb().clicks.length) await sleep(10);
    const { clicks } = window.__cb();
    let faits = 0;
    for (let i = 2; i < 7 && faits < n; i++) {
      const cible = clicks[i] + decal / 1000;
      while (window.__cb().now < cible) await sleep(2);
      document.querySelector('#cbTap').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      faits++;
    }
    return faits;
  }, { decal, n });
}

test.describe('Calage avant de jouer', () => {
  test('Mains : on cale avant la partie, le délai mesuré est compensé, puis on joue', async ({ page }) => {
    await rubrique(page, 'Mains');
    await page.locator('#play').click();
    await expect(page.locator('#calib')).toBeVisible();
    await expect(page.locator('#cbDo')).toContainText('Écoute');
    expect(await taperCalage(page, 70)).toBe(5);
    await expect(page.locator('#cbDo')).toHaveText("C'est calé !", { timeout: 4000 });
    await expect(page.locator('#cbRes')).toContainText('régulières');
    await expect(page.locator('#cbDots i.on')).toHaveCount(5);
    const off = parseInt((await page.locator('#offVal').textContent()).replace('+', ''), 10);
    expect(Math.abs(off - 70)).toBeLessThan(25);
    await page.locator('#cbGo').click();
    await expect(page.locator('#calib')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
    // une fois calé, on ne redemande pas (même après rechargement)
    await page.locator('#play').click();
    await expect(page.locator('body')).not.toHaveClass(/mn-live/);
    await page.locator('#play').click();
    await expect(page.locator('#calib')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
  });

  test('plusieurs calages : la moyenne compte, et on peut oublier les anciens', async ({ page }) => {
    await rubrique(page, 'Mains');
    await page.locator('#play').click();
    await taperCalage(page, 20);
    await expect(page.locator('#cbDo')).toHaveText("C'est calé !", { timeout: 4000 });
    await page.locator('#cbAgain').click();
    await expect(page.locator('#cbDo')).toContainText('Écoute');
    await taperCalage(page, 120);
    await expect(page.locator('#cbDo')).toHaveText("C'est calé !", { timeout: 4000 });
    await expect(page.locator('#cbRes')).toContainText('moyenne de tes 2 derniers calages');
    const moyenne = parseInt((await page.locator('#offVal').textContent()).replace('+', ''), 10);
    expect(Math.abs(moyenne - 70)).toBeLessThan(30);
    await page.locator('#cbForget').click();
    const seul = parseInt((await page.locator('#offVal').textContent()).replace('+', ''), 10);
    expect(Math.abs(seul - 120)).toBeLessThan(30);
  });

  test('le calage est retenu : après rechargement, on ne redemande pas', async ({ page }) => {
    await rubrique(page, 'Mains');
    await page.locator('#play').click();
    await taperCalage(page, 40);
    await expect(page.locator('#cbDo')).toHaveText("C'est calé !", { timeout: 4000 });
    await page.locator('#cbGo').click();
    await page.reload();
    await page.evaluate(() => { window.__calibForce = true; });
    await rubrique(page, 'Mains');
    await page.locator('#play').click();
    await expect(page.locator('#calib')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
  });

  test('pas assez de frappes : rien n\'est changé, on peut recommencer ou jouer quand même', async ({ page }) => {
    await rubrique(page, 'Mains');
    await page.locator('#play').click();
    await taperCalage(page, 0, 3);
    await expect(page.locator('#cbDo')).toContainText('Pas assez', { timeout: 6000 });
    await expect(page.locator('#offVal')).toHaveText('0 ms');
    await expect(page.locator('#cbAgain')).toBeVisible();
    await expect(page.locator('#cbGo')).toHaveText('Jouer sans caler');
    await page.locator('#cbAgain').click();
    await expect(page.locator('#cbDo')).toContainText('Écoute');
    await page.locator('#cbSkip').click();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
  });

  test('Passer lance la partie tout de suite et ne redemande plus', async ({ page }) => {
    await rubrique(page, 'Mains');
    await page.locator('#play').click();
    await page.locator('#cbSkip').click();
    await expect(page.locator('#calib')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
    await page.locator('#play').click();
    await page.locator('#play').click();
    await expect(page.locator('#calib')).toBeHidden();
  });

  test('le bouton Caler refait le calage à la demande, la barre d\'espace compte comme une frappe', async ({ page }) => {
    await rubrique(page, 'Mains');
    await page.locator('#mnCal').click();
    await expect(page.locator('#calib')).toBeVisible();
    await expect(page.locator('#cbGo')).toHaveText('OK');
    await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      while (!window.__cb().clicks.length) await sleep(10);
      const { clicks } = window.__cb();
      for (let i = 2; i < 7; i++) {
        while (window.__cb().now < clicks[i] + 0.03) await sleep(2);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      }
    });
    await expect(page.locator('#cbDo')).toHaveText("C'est calé !", { timeout: 4000 });
    await page.locator('#cbGo').click();
    await expect(page.locator('#calib')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/mn-live/);
  });

  test("Jouer sur l'écran : le calage passe avant la partie", async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
    await expect(page.locator('#kitView')).toBeVisible();
    await page.locator('#play').click();
    await expect(page.locator('#calib')).toBeVisible();
    await page.locator('#cbSkip').click();
    await expect(page.locator('#calib')).toBeHidden();
    await expect(page.locator('#play')).toContainText('Stop');
  });

  test('Parcours : une étape des mains commence par le calage', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await page.locator('#pcGo').click();
    await expect(page.locator('#calib')).toBeVisible();
    await page.locator('#cbSkip').click();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
  });
});
