// Thumb Around (MVP) : le détecteur, testé sur des trajectoires fabriquées dans la page.
// La baguette tourne dans le plan perpendiculaire à l'axe pouce-index ; le pouce est le pivot.
// Le vrai geste (mains suivies dans le casque) reste à valider sur Quest 2.
const { test, expect } = require('./outils/base');

/* Lance le détecteur sur une suite de trames : [{ dt, pinch, deg, thumbX? }]. Renvoie les résultats non nuls. */
async function joue(page, trames) {
  return page.evaluate(async (trames) => {
    const THREE = await import('./vr/three.module.min.js');
    const { ThumbAroundDetector } = await import('./vr/spin.js');
    const d = new ThumbAroundDetector();
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    let t = 0, deg = 0, thumbX = 0;
    const out = [];
    for (const f of trames) {
      t += f.dt;
      if (f.deg != null) deg = f.deg;
      if (f.thumbX != null) thumbX = f.thumbX;
      const a = (deg * Math.PI) / 180;
      const thumb = V(thumbX, 0, 0);
      const index = V(thumbX + 0.02, 0, 0);          /* l'axe pouce-index : x */
      const middle = V(thumbX, 0.1 * Math.cos(a), 0.1 * Math.sin(a)); /* la baguette, dans le plan y-z */
      const r = d.step({ t, pinch: f.pinch, thumb, index, middle });
      if (r) out.push(r);
    }
    return out;
  }, trames);
}

/* une suite : tient la baguette à 0°, la lâche, la laisse tourner de `de` degrés, puis rattrape */
function tour(de, { pas = 10, dt = 20, pinchFin = true } = {}) {
  const f = [{ dt, pinch: true, deg: 0 }, { dt, pinch: true, deg: 0 }];
  for (let a = pas; a <= de; a += pas) f.push({ dt, pinch: false, deg: a });
  f.push({ dt, pinch: pinchFin, deg: de });
  return f;
}

test('Thumb Around : un tour complet, lâché puis rattrapé, est réussi', async ({ page }) => {
  await page.goto('index.html');
  const r = await joue(page, tour(330));
  expect(r).toEqual([{ ok: true, msg: 'Bravo, tu as réussi !' }]);
});

test('Thumb Around : une rotation trop courte est dite incomplète', async ({ page }) => {
  await page.goto('index.html');
  const r = await joue(page, tour(200));
  expect(r).toEqual([{ ok: false, msg: 'La rotation est incomplète.' }]);
});

test('Thumb Around : le pouce qui bouge n\'est plus le pivot', async ({ page }) => {
  await page.goto('index.html');
  const f = tour(330);
  f[5] = { ...f[5], thumbX: 0.05 };          /* le pouce se déplace de 5 cm pendant le tour */
  f[6] = { ...f[6], thumbX: 0.05 };
  const r = await joue(page, f);
  expect(r[0]).toEqual({ ok: false, msg: 'Garde ton pouce comme pivot.' });
});

test('Thumb Around : sans lâcher la pince, pas de tour compté : on demande le rattrapage', async ({ page }) => {
  await page.goto('index.html');
  const f = [];
  for (let a = 0; a <= 400; a += 10) f.push({ dt: 100, pinch: true, deg: a });
  const r = await joue(page, f);
  expect(r).toEqual([{ ok: false, msg: 'Anticipe le rattrapage.' }]);
});

test('Thumb Around : une baguette repliée (pince serrée) ne démarre pas le tour', async ({ page }) => {
  await page.goto('index.html');
  const f = [];
  for (let a = 0; a <= 360; a += 10) f.push({ dt: 20, pinch: a > 0 ? false : true, deg: 0 });
  const r = await joue(page, f);
  expect(r).toEqual([]);
});
