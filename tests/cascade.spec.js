// Le mode « Cascade » : des barres colorées tombent dans un couloir par fût,
// vers une ligne de frappe, avec un pad sous chaque couloir.
const { test, expect, rubrique } = require('./outils/base');

async function ouvrir(page, { defi = false, rythme } = {}) {
  await rubrique(page, 'Pratique');
  await page.getByRole('button', { name: defi ? 'Défi : écoute, puis joue' : "Jouer sur l'écran" }).first().click();
  await expect(page.locator('#kitView')).toBeVisible();
  if (rythme) await page.locator('#kvPat').selectOption(rythme);
  await page.locator('#kvLayout').getByRole('button', { name: 'Cascade' }).click();
  await expect(page.locator('#kvFall')).toBeVisible();
}


/** Les fûts visibles, de gauche à droite (l'ordre du DOM n'est pas l'ordre à l'écran). */
const voiesVisibles = (page) => page.locator('.pad:not([hidden])').evaluateAll((p) =>
  p.map((x) => ({ id: x.dataset.id, x: x.getBoundingClientRect().left })).sort((a, b) => a.x - b.x).map((v) => v.id));

/** Ce que la cascade a dessiné : une analyse des pixels, voie par voie. */
function analyser(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('#kvFall');
    const dpr = cv.width / cv.clientWidth;
    const ctx = cv.getContext('2d');
    const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const cr = cv.getBoundingClientRect();
    const voies = [...document.querySelectorAll('.pad:not([hidden])')].map((p) => {
      const r = p.getBoundingClientRect();
      return { id: p.dataset.id, x0: Math.round((r.left - cr.left) * dpr), x1: Math.round((r.right - cr.left) * dpr) };
    });
    const hitY = Math.round((cv.clientHeight - 22) * dpr);
    const pixel = (x, y) => { const i = (y * cv.width + x) * 4; return [img[i], img[i + 1], img[i + 2], img[i + 3]]; };
    const resolve = (couleur) => {
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const g = c.getContext('2d'); g.fillStyle = couleur; g.fillRect(0, 0, 1, 1);
      return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const css = (nom) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
    return voies.map((v) => {
      let opaques = 0, proches = 0, ok = 0, sombres = 0;
      const freq = new Map();
      const attendue = resolve(css('--c-' + v.id)), vert = resolve(css('--ok'));
      for (let y = 0; y < cv.height; y++) {
        for (let x = v.x0; x < v.x1; x++) {
          const [r, g, b, a] = pixel(x, y);
          if (a > 200) {
            opaques++;
            const k = r + ',' + g + ',' + b;
            freq.set(k, (freq.get(k) || 0) + 1);
            if (Math.abs(y - hitY) <= 9 * dpr) proches++;
            if (Math.abs(r - vert[0]) < 40 && Math.abs(g - vert[1]) < 40 && Math.abs(b - vert[2]) < 40) ok++;
          }
          if (a > 100 && a < 200 && r < 90 && g < 90 && b < 90 && y > cv.height * 0.12 && y < cv.height * 0.6) sombres++;
        }
      }
      const mode = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
      const couleur = mode ? mode[0].split(',').map(Number) : null;
      const ecart = couleur ? Math.max(...couleur.map((c, i) => Math.abs(c - attendue[i]))) : 999;
      // lignes de la voie occupées par des barres pleines (pour mesurer la chute)
      const lignes = [];
      for (let y = 0; y < hitY; y++) {
        let n = 0;
        for (let x = v.x0; x < v.x1; x++) if (pixel(x, y)[3] > 200) n++;
        lignes.push(n > (v.x1 - v.x0) * 0.3 ? 1 : 0);
      }
      return { id: v.id, opaques, proches, ok, sombres, ecart, lignes, x0: v.x0, x1: v.x1 };
    });
  });
}


/** Pixels d'une couleur du thème dans un couloir, entre deux hauteurs (en px CSS ; négatif = depuis la ligne de frappe). */
const compter = (page, id, variable, de, a) => page.evaluate(([id, variable, de, a]) => {
  const cv = document.querySelector('#kvFall'), dpr = cv.width / cv.clientWidth;
  const pad = document.querySelector(`.pad[data-id="${id}"]`).getBoundingClientRect(), cr = cv.getBoundingClientRect();
  const x0 = Math.round((pad.left - cr.left) * dpr), x1 = Math.round((pad.right - cr.left) * dpr);
  const hit = cv.clientHeight - 22;
  const y0 = Math.max(0, Math.round((hit + de) * dpr)), y1 = Math.min(cv.height, Math.round((hit + a) * dpr));
  const t = document.createElement('canvas'); t.width = t.height = 1;
  const g = t.getContext('2d'); g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(variable).trim(); g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  const d = cv.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 120 && Math.abs(d[i] - r) < 45 && Math.abs(d[i + 1] - gg) < 45 && Math.abs(d[i + 2] - b) < 45) n++;
  return n;
}, [id, variable, de, a]);

const enregistrer = (page, ms) => page.evaluate((ms) => new Promise((fin) => {
  const traces = [];
  const iv = setInterval(() => traces.push({
    t: performance.now(),
    hint: document.querySelector('#kvHint').textContent,
    verdict: document.querySelector('#kvVerdict').textContent,
    rouge: document.querySelectorAll('.pad.fb-bad').length,
  }), 20);
  setTimeout(() => { clearInterval(iv); fin(traces); }, ms);
}), ms);

test.describe('Cascade : mise en place', () => {
  test('un couloir et un pad par fût du rythme, alignés, dans l\'ordre grave → aigu', async ({ page }) => {
    await ouvrir(page);
    const ids = await voiesVisibles(page);
    expect(ids).toEqual(['poum', 'tchak', 'tss']);
    const cv = await page.locator('#kvFall').boundingBox();
    const n = ids.length, gap = 7, cw = (cv.width - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const b = await page.locator(`.pad[data-id="${ids[i]}"]`).boundingBox();
      expect(Math.abs(b.x - (cv.x + i * (cw + gap))), `pad ${ids[i]}`).toBeLessThan(2);
      expect(Math.abs(b.width - cw), `largeur ${ids[i]}`).toBeLessThan(2);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    const pad = await page.locator('.pad[data-id="poum"]').boundingBox();
    expect(pad.y, 'les pads sont sous la cascade').toBeGreaterThanOrEqual(cv.y + cv.height - 1);
  });

  for (const rythme of ['rock', 'funk', 'disco', 'bossa', 'valse', '68']) {
    test(`les couloirs suivent les fûts du rythme (${rythme})`, async ({ page }) => {
      await ouvrir(page, { rythme });
      const voies = await page.locator('.pad:not([hidden])').count();
      expect(voies).toBeGreaterThanOrEqual(2);
      await expect(page.locator('#kvStaff .ks-lab span')).toHaveCount(voies);
      const ids = await voiesVisibles(page);
      const ordre = ['poum', 'toum', 'doum', 'tchak', 'tss', 'tchaa', 'psch'];
      expect(ids).toEqual(ordre.filter((x) => ids.includes(x)));
    });
  }

  test('une grille vide garde les sept couloirs, et un fût ajouté en crée un', async ({ page }) => {
    await rubrique(page, 'Rythme');
    await page.getByRole('button', { name: 'Vider cette mesure' }).click();
    await page.locator('#grid .cell[data-id="poum"][data-s="0"]').click();
    await ouvrir(page);
    await expect(page.locator('.pad:not([hidden])')).toHaveCount(1);
    await page.getByRole('button', { name: 'Fermer' }).click();
    await rubrique(page, 'Rythme');
    await page.locator('#grid .cell[data-id="psch"][data-s="4"]').click();
    await rubrique(page, 'Pratique');
    await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
    await expect(page.locator('.pad:not([hidden])')).toHaveCount(2);
  });

  test('pas de débordement, et la mise en page ne bouge pas pendant le jeu', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#play').click();
    const traces = await page.evaluate(() => new Promise((fin) => {
      const pos = new Set();
      const iv = setInterval(() => {
        const r = document.querySelector('#kvPads').getBoundingClientRect();
        pos.add(Math.round(r.top) + '/' + Math.round(r.height));
      }, 16);
      setTimeout(() => { clearInterval(iv); fin([...pos]); }, 5000);
    }));
    expect(traces).toHaveLength(1);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(debord).toBeLessThanOrEqual(0);
  });

  test('en paysage, les couloirs et les pads restent utilisables', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    await ouvrir(page);
    const cv = await page.locator('#kvFall').boundingBox();
    expect(cv.height).toBeGreaterThanOrEqual(40);
    for (const id of ['poum', 'tchak', 'tss']) {
      const b = await page.locator(`.pad[data-id="${id}"]`).boundingBox();
      expect(b.height, id).toBeGreaterThanOrEqual(44);
      expect(b.width, id).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('#play')).toBeInViewport();
  });
});

test.describe('Cascade : ce qui est dessiné', () => {
  for (const schema of ['light', 'dark']) {
    test(`chaque couloir montre ses barres, dans la couleur de son fût (${schema})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: schema });
      await ouvrir(page);
      await page.locator('#play').click();
      await page.waitForTimeout(1600);
      for (const v of await analyser(page)) {
        expect(v.opaques, `barres dans le couloir ${v.id}`).toBeGreaterThan(30);
        expect(v.ecart, `couleur du couloir ${v.id}`).toBeLessThan(45);
      }
    });
  }

  test('au repos, les couloirs sont là mais sans barres', async ({ page }) => {
    await ouvrir(page);
    for (const v of await analyser(page)) expect(v.opaques, v.id).toBe(0);
  });

  test('les barres descendent vers la ligne', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#play').click();
    await page.waitForTimeout(900);
    const a = (await analyser(page)).find((v) => v.id === 'tss');
    await page.waitForTimeout(150);
    const b = (await analyser(page)).find((v) => v.id === 'tss');
    // le décalage qui superpose le mieux l'image d'avant sur celle d'après doit être vers le bas
    let meilleur = 0, score = -1;
    for (let s = 0; s <= 60; s++) {
      let ok = 0;
      for (let y = 0; y + s < b.lignes.length && y < a.lignes.length; y++) if (a.lignes[y] && b.lignes[y + s]) ok++;
      if (ok > score) { score = ok; meilleur = s; }
    }
    expect(meilleur).toBeGreaterThan(2);
  });

  test('une barre touche la ligne au moment exact où le pad s\'allume', async ({ page }) => {
    await ouvrir(page);
    await page.evaluate(() => {
      window.__touche = [];
      const cv = document.querySelector('#kvFall');
      for (const id of ['poum', 'tchak']) {
        const pad = document.querySelector(`.pad[data-id="${id}"]`);
        new MutationObserver(() => {
          if (!pad.classList.contains('cible') || pad.__vu) return;
          pad.__vu = true;
          requestAnimationFrame(() => {
            const dpr = cv.width / cv.clientWidth, r = pad.getBoundingClientRect(), cr = cv.getBoundingClientRect();
            const x0 = Math.round((r.left - cr.left) * dpr), x1 = Math.round((r.right - cr.left) * dpr);
            const hitY = Math.round((cv.clientHeight - 22) * dpr);
            const d = cv.getContext('2d').getImageData(x0, hitY - Math.round(10 * dpr), x1 - x0, Math.round(20 * dpr)).data;
            let n = 0;
            for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++;
            window.__touche.push({ id, n });
          });
        }).observe(pad, { attributes: true, attributeFilter: ['class'] });
        new MutationObserver(() => { if (!pad.classList.contains('cible')) pad.__vu = false; }).observe(pad, { attributes: true, attributeFilter: ['class'] });
      }
    });
    await page.locator('#play').click();
    await page.waitForFunction(() => window.__touche.length >= 5, null, { timeout: 12000 });
    const mesures = await page.evaluate(() => window.__touche);
    for (const m of mesures) expect(m.n, `barre de ${m.id} sur la ligne quand le pad s'allume`).toBeGreaterThan(20);
  });

  test('en libre, rien ne s\'affiche en rouge tant qu\'on ne frappe pas', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#play').click();
    const traces = await enregistrer(page, 5000);
    expect(traces.filter((t) => t.rouge > 0 || t.verdict !== '')).toEqual([]);
  });
});

test.describe('Cascade : le toucher', () => {
  test('un doigt réel compte pour une seule frappe, sur n\'importe quel couloir', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'toucher réel : projet téléphone seulement');
    await ouvrir(page);
    await page.locator('#play').click();
    await page.waitForTimeout(700);
    const b = await page.locator('.pad[data-id="tchak"]').boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.locator('#kvScore')).toContainText(/^1 (juste|en trop|tôt ou tard)/);
    await page.waitForTimeout(500);
    await expect(page.locator('#kvScore')).toContainText(/^1 (juste|en trop|tôt ou tard)/);
    await expect(page.locator('#kvPads .fly')).toHaveCount(0, { timeout: 2000 });
  });

  test('une frappe juste fait voler des points et la barre passe au vert', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#play').click();
    await page.evaluate(() => {
      let derniere = null;
      window.__tape = setInterval(() => {
        const c = document.querySelector('#grid .cell.on.now[data-id="poum"]');
        if (derniere && !derniere.classList.contains('now')) derniere = null;
        if (c && c !== derniere) {
          derniere = c;
          document.querySelector('.pad[data-id="poum"]').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, cancelable: true, pressure: 1 }));
        }
      }, 4);
    });
    await expect(page.locator('#kvPads .fly').first()).toHaveText(/^\+\d+$/, { timeout: 6000 });
    await expect(page.locator('#kvPct b')).toHaveText(/^[1-9][\d\s  ]*$/);
    await page.waitForFunction(async () => {
      const cv = document.querySelector('#kvFall'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const g = c.getContext('2d'); g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ok').trim(); g.fillRect(0, 0, 1, 1);
      const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && Math.abs(d[i] - r) < 40 && Math.abs(d[i + 1] - gg) < 40 && Math.abs(d[i + 2] - b) < 40) n++;
      return n > 10;
    }, null, { timeout: 6000 });
  });
});

test.describe('Cascade : le défi', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'telephone', 'long : projet téléphone seulement'));

  test('rien de rouge pendant l\'écoute et le décompte, le tempo baisse si on ne joue pas', async ({ page }) => {
    await ouvrir(page, { defi: true });
    const traces = await enregistrer(page, 14500);
    let finToi = 0;
    const fautes = [];
    for (const t of traces) {
      const toi = t.hint.toUpperCase().startsWith('À TOI');
      if (toi) finToi = t.t;
      const apresTour = finToi && t.t - finToi < 750;
      if (!toi && !apresTour && (t.rouge > 0 || /oups|en trop/i.test(t.verdict))) fautes.push(t);
    }
    expect(fautes, 'du rouge hors de ton tour').toEqual([]);
    const textes = new Set(traces.map((t) => t.hint.toUpperCase()));
    expect([...textes].some((h) => h.startsWith('ÉCOUTE'))).toBe(true);
    expect([...textes].some((h) => h.startsWith('PRÉPARE'))).toBe(true);
    expect([...textes].some((h) => h.startsWith('À TOI'))).toBe(true);
    await expect(page.locator('#kvChal')).toContainText(/pas grave|presque/);
    await expect(page.locator('#bpmIn')).toHaveValue('54');
    expect((await analyser(page)).some((v) => v.opaques > 0)).toBe(true);
  });

  test('le chiffre du décompte s\'affiche dans la cascade, et nulle part ailleurs', async ({ page }) => {
    await ouvrir(page, { defi: true });
    await expect(page.locator('#kvHint')).toHaveText('Écoute le rythme…');
    const ecoute = await analyser(page);
    await expect(page.locator('#kvHint')).toHaveText('Prépare-toi…', { timeout: 9000 });
    await page.waitForTimeout(300);
    const decompte = await analyser(page);
    const somme = (l) => l.reduce((s, v) => s + v.sombres, 0);
    expect(somme(decompte)).toBeGreaterThan(150);
    expect(somme(ecoute)).toBeLessThan(40);
  });

  test('en jouant juste dans la cascade, le tempo monte et la manche est saluée', async ({ page }) => {
    await ouvrir(page, { defi: true });
    await page.evaluate(() => {
      for (const id of ['poum', 'tchak']) {
        let derniere = null;
        setInterval(() => {
          const c = document.querySelector(`#grid .cell.on.now[data-id="${id}"]`);
          if (derniere && !derniere.classList.contains('now')) derniere = null;
          if (c && c !== derniere && document.querySelector('#kvHint').textContent.startsWith('À toi')) {
            derniere = c;
            document.querySelector(`.pad[data-id="${id}"]`).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, cancelable: true, pressure: 1 }));
          }
        }, 4);
      }
    });
    await expect(page.locator('#kvChal')).toContainText('accélère', { timeout: 30000 });
    await expect(page.locator('#bpmIn')).toHaveValue('65');
    await expect(page.locator('#kvChal')).toContainText('★');
    await expect(page.locator('#kvVerdict')).toContainText(/Bravo|Bien joué|Superbe|Tu l/);
    // pas de fausse note : tout ce qui a été frappé était juste
    await expect(page.locator('#kvPct small')).toContainText('100 %');
  });
});

test.describe('Cascade : voir où on a frappé', () => {
  test('la zone de frappe est dessinée autour de la ligne', async ({ page }) => {
    await ouvrir(page);
    const opacite = (de, a) => page.evaluate(([de, a]) => {
      const cv = document.querySelector('#kvFall'), dpr = cv.width / cv.clientWidth, hit = cv.clientHeight - 22;
      const pad = document.querySelector('.pad[data-id="poum"]').getBoundingClientRect(), cr = cv.getBoundingClientRect();
      const x0 = Math.round((pad.left - cr.left) * dpr), x1 = Math.round((pad.right - cr.left) * dpr);
      const y0 = Math.round((hit + de) * dpr), y1 = Math.round((hit + a) * dpr);
      const d = cv.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) n += d[i];
      return n / (d.length / 4);
    }, [de, a]);
    const dans = await opacite(-4, 4), loin = await opacite(-120, -40);
    expect(dans, 'la zone de frappe est plus marquée que le couloir').toBeGreaterThan(loin + 15);
  });

  test('le verdict de la frappe apparaît dans le couloir, au-dessus de la ligne', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#play').click();
    await page.evaluate(() => {
      let derniere = null;
      setInterval(() => {
        const c = document.querySelector('#grid .cell.on.now[data-id="poum"]');
        if (derniere && !derniere.classList.contains('now')) derniere = null;
        if (c && c !== derniere) {
          derniere = c;
          document.querySelector('.pad[data-id="poum"]').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, cancelable: true, pressure: 1 }));
        }
      }, 4);
    });
    await page.waitForFunction(() => document.querySelector('#kvPct b')?.textContent.trim() !== '', null, { timeout: 8000 });
    let vu = 0;
    for (let i = 0; i < 60 && vu < 40; i++) {
      vu = Math.max(vu, await compter(page, 'poum', '--ok', -70, -16));
      await page.waitForTimeout(40);
    }
    expect(vu, 'texte du verdict dans le couloir').toBeGreaterThan(40);
  });

  test('en défi, une note qu\'on n\'a pas jouée passe au rouge dans le couloir', async ({ page }, info) => {
    test.skip(info.project.name !== 'telephone', 'long : projet téléphone seulement');
    await ouvrir(page, { defi: true });
    await expect(page.locator('#kvHint')).toContainText('À toi', { timeout: 20000 });
    let rouge = 0;
    for (let i = 0; i < 150 && rouge < 40; i++) {
      rouge = Math.max(rouge, await compter(page, 'poum', '--err', -90, 60), await compter(page, 'tchak', '--err', -90, 60));
      await page.waitForTimeout(60);
    }
    expect(rouge, 'repère rouge (Oups) dans un couloir').toBeGreaterThan(40);
  });
});
