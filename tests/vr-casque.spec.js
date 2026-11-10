// Réalité virtuelle dans un casque simulé : IWER (Meta) imite un Meta Quest 2 et ses deux manettes.
// Le vrai chemin WebXR est suivi : session, position des manettes, gâchette, boutons A et B, sticks.
const fs = require('fs');
const path = require('path');
const { test, expect, rubrique } = require('./outils/base');

const IWER = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'iwer', 'build', 'iwer.min.js'), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(IWER + ';window.__dev=new IWER.XRDevice(IWER.metaQuest2);window.__dev.installRuntime();');
  await page.reload();
  await page.locator('#grid .cell').first().waitFor();
});

const vr = (page) => page.evaluate(() => window.__gm.vr().debug());
/** Appuie puis relâche un bouton d'une manette. */
async function bouton(page, main, id) {
  await page.evaluate(([m, b]) => window.__dev.controllers[m].updateButtonValue(b, 1), [main, id]);
  await page.waitForTimeout(80);
  await page.evaluate(([m, b]) => window.__dev.controllers[m].updateButtonValue(b, 0), [main, id]);
  await page.waitForTimeout(80);
}
/** Un coup de baguette de la main droite sur un pad : la pointe descend à travers sa surface. */
async function coup(page, pad) {
  await page.evaluate(async (i) => {
    const d = window.__gm.vr().debug(), c = window.__dev.controllers.right.position;
    const tip = d.tips.find((x) => x.hand === 'right').pos, P = d.padsWorld[i];
    const off = [tip[0] - c.x, tip[1] - c.y, tip[2] - c.z];
    for (const dy of [0.1, 0.06, 0.02, -0.02, -0.04, 0.12]) {
      window.__dev.controllers.right.position.set(P[0] - off[0], P[1] + dy - off[1], P[2] - off[2]);
      const f0 = window.__gm.vr().frames();
      while (window.__gm.vr().frames() < f0 + 1) await new Promise((f) => setTimeout(f, 2));
    }
  }, pad);
}

test('casque Quest 2 simulé : vérifier les pads, jouer aux manettes, régler, quitter', async ({ page }) => {
  test.setTimeout(60_000);
  await rubrique(page, 'Jeux');
  await page.locator('#gmTol').getByRole('button', { name: 'Indulgent' }).click();
  await expect(page.locator('#gmVR')).toBeVisible();
  await page.locator('#gmVR').click();
  await expect.poll(async () => (await vr(page))?.placed).toBe(true);
  expect((await vr(page)).xr).toBe(true);

  // vérification des pads : cinq coups de baguette et la gâchette pour la grosse caisse
  for (const i of [1, 2, 3, 4, 5]) await coup(page, i);
  // la gâchette vise le menu si la manette le pointe : on pointe la main gauche vers le sol
  await page.evaluate(() => window.__dev.controllers.left.quaternion.set(-0.7071, 0, 0, 0.7071));
  await page.waitForTimeout(100);
  await bouton(page, 'left', 'trigger');
  await expect.poll(async () => (await vr(page)).checked.sort()).toEqual([0, 1, 2, 3, 4, 5]);

  // stick vers le haut : la baguette se relève, et l'angle est gardé
  const angle = (await vr(page)).tilt;
  await page.evaluate(() => window.__dev.controllers.right.updateAxes('thumbstick', 0, -1));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__dev.controllers.right.updateAxes('thumbstick', 0, 0));
  await expect.poll(async () => (await vr(page)).tilt).toBeGreaterThan(angle);
  expect(+(await page.evaluate(() => localStorage.getItem('poumtchak.vr.angle')))).toBeGreaterThan(angle);

  // A : la partie démarre ; le robot joue aux baguettes (caisse claire) et à la gâchette (grosse caisse)
  await bouton(page, 'right', 'a-button');
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(true);
  const joue = await page.evaluate(async () => {
    const g = window.__gm, dev = window.__dev, d = g.vr().debug();
    const c = dev.controllers.right.position, tip = d.tips.find((x) => x.hand === 'right').pos;
    const off = [tip[0] - c.x, tip[1] - c.y, tip[2] - c.z];
    // chaque position de la manette est vue par au moins une image, même sur un ordinateur chargé
    const image = async () => { const f0 = g.vr().frames(); while (g.vr().frames() < f0 + 1) await new Promise((f) => setTimeout(f, 1)); };
    const at = (t) => new Promise((r) => { const f = () => { if (!g.on() || g.now() >= t) r(); else setTimeout(f, 1); }; f(); });
    let n = 0;
    for (const nt of g.notes()) {
      if (nt.t > 5 || !g.on()) break;
      if (nt.lane === 0) {
        await at(nt.t);
        dev.controllers.left.updateButtonValue('trigger', 1);
        setTimeout(() => dev.controllers.left.updateButtonValue('trigger', 0), 40);
      } else {
        const P = d.padsWorld[nt.lane];
        for (const [dy, dt] of [[0.09, -0.0375], [0.05, -0.0225], [0.01, -0.0075], [-0.03, 0.0075], [0.12, 0.06]]) {
          await at(nt.t + dt);
          dev.controllers.right.position.set(P[0] - off[0], P[1] + dy - off[1], P[2] - off[2]);
          await image();
        }
      }
      n++;
    }
    return n;
  });
  expect(joue).toBeGreaterThan(4);
  const sc = await page.evaluate(() => window.__gm.sc());
  // ce qu'on vérifie ici, c'est la détection : chaque coup de baguette ou de gâchette donne une
  // frappe, et une seule (notée, ou « en trop » si le navigateur chargé l'a laissée passer trop tard).
  // La justesse des instants est vérifiée par l'aperçu (tests/vr.spec.js), où ils sont exacts.
  expect(sc.perfect + sc.good + sc.approx + sc.extra).toBe(joue);
  const grossesCaisses = await page.evaluate(() => window.__gm.chart().notes.filter((n) => n.lane === 0 && n.at != null).length);
  expect(grossesCaisses).toBeGreaterThan(0);

  // B arrête la partie et revient au menu ; B encore quitte la VR
  await bouton(page, 'right', 'b-button');
  await expect.poll(() => page.evaluate(() => window.__gm.on())).toBe(false);
  await expect.poll(async () => (await vr(page)).menu).toBe(true);
  await bouton(page, 'right', 'b-button');
  await expect.poll(() => vr(page)).toBeNull();
  await expect(page.locator('#gmGames [data-v="couloirs"]')).toHaveAttribute('aria-pressed', 'true');
});
