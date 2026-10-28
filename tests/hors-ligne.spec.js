const { test, expect } = require('./outils/base');

test.describe('Hors ligne', () => {
  test("après une visite, l'appli s'ouvre sans réseau", async ({ page, context }) => {
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true);
    await expect(page.locator('#offlineMsg')).toContainText('Prêt à fonctionner sans réseau');
    const enCache = await page.evaluate(async () => (await (await caches.open('poum-tchak-v1')).keys()).map((r) => new URL(r.url).pathname.split('/').pop()));
    expect(enCache).toEqual(expect.arrayContaining(['index.html', 'manifest.webmanifest', 'icon-192.png']));
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#grid .cell')).toHaveCount(7 * 16);
    await page.locator('#soundSeg').getByRole('button', { name: 'Batterie' }).click();
    await expect(page.locator('#soundMsg')).toHaveText('Sons de la batterie enregistrée.');
    await context.setOffline(false);
  });

  test("le manifeste permet l'installation", async ({ page }) => {
    const m = await (await page.request.get('manifest.webmanifest')).json();
    expect(m.name).toBe('Poum Tchak');
    expect(m.display).toBe('standalone');
    expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });
});
