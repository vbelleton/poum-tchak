// Drumstick Spin (prototype) : entrer dans le mode depuis le menu VR, vérifier la session, revenir à la batterie.
// Le simulateur IWER ne donne pas de vrais mouvements de doigts : la pince et la tenue de la baguette
// restent à valider sur un Quest 2.
const fs = require('fs');
const path = require('path');
const { test, expect, rubrique } = require('./outils/base');

const IWER = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'iwer', 'build', 'iwer.min.js'), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('poumtchak.vr.decor', 'nuit'));
  await page.addInitScript(IWER + ';window.__dev=new IWER.XRDevice(IWER.metaQuest2);window.__dev.installRuntime();');
  await page.reload();
  await page.locator('#grid .cell').first().waitFor();
});

const vr = (page) => page.evaluate(() => window.__gm.vr().debug());
async function bouton(page, main, id) {
  await page.evaluate(([m, b]) => window.__dev.controllers[m].updateButtonValue(b, 1), [main, id]);
  await page.waitForTimeout(80);
  await page.evaluate(([m, b]) => window.__dev.controllers[m].updateButtonValue(b, 0), [main, id]);
  await page.waitForTimeout(80);
}

test('Drumstick Spin : entrer depuis le menu VR, puis revenir à la batterie avec B', async ({ page }) => {
  test.setTimeout(60_000);
  await rubrique(page, 'Jeux');
  await page.locator('#gmTol').getByRole('button', { name: 'Indulgent' }).click();
  await page.locator('#gmVR').click();
  await expect.poll(async () => (await vr(page))?.placed).toBe(true);

  // menu : Spin › puis Commencer
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('spinmenu'); v.menuPress('spinstart'); });
  await expect.poll(async () => (await vr(page))?.spin).toBe(true);
  const pendant = await vr(page);
  expect(pendant.menu).toBe(false);
  expect(pendant.kitPos).toBeTruthy();
  // la session WebXR reste ouverte et le mode a ses mains
  expect(pendant.xr).toBe(true);
  expect(await page.evaluate(() => window.__gm.vr().spinDebug())).toEqual(expect.objectContaining({ seen: expect.any(Array), held: expect.any(Array) }));

  expect(pendant.spinInfo.trick).toBe(null);

  // B revient à la batterie, avec le menu
  await bouton(page, 'right', 'b-button');
  await expect.poll(async () => (await vr(page))?.spin).toBe(false);
  await expect.poll(async () => (await vr(page))?.menu).toBe(true);
  expect(await page.evaluate(() => window.__gm.vr().state().mode)).toBe('main');

  // Thumb Around : même chemin, mode trick
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('spinmenu'); v.menuPress('spinthumb'); });
  await expect.poll(async () => (await vr(page))?.spinInfo?.trick).toBe('thumb');
  // la main fantôme montre le geste, avec sa baguette
  await expect.poll(async () => (await vr(page))?.spinInfo?.ghostStick, { timeout: 10_000 }).toBe(true);
  // les deux mains (mode mains du simulateur) : chacune est suivie, dessinée en os, et tient sa baguette du tour
  await page.evaluate(() => { window.__dev.primaryInputMode = 'hand'; });
  await expect.poll(async () => (await vr(page))?.spinInfo?.seen).toEqual([true, true]);
  const mains = (await vr(page)).spinInfo;
  // main en os tant que le modèle réaliste n'est pas chargé (il peut l'être déjà, s'il est en cache)
  if (!mains.mesh.every(Boolean)) { expect(mains.bones).toBeGreaterThan(40); expect(mains.tips).toBe(10); }
  expect(mains.phase).toEqual(['idle', 'idle']);
  // tuto guidé : pincer (étape 1), garder le pouce immobile (2), ouvrir (3 : la baguette tourne seule),
  // puis l'étape 4 attend une pince au bon moment
  expect(mains.tuto).toBe(0);
  // la main réaliste (modèle WebXR generic-hand, gardé dans vr/hands/) se charge pour les deux mains
  await expect.poll(async () => (await vr(page)).spinInfo.mesh, { timeout: 10_000 }).toEqual([true, true]);
  const pince = (v) => page.evaluate((x) => { for (const h of Object.values(window.__dev.hands)) h.updatePinchValue(x); }, v);
  await pince(1);
  await expect.poll(async () => (await vr(page)).spinInfo.tuto, { timeout: 10_000 }).toBe(2);
  await pince(0);
  await expect.poll(async () => (await vr(page)).spinInfo.tuto, { timeout: 10_000 }).toBe(4);
  await page.evaluate(() => { window.__dev.primaryInputMode = 'controller'; });
  await page.waitForTimeout(200);
  await bouton(page, 'right', 'b-button');
  await expect.poll(async () => (await vr(page))?.spin).toBe(false);
  await expect.poll(async () => (await vr(page))?.menu).toBe(true);

  // Rebond : le pad d'entraînement, on commence main ouverte
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('spinmenu'); v.menuPress('spinreb'); });
  await expect.poll(async () => (await vr(page))?.spinInfo?.rebond).toBe('open');
  await bouton(page, 'right', 'b-button');
  await expect.poll(async () => (await vr(page))?.spin).toBe(false);

  // le casque se quitte avec B encore
  await bouton(page, 'right', 'b-button');
  await expect.poll(() => vr(page)).toBeNull();
});

test('Drumstick Spin : en aperçu (sans casque), un message dit qu\'il faut un casque', async ({ page }) => {
  await page.goto('index.html?vr=apercu');
  await page.locator('#grid .cell').first().waitFor();
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  await expect.poll(() => page.evaluate(() => !!window.__gm.vr()?.debug())).toBe(true);
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('mini'); v.menuPress('open'); v.menuPress('spinmenu'); v.menuPress('spinstart'); });
  await expect.poll(async () => (await page.evaluate(() => window.__gm.vr().state())).mode).toBe('spin');
  expect(await page.evaluate(() => window.__gm.vr().spinDebug())).toBeNull();
  expect(await page.evaluate(() => window.__gm.vr().state().focus)).toBe('spinstart');
});
