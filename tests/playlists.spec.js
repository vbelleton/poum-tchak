// Playlists : une liste de chants, jouée l'un après l'autre (page et casque).
const { test, expect, rubrique } = require('./outils/base');

async function creer(page) {
  await rubrique(page, 'Jeux');
  await page.locator('#gmPlNew').click();
  await expect(page.locator('#plName')).toBeVisible();
  await page.locator('#plName').fill('Dimanche');
  const ids = await page.locator('#plAdd option').evaluateAll((l) => l.map((o) => o.value).filter(Boolean));
  await page.locator('#plAdd').selectOption(ids[0]);
  await page.locator('#plAdd').selectOption(ids[1]);
  await page.locator('#plAdd').selectOption(ids[2]);
  await expect(page.locator('#plList li')).toHaveCount(3);
  // le troisième remonte en deuxième, puis on retire le dernier
  await page.locator('#plList [data-a="up"][data-i="2"]').click();
  await page.locator('#plList [data-a="del"][data-i="2"]').click();
  await expect(page.locator('#plList li')).toHaveCount(2);
  await page.locator('#plOk').click();
  await expect(page.locator('#gmPl .chip')).toHaveText(['Dimanche · 2 chants']);
  return [ids[0], ids[2]];
}

test.describe('Playlists', () => {
  test('créer, renommer, réordonner, puis enchaîner les chants au bilan', async ({ page }) => {
    test.setTimeout(90_000);
    const ordre = await creer(page);
    const garde = await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.playlists')));
    expect(garde[0].name).toBe('Dimanche');
    expect(garde[0].items).toEqual(ordre);
    await page.locator('#gmPlGo').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => window.__gm.pls.rh())).toBe(ordre[0]);
    await page.evaluate(() => window.__gm.pls.fin());
    await expect(page.locator('#mnRes')).toContainText('chant 1 sur 2');
    await page.locator('#gmResNext').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() => window.__gm.on());
    expect(await page.evaluate(() => window.__gm.pls.rh())).toBe(ordre[1]);
    await page.evaluate(() => window.__gm.pls.fin());
    await expect(page.locator('#mnRes')).toContainText('c\'était le dernier');
    await expect(page.locator('#gmResNext')).toHaveCount(0);
  });

  test('choisir un autre chant quitte la playlist ; on peut la supprimer', async ({ page }) => {
    await creer(page);
    await page.evaluate(() => window.__gm.pls.start(window.__gm.pls.sel()));
    await page.evaluate(() => window.__gm.pls.render());
    await expect(page.locator('#gmPlHint')).toContainText('En cours : Dimanche, chant 1 sur 2');
    await page.locator('#gmRh .chip').first().click();
    await expect(page.locator('#gmPlHint')).not.toContainText('En cours');
    await page.locator('#gmPlEdit').click();
    await page.locator('#plDel').click();
    await page.locator('#plDel').click();
    await expect(page.locator('#gmPl .chip')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.playlists')))).toEqual([]);
  });

  test('dans le casque : la playlist se choisit comme un chant, et « Suivant » passe au prochain', async ({ page }) => {
    const ordre = await creer(page);
    const r = await page.evaluate(() => {
      const api = window.__gm.vrApi, src = api.sources();
      api.set('rh', src[0].id);
      const avant = { src0: src[0].label, rh: api.opts().rh, now: api.plNow() };
      const go = api.plGo();
      return { avant, go, apres: api.plNow(), rh: window.__gm.pls.rh() };
    });
    expect(r.avant.src0).toContain('Playlist : Dimanche');
    expect(r.avant.rh).toMatch(/^pl:/);
    expect(r.avant.now.i).toBe(0);
    expect(r.avant.now.next).not.toBe('');
    expect(r.go).toBe(true);
    expect(r.apres.i).toBe(1);
    expect(r.apres.next).toBe('');
    expect(r.rh).toBe(ordre[1]);
  });
});

test('aperçu VR : le menu passe au-dessus de la grosse caisse, et « Suivant › » enchaîne la playlist', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('index.html?vr=apercu');
  const ordre = await creer(page);
  await page.locator('#gmVR').click();
  await expect(page.locator('#vrPreview')).toBeVisible();
  const vr = () => page.evaluate(() => window.__gm.vr().debug());
  await expect.poll(async () => (await vr()).placed).toBe(true);
  expect((await vr()).menuKickGap).toBeGreaterThan(0);
  await page.evaluate(() => { const api = window.__gm.vrApi; api.set('rh', api.sources()[0].id); });
  await page.evaluate(() => window.__gm.vr().menuPress('play'));
  await page.waitForFunction(() => window.__gm.on());
  await page.evaluate(() => window.__gm.pls.fin());
  await expect.poll(() => page.evaluate(() => window.__gm.vr().menuIds())).toContain('plnext');
  await page.evaluate(() => window.__gm.vr().menuPress('plnext'));
  await page.waitForFunction(() => window.__gm.on());
  expect(await page.evaluate(() => window.__gm.pls.rh())).toBe(ordre[1]);
});
