// Écoute au micro, avec un faux micro qui joue une batterie de synthèse.
// Long (environ 40 secondes par test) : marqué @lent.
const { test, expect, rubrique } = require('./outils/base');
const { FICHIER } = require('./outils/batterie-wav');

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${FICHIER}`, '--autoplay-policy=no-user-gesture-required'],
  },
});

const grille = (page) => page.evaluate(() => {
  const o = {};
  document.querySelectorAll('#grid .cell.on').forEach((c) => { (o[c.dataset.id] = o[c.dataset.id] || []).push(+c.dataset.s); });
  Object.values(o).forEach((v) => v.sort((a, b) => a - b));
  return o;
});

test.describe('Micro @lent', () => {
  test.setTimeout(120_000);

  test('la calibration apprend trois fûts et reconnaît le groove', async ({ page }) => {
    await rubrique(page, 'Écoute');
    const fut = (nom) => page.locator('#calPick').getByRole('button', { name: new RegExp(`^${nom}`) });
    await fut('poum').click();
    await expect(page.locator('#liveBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(fut('poum · appris')).toBeVisible({ timeout: 6000 });
    await fut('tchak').click();
    await expect(fut('tchak · appris')).toBeVisible({ timeout: 6000 });
    await fut('tss').click();
    await expect(fut('tss · appris')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#calMsg')).toHaveText('Charleston fermé appris. 3 fûts appris.');

    await page.waitForTimeout(25_000);
    await expect(page.locator('#resBpm')).toHaveText(/≈ (99|100|101) BPM/);
    await page.locator('#applyRhythm').click();
    await rubrique(page, 'Rythme');
    expect(await grille(page)).toEqual({ poum: [0, 8], tchak: [4, 12], tss: [2, 6, 10, 14] });
  });

  test('l\'étape 4 note la mesure jouée sur la batterie', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.locator('#drillSteps').getByRole('button', { name: /Jouer sur ta batterie/ }).click();
    await expect(page.locator('#drillMsg')).toContainText('Micro allumé');
    await expect(page.locator('#drillMsg')).toHaveText(/^\d+ % de coups justes/, { timeout: 45_000 });
    await page.locator('#drillSteps').getByRole('button', { name: /Jouer sur ta batterie/ }).click();
    await expect(page.locator('#liveBtn')).toHaveAttribute('aria-pressed', 'false');
  });

  test('ma vraie batterie : les coups entendus allument les pads, et le tempo entendu s\'affiche', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
    await page.evaluate(() => {
      window.__allumes = new Set();
      document.querySelectorAll('.pad').forEach((p) => new MutationObserver(() => {
        if (p.classList.contains('on')) window.__allumes.add(p.dataset.id);
      }).observe(p, { attributes: true, attributeFilter: ['class'] }));
    });
    await page.locator('#kvMic').click();
    await expect(page.locator('#kvMic')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#kvHint')).toContainText('Joue sur ta batterie');
    // le faux micro joue 3 grosses caisses, 3 caisses claires, 3 charlestons, puis un groove à 100 BPM
    await expect.poll(() => page.evaluate(() => [...window.__allumes].sort()), { timeout: 15_000 }).toEqual(['poum', 'tchak', 'tss']);
    await expect(page.locator('#kvHear')).toContainText(/≈ (99|100|101) BPM/, { timeout: 40_000 });
    await page.locator('#kvTake').click();
    await expect(page.locator('#bpmIn')).toHaveValue(/^(99|100|101)$/);
    // fermer la vue éteint le micro
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.locator('#liveBtn')).toHaveAttribute('aria-pressed', 'false');
  });

  test('ma vraie batterie : en jouant, chaque coup entendu est noté', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
    await page.locator('#kvMic').click();
    await expect(page.locator('#kvMic')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#play').click();
    await expect(page.locator('#kvHint')).toContainText('Joue sur ta batterie', { timeout: 6000 });
    await expect(page.locator('#kvScore')).toContainText(/juste|tôt ou tard|en trop/, { timeout: 20_000 });
  });
});

