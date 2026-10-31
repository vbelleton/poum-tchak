// Rubrique Mains : chaque main joue n coups par temps (indépendance).
const { test, expect, rubrique } = require('./outils/base');

async function ouvrir(page) {
  await rubrique(page, 'Mains');
  await expect(page.locator('#p-mains')).toBeVisible();
}
const regler = (page, bpm) => page.locator('#bpmIn').fill(String(bpm)).then(() => page.locator('#bpmIn').press('Enter'));

test.describe('Mains', () => {
  test('deux lignes de quatre temps, droite 1 et gauche 2 au départ', async ({ page }) => {
    await ouvrir(page);
    await expect(page.locator('#mnR .mn-beat')).toHaveCount(4);
    await expect(page.locator('#mnL .mn-beat')).toHaveCount(4);
    await expect(page.locator('#mnR .mn-dot')).toHaveCount(4);
    await expect(page.locator('#mnL .mn-dot')).toHaveCount(8);
    await expect(page.locator('#mnMsg')).toContainText('Droite : 1 coup par temps · Gauche : 2 coups par temps');
  });

  test('toucher un temps change son nombre de coups, les boutons règlent toute la main', async ({ page }) => {
    await ouvrir(page);
    const t1 = page.locator('#mnR .mn-beat').first();
    await t1.click();
    await expect(t1.locator('.mn-dot')).toHaveCount(2);
    await expect(page.locator('#mnMsg')).toContainText('Droite : 2-1-1-1 coups par temps');
    await page.locator('#mnSegL').getByRole('button', { name: '3', exact: true }).click();
    await expect(page.locator('#mnL .mn-dot')).toHaveCount(12);
    await page.locator('#mnSegR').getByRole('button', { name: '1·2·3·4' }).click();
    await expect(page.locator('#mnR .mn-dot')).toHaveCount(10);
    await page.locator('#mnSwap').click();
    await expect(page.locator('#mnR .mn-dot')).toHaveCount(12);
    await expect(page.locator('#mnL .mn-dot')).toHaveCount(10);
  });

  test('ça joue : chaque main allume tous ses coups, régulièrement, puis Stop', async ({ page }) => {
    await ouvrir(page);
    await regler(page, 200);
    await page.locator('#mnSegR').getByRole('button', { name: '3', exact: true }).click();
    await page.locator('#mnSegL').getByRole('button', { name: '2', exact: true }).click();
    const vu = await page.evaluate(() => {
      window.__v = { r: [], l: [] };
      for (const h of ['r', 'l']) {
        document.querySelectorAll('#mn' + h.toUpperCase() + ' .mn-dot').forEach((d, i) => {
          new MutationObserver(() => { if (d.classList.contains('on')) window.__v[h].push([i, performance.now()]); })
            .observe(d, { attributes: true, attributeFilter: ['class'] });
        });
      }
    });
    await page.locator('#play').click();
    await expect(page.locator('#play')).toContainText('Stop');
    await page.waitForTimeout(2000);
    const v = await page.evaluate(() => window.__v);
    expect(new Set(v.r.map((x) => x[0])).size).toBe(12);
    expect(new Set(v.l.map((x) => x[0])).size).toBe(8);
    // droite : 3 coups par temps à 200 BPM = un coup toutes les 100 ms
    const ecarts = v.r.slice(1).map((x, i) => x[1] - v.r[i][1]).filter((e) => e < 400).sort((a, b) => a - b);
    const med = ecarts[Math.floor(ecarts.length / 2)];
    expect(med).toBeGreaterThan(75);
    expect(med).toBeLessThan(125);
    await page.locator('#play').click();
    await expect(page.locator('#play')).toContainText('Jouer');
  });

  test('changer de rubrique arrête les mains', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#play').click();
    await expect(page.locator('#play')).toContainText('Stop');
    await rubrique(page, 'Rythme');
    await expect(page.locator('#play')).toContainText('Jouer');
  });

  test('les 16 duos s\'enchaînent, deux mesures chacun', async ({ page }) => {
    await ouvrir(page);
    await regler(page, 220);
    await page.locator('#mnWalk').check();
    await page.locator('#play').click();
    await expect(page.locator('#mnMsg')).toContainText('Duo 1 sur 16 : droite 1 contre gauche 1');
    await expect(page.locator('#mnMsg')).toContainText('Duo 2 sur 16 : droite 1 contre gauche 2', { timeout: 6000 });
    await expect(page.locator('#mnL .mn-dot')).toHaveCount(8);
  });

  test('le réglage est gardé', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#mnSegR').getByRole('button', { name: '4', exact: true }).click();
    await page.reload();
    await ouvrir(page);
    await expect(page.locator('#mnR .mn-dot')).toHaveCount(16);
  });

  test('pas de débordement à 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ouvrir(page);
    await page.locator('#mnSegR').getByRole('button', { name: '4', exact: true }).click();
    const l = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(l).toBeLessThanOrEqual(0);
    const onglets = await page.evaluate(() => [...document.querySelectorAll('.tabs [role=tab]')].map((b) => b.scrollWidth > b.clientWidth + 1));
    expect(onglets.some(Boolean)).toBe(false);
  });

  test('iPhone : la session audio passe en « lecture »', async ({ page }) => {
    await page.addInitScript(() => { navigator.audioSession = { type: 'auto' }; });
    await page.reload();
    await ouvrir(page);
    await page.locator('#play').click();
    expect(await page.evaluate(() => navigator.audioSession.type)).toBe('playback');
  });
});
