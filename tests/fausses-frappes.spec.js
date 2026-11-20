// VR : moins de fausses frappes. Un robot déplace la pointe de baguette simulée (même détection que
// les manettes) et on vérifie quels pads sonnent.
const { test, expect, rubrique } = require('./outils/base');

async function ouvrir(page) {
  await page.goto('index.html?vr=apercu');
  await rubrique(page, 'Jeux');
  await page.locator('#gmVR').click();
  await expect.poll(() => page.evaluate(() => { const v = window.__gm.vr(); return !!(v && v.debug() && v.debug().placed); })).toBe(true);
}
// chemin relatif au pad d'un couloir : [dx, dy (au-dessus de la surface), dz, ms] ; renvoie les pads frappés
async function chemin(page, lane, pts) {
  await page.evaluate(([l, p]) => window.__gm.vr().simPath(l, p), [lane, pts]);
  await page.waitForTimeout(400);
  return page.evaluate(() => window.__gm.vr().simHits());
}

test('VR : un vrai coup sonne une fois, les gestes parasites ne sonnent pas', async ({ page }) => {
  await ouvrir(page);
  // couloirs : 1 caisse claire (tchak), 2 charleston (tss), 3 tom médium, 4 tom basse, 6 tom aigu
  // un coup franc au centre de la caisse claire : une frappe
  expect(await chemin(page, 1, [[0, 0.05, 0, 0], [0, -0.03, 0, 20], [0, 0.1, 0, 80]])).toEqual(['tchak']);

  // la baguette tremble juste sous la surface puis remonte de 1 cm : pas de deuxième coup
  expect(await chemin(page, 1, [[0, 0.05, 0, 0], [0, -0.02, 0, 20], [0, 0.01, 0, 40], [0, -0.02, 0, 60], [0, 0.1, 0, 120]])).toEqual(['tchak']);

  // la baguette glisse presque à plat à travers le tom aigu (de côté, à peine en descendant) : rien
  expect(await chemin(page, 6, [[-0.1, 0.01, 0, 0], [0.1, -0.01, 0, 40], [0.1, 0.2, 0, 140]])).toEqual([]);

  // un coup qui traverse le tom aigu puis descend jusqu'à la caisse claire : un seul pad, le tom aigu
  const tim = await page.evaluate(() => window.__gm.vr().padAt(6));
  const tchak = await page.evaluate(() => window.__gm.vr().padAt(1));
  const dz = tchak.z - tim.z, dx = tchak.x - tim.x;
  expect(await chemin(page, 6, [[0, 0.05, 0, 0], [dx * 0.2, -0.05, dz * 0.2, 25], [dx * 0.5, -0.17, dz * 0.5, 45], [dx * 0.5, 0.3, dz * 0.5, 140]])).toEqual(['tim']);

  // entre deux pads proches (caisse claire et charleston), le coup va au plus proche, jamais aux deux
  const tss = await page.evaluate(() => window.__gm.vr().padAt(2));
  const mx = (tss.x - tchak.x) * 0.4, mz = (tss.z - tchak.z) * 0.4;
  expect(await chemin(page, 1, [[mx, 0.2, mz, 0], [mx, -0.15, mz, 40], [mx, 0.3, mz, 140]])).toEqual(['tchak']);

  // une même baguette, deux pads en moins de 60 ms : le deuxième est ignoré ; après 60 ms il sonne
  const doum = await page.evaluate(() => window.__gm.vr().padAt(3));
  const ex = doum.x - tchak.x, ez = doum.z - tchak.z, ey = doum.y - tchak.y;
  expect(await chemin(page, 1, [[0, 0.04, 0, 0], [0, -0.02, 0, 15], [ex, ey + 0.02, ez, 30], [ex, ey - 0.03, ez, 45], [ex, ey + 0.2, ez, 120]])).toEqual(['tchak']);
  expect(await chemin(page, 1, [[0, 0.04, 0, 0], [0, -0.02, 0, 15], [ex, ey + 0.1, ez, 60], [ex, ey + 0.03, ez, 90], [ex, ey - 0.03, ez, 105], [ex, ey + 0.2, ez, 160]])).toEqual(['tchak', 'doum']);
  expect((await page.evaluate(() => window.__gm.vr().debug())).rejected).toBeGreaterThan(0);
});

test('VR : un coup entre deux pads va à celui que le chant attend', async ({ page }) => {
  test.setTimeout(60_000);
  await ouvrir(page);
  const tchak = await page.evaluate(() => window.__gm.vr().padAt(1));
  const tss = await page.evaluate(() => window.__gm.vr().padAt(2));
  // un point à 55 % du chemin de la caisse claire au charleston : un peu plus près du charleston, mais dans la zone des deux
  const dx = (tss.x - tchak.x) * 0.55, dz = (tss.z - tchak.z) * 0.55;
  const coup = () => chemin(page, 1, [[dx, 0.2, dz, 0], [dx, -0.03, dz, 30], [dx, 0.3, dz, 120]]);
  // hors partie, rien n'est attendu : le plus proche, le charleston
  expect(await coup()).toEqual(['tss']);
  // en partie, au moment d'une note de caisse claire (couloir 1) : la caisse claire
  await page.evaluate(() => { const v = window.__gm.vr(); v.menuPress('lvl:facile'); v.menuPress('tol:sansechec'); v.menuPress('play'); });
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
  // le coup doit tomber dans les 0,18 s autour d'une note de caisse claire : sur une machine chargée,
  // on réessaie avec la note suivante (au plus 4 fois)
  let rep = [];
  for (let k = 0; k < 4 && rep[0] !== 'tchak'; k++) {
    await page.evaluate(async () => {
      const g = window.__gm, n = g.notes().find((x) => x.lane === 1 && x.t > g.now() + 0.8);
      while (g.on() && g.now() < n.t - 0.22) await new Promise((f) => setTimeout(f, 2));
    });
    rep = await coup();
  }
  expect(rep).toEqual(['tchak']);
  expect((await page.evaluate(() => window.__gm.vr().debug())).swapped).toBeGreaterThan(0);
});
