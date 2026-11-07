// Parties complètes et enchaînements, comme un vrai joueur : ce sont les régressions qu'on ne voit
// qu'au bout de plusieurs dizaines de secondes, ou à la deuxième partie. Lancer aussi sur WebKit.
const { test, expect, rubrique } = require('./outils/base');

// Compte les sons créés par la page (oscillateurs et morceaux de son).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__sons = 0;
    const A = window.AudioContext || window.webkitAudioContext;
    for (const m of ['createOscillator', 'createBufferSource']) {
      const f = A.prototype[m];
      A.prototype[m] = function () { window.__sons++; return f.call(this); };
    }
  });
  await page.reload();
  await page.locator('#grid .cell').first().waitFor();
});

/** Joue juste jusqu'à la fin (ou `jusqua` secondes de jeu) : touche la bonne colonne, ou dirige la balle. */
async function robot(page, jusqua = Infinity) {
  return page.evaluate(async (fin) => {
    const cv = document.querySelector('#gmCv'), b = cv.getBoundingClientRect(), L = window.__gm.voies();
    const ns = window.__gm.notes(), hh = window.__gm.charley ? window.__gm.charley() : [];
    const ev = [...ns.map((n) => ({ t: n.t, lane: n.lane })), ...hh.map((t) => ({ t, hh: true }))].sort((x, y) => x.t - y.t);
    const P = hh.length ? window.__gm.padCharley() : null;
    let i = 0;
    while (window.__gm.on() && window.__gm.now() < fin) {
      const now = window.__gm.now();
      const next = ev.find((e, k) => k >= i && !e.hh);
      if (next) cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: b.left + b.width * (next.lane ? 0.67 : 0.33), clientY: b.top + 400 }));
      while (i < ev.length && ev[i].t <= now) {
        const e = ev[i++];
        const x = e.hh ? b.left + P.x : b.left + (b.width / L) * (e.lane + 0.5), y = e.hh ? b.top + P.y : b.top + 300;
        cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: e.hh ? 2 : 3, pointerType: 'touch', clientX: x, clientY: y }));
        cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: e.hh ? 2 : 3, pointerType: 'touch', clientX: x, clientY: y }));
      }
      await new Promise((f) => setTimeout(f, 3));
    }
    return window.__gm.on();
  }, jusqua);
}
const arret = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('poumtchak.jeux.arret') || 'null') || {}).r);
const pct = async (page) => parseInt((await page.locator('#mnRes').textContent()).match(/(\d+) %/)[1], 10);

async function choisir(page, jeu, chant, reglages = async () => {}) {
  await rubrique(page, 'Jeux');
  await page.locator(`#gmGames [data-v="${jeu}"]`).click();
  await page.locator('#gmFree').selectOption({ index: chant });
  await reglages();
}

test.describe('Parties complètes @lent', () => {
  for (const [jeu, chant, reglages, seuil] of [
    ['couloirs', 11, null, 90],
    ['rebonds', 4, async (page) => { await page.locator('#gmCtl').getByRole('button', { name: 'Glisser' }).click(); await page.locator('#gmHHBtn').click(); }, 75],
    ['orbite', 2, null, 90],
  ]) {
    test(`${jeu} : un chant libre se joue jusqu'au bout, sans coupure`, async ({ page }) => {
      test.setTimeout(150_000);
      await choisir(page, jeu, chant, reglages ? () => reglages(page) : undefined);
      await page.locator('#gmGo').click();
      await expect(page.locator('#gm')).toBeVisible({ timeout: 15_000 });
      await robot(page);
      await expect(page.locator('#mnRes')).toBeVisible({ timeout: 10_000 });
      expect(await arret(page)).toBe('fin');
      expect(await pct(page)).toBeGreaterThanOrEqual(seuil);
    });
  }

  test('Écoute puis rejoue : trois manches sur un chant, le son de l\'écoute est là à chaque manche', async ({ page }) => {
    test.setTimeout(150_000);
    await choisir(page, 'ecoute', 3);
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 15_000 });
    const sons = await page.evaluate(async () => {
      const R = window.__gm.chart().rounds.slice(0, 3), out = [];
      for (const r of R) {
        while (window.__gm.on() && window.__gm.now() < r.listen) await new Promise((f) => setTimeout(f, 5));
        const a = window.__sons;
        while (window.__gm.on() && window.__gm.now() < r.count2 - 0.05) await new Promise((f) => setTimeout(f, 5));
        out.push(window.__sons - a);
      }
      return { out, on: window.__gm.on() };
    });
    expect(sons.on).toBe(true);
    for (const n of sons.out) expect(n).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
  });
});

test.describe('Enchaînements @lent', () => {
  test('deux chants à la suite : le second se lance et dépasse 25 s de jeu', async ({ page }) => {
    test.setTimeout(150_000);
    await choisir(page, 'couloirs', 5);
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 15_000 });
    expect(await robot(page, 25)).toBe(true);
    await page.locator('#gmQuit').click();
    await page.locator('#gmFree').selectOption({ index: 7 });
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 15_000 });
    expect(await robot(page, 25)).toBe(true);
    expect(await page.evaluate(() => window.__gm.sc().perfect)).toBeGreaterThan(20);
    await page.locator('#gmQuit').click();
  });

  test('Écoute puis rejoue, deuxième partie : les frappes de l\'écoute sonnent encore', async ({ page }) => {
    test.setTimeout(120_000);
    await choisir(page, 'ecoute', 2);
    const ecoute = async () => {
      await page.locator('#gmGo').click();
      await expect(page.locator('#gm')).toBeVisible({ timeout: 15_000 });
      const n = await page.evaluate(async () => {
        const r = window.__gm.chart().rounds[0];
        while (window.__gm.now() < r.listen) await new Promise((f) => setTimeout(f, 5));
        const a = window.__sons;
        while (window.__gm.now() < r.count2 - 0.05) await new Promise((f) => setTimeout(f, 5));
        return window.__sons - a;
      });
      await page.keyboard.press('Escape');
      return n;
    };
    const premier = await ecoute();
    await page.locator('#gmFree').selectOption({ index: 6 });
    const second = await ecoute();
    expect(premier).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
  });

  test('Pratique : une boucle tourne 30 s sans s\'arrêter', async ({ page }) => {
    test.setTimeout(90_000);
    await rubrique(page, 'Pratique');
    await page.locator('#lpLen').getByRole('button', { name: '2 mesures' }).click();
    await page.locator('#lpGo').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => window.__gm.now() > 30, null, { timeout: 45_000 });
    expect(await page.evaluate(() => window.__gm.on())).toBe(true);
    await page.locator('#gmQuit').click();
  });

  test('reprise d\'un chant après 25 s : la partie reprend et continue', async ({ page }) => {
    test.setTimeout(120_000);
    await choisir(page, 'couloirs', 11);
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 15_000 });
    await robot(page, 25);
    await page.locator('#gmQuit').click();
    await expect(page.locator('#gmResume')).toBeVisible();
    await page.locator('#gmResume').click();
    await expect(page.locator('#gm')).toBeVisible({ timeout: 15_000 });
    const debut = await page.evaluate(() => window.__gm.debut());
    expect(debut).toBeGreaterThan(15);
    expect(await robot(page, debut + 22)).toBe(true);
    await page.locator('#gmQuit').click();
  });
});
