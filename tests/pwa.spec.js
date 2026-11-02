// Installation comme une appli (PWA).
const { test, expect, rubrique } = require('./outils/base');

test.describe('Appli installable', () => {
  test('manifeste complet : nom, plein écran, icônes dont une « maskable », raccourcis', async ({ page, request }) => {
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    const m = await (await request.get('manifest.webmanifest')).json();
    expect(m.name).toBe('Poum Tchak');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('./');
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true);
    for (const i of m.icons) expect((await request.get(i.src)).ok(), i.src).toBe(true);
    expect(m.shortcuts.map((s) => s.name)).toEqual(['Parcours', 'Mains', 'Rythme']);
  });

  test('un raccourci ouvre la bonne rubrique', async ({ page }) => {
    await page.goto('index.html?rubrique=mains');
    await expect(page.locator('#p-mains')).toBeVisible();
  });

  test('Android : le bouton Installer ouvre la fenêtre du navigateur', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await expect(page.locator('#inst')).toBeHidden();
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      e.prompt = () => { window.__demande = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await expect(page.locator('#inst')).toBeVisible();
    await page.locator('#instBtn').click();
    expect(await page.evaluate(() => window.__demande)).toBe(true);
    await expect(page.locator('#inst')).toBeHidden();
  });

  test('« plus tard » ne la remontre pas', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt() {} })));
    await rubrique(page, 'Parcours');
    await page.locator('#instX').click();
    await page.reload();
    await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt() {} })));
    await rubrique(page, 'Parcours');
    await expect(page.locator('#inst')).toBeHidden();
  });
});

test.describe('Appli installable sur iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  test('on explique comment l\'ajouter à l\'écran d\'accueil', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await expect(page.locator('#inst')).toBeVisible();
    await page.locator('#instBtn').click();
    await expect(page.locator('#instTxt')).toContainText("Sur l'écran d'accueil");
  });
});
