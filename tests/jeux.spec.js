// Jeux : Couloirs, Rebonds, Orbite et Écoute puis rejoue, joués par un robot qui lit la partition.
const { test, expect, rubrique } = require('./outils/base');
const { fichierChant } = require('./outils/chant');

/** Lance une partie courte et rapide : 16 mesures à 200 BPM, soit moins de 20 s. */
async function lancer(page, jeu, notes = 'Peu', commande = 'Frapper', tolerance = 'Normal') {
  await rubrique(page, 'Jeux');
  await page.locator(`#gmGames [data-v="${jeu}"]`).click();
  await page.locator('#gmLv').getByRole('button', { name: notes }).click();
  await page.locator('#gmTol').getByRole('button', { name: tolerance }).click();
  if (jeu === 'rebonds') await page.locator('#gmCtl').getByRole('button', { name: commande }).click();
  for (let i = 0; i < 25; i++) await page.locator('#gmUp').click();
  await expect(page.locator('#gmBpm')).toHaveText('215 BPM');
  await page.locator('#gmGo').click();
  await expect(page.locator('#gm')).toBeVisible();
}

/** Tape chaque note à son instant, au centre de sa colonne ; `jusqua` : s'arrêter à cet instant de la partie. */
async function jouerParfait(page, jusqua = Infinity) {
  return page.evaluate(async (fin) => {
    const cv = document.querySelector('#gmCv');
    const r = cv.getBoundingClientRect();
    const notes = window.__gm.notes();
    const larg = r.width / window.__gm.voies();
    for (const note of notes) {
      if (note.t > fin) break;
      if (note.t < window.__gm.debut()) continue;
      while (window.__gm.on() && window.__gm.now() < note.t) await new Promise((f) => setTimeout(f, 2));
      if (!window.__gm.on()) break;
      cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + larg * (note.lane + 0.5), clientY: r.top + 300 }));
    }
    return notes.length;
  }, jusqua);
}

test.describe('Chants importés', () => {
  test('importer, jouer avec le son du chant, retrouver après rechargement, retirer', async ({ page }) => {
    test.setTimeout(60_000);
    await rubrique(page, 'Jeux');
    await page.locator('#gmFile').setInputFiles(fichierChant());
    await expect(page.locator('#gmMsg')).toContainText('1 chant importé');
    const puce = page.locator('#gmCh [data-v="chant:essai"]');
    await expect(puce).toHaveText('Mon <b>chant</b>');
    await expect(puce).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#gmTempoRow')).toBeHidden();

    await page.locator('#gmLv').getByRole('button', { name: 'Beaucoup' }).click();
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible();
    await jouerParfait(page);
    await expect(page.locator('#mnRes')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#mnRes h3')).toContainText('Mon <b>chant</b>');
    expect(parseInt((await page.locator('#mnRes').textContent()).match(/(\d+) %/)[1], 10)).toBeGreaterThanOrEqual(80);
    await page.locator('#gmResBack').click();

    await page.reload();
    await rubrique(page, 'Jeux');
    await expect(page.locator('#gmCh [data-v="chant:essai"]')).toHaveCount(1);
    await page.locator('#gmCh [data-v="chant:essai"]').click();
    await page.locator('#gmDel').click();
    await expect(page.locator('#gmCh [data-v="chant:essai"]')).toHaveCount(0);
    await expect(page.locator('#gmRh [data-v="rock"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#gmTempoRow')).toBeVisible();
  });

  test('une archive .zip importe tous ses chants d\'un coup', async ({ page }) => {
    await rubrique(page, 'Jeux');
    const un = fichierChant('Un').buffer;
    const deux = Buffer.from(un.toString('latin1').replace('"id":"essai"', '"id":"essa2"').replace('"title":"Un"', '"title":"Du"'), 'latin1');
    const entrees = [['a.poumtchak', un], ['b.poumtchak', deux]];
    const locaux = [], centre = [];
    let pos = 0;
    for (const [nom, data] of entrees) {
      const n = Buffer.from(nom);
      const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(n.length, 26);
      l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22);
      const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
      locaux.push(l, n, data); centre.push(c, n);
      pos += 30 + n.length + data.length;
    }
    const cd = Buffer.concat(centre);
    const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(2, 8); fin.writeUInt16LE(2, 10); fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(pos, 16);
    await page.locator('#gmFile').setInputFiles({ name: 'chants.zip', mimeType: 'application/zip', buffer: Buffer.concat([...locaux, cd, fin]) });
    await expect(page.locator('#gmMsg')).toContainText('2 chants importés');
    await expect(page.locator('#gmCh .chip')).toHaveCount(2);
  });

  test('un fichier qui n\'est pas un chant est refusé', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await page.locator('#gmFile').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('pas un chant du tout') });
    await expect(page.locator('#gmMsg')).toContainText('Ce n\'est pas un fichier de chant');
    await expect(page.locator('#gmCh [data-v^="chant:"]')).toHaveCount(0);
  });
});

test.describe('Jeux', () => {
  test('la rubrique propose quatre jeux, et le choix est gardé', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await expect(page.locator('.gm-game')).toHaveCount(4);
    await page.locator('#gmGames [data-v="rebonds"]').click();
    await page.locator('#gmRh [data-v="funk"]').click();
    await page.reload();
    await rubrique(page, 'Jeux');
    await expect(page.locator('#gmGames [data-v="rebonds"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#gmRh [data-v="funk"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('« Mon rythme » joue la grille de la rubrique Rythme', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await page.locator('#gmRh [data-v="mine"]').click();
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible();
    expect((await page.evaluate(() => window.__gm.notes())).length).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
  });

  test('« Mon rythme » vide : on explique au lieu de lancer une partie muette', async ({ page }) => {
    await page.getByRole('button', { name: 'Vider cette mesure' }).click();
    await rubrique(page, 'Jeux');
    await page.locator('#gmRh [data-v="mine"]').click();
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeHidden();
    await expect(page.locator('#gmMsg')).toContainText('Écris d\'abord un rythme');
  });

  test('Couloirs : un robot juste finit au-dessus de 80 %, avec un bilan et un record', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'couloirs');
    await jouerParfait(page);
    await expect(page.locator('#mnRes')).toBeVisible({ timeout: 8000 });
    const pct = parseInt((await page.locator('#mnRes').textContent()).match(/(\d+) %/)[1], 10);
    expect(pct).toBeGreaterThanOrEqual(80);
    await page.locator('#gmResBack').click();
    await expect(page.locator('#gmGames [data-v="couloirs"] small')).toContainText('Record');
  });

  test('Couloirs : marteler ne paie pas', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'couloirs');
    await page.evaluate(async () => {
      const cv = document.querySelector('#gmCv');
      const r = cv.getBoundingClientRect();
      while (window.__gm.on()) {
        for (let k = 0; k < 4; k++) cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + r.width * (k + 0.5) / 4, clientY: r.top + 300 }));
        await new Promise((f) => setTimeout(f, 30));
      }
    });
    await expect(page.locator('#mnRes')).toBeVisible({ timeout: 8000 });
    const pct = parseInt((await page.locator('#mnRes').textContent()).match(/(\d+) %/)[1], 10);
    expect(pct).toBeLessThan(30);
  });

  test('Rebonds : un robot juste garde ses vies', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'rebonds');
    await jouerParfait(page);
    await expect(page.locator('#mnRes')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#mnRes')).not.toContainText('La balle est tombée');
  });

  test('Rebonds en mode Glisser : la balle suit le doigt et les tuiles sonnent toutes seules', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'rebonds', 'Peu', 'Glisser');
    const pts = await page.evaluate(async () => {
      const cv = document.querySelector('#gmCv');
      const r = cv.getBoundingClientRect();
      const notes = window.__gm.notes();
      for (const n of notes) {
        cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'touch', clientX: r.left + r.width * (n.lane ? 0.67 : 0.33), clientY: 400 }));
        while (window.__gm.on() && window.__gm.now() < n.t + 0.03) await new Promise((f) => setTimeout(f, 3));
        if (!window.__gm.on()) break;
      }
      return window.__gm.sc().miss;
    });
    expect(pts).toBe(0);
    await expect(page.locator('#mnRes')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#mnRes')).toContainText('Glisser');
  });

  test('Rebonds en mode Incliner : le capteur déplace la balle', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'rebonds', 'Peu', 'Incliner');
    const rates = await page.evaluate(async () => {
      const incline = (g) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { gamma: g, beta: 0, alpha: 0 }));
      incline(0);
      for (const n of window.__gm.notes()) {
        incline(n.lane ? 9 : -9);
        while (window.__gm.on() && window.__gm.now() < n.t + 0.03) await new Promise((f) => setTimeout(f, 3));
        if (!window.__gm.on()) break;
      }
      return window.__gm.sc().miss;
    });
    expect(rates).toBe(0);
  });

  test('Rebonds : sans jouer, la jauge se vide et la balle tombe', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'rebonds');
    await expect(page.locator('#gmGauge')).toHaveAttribute('aria-valuenow', '100');
    await expect(page.locator('#mnRes')).toContainText('La balle est tombée', { timeout: 20_000 });
    await expect(page.locator('#gm')).toBeHidden();
  });

  test('Couloirs : sans jouer, la jauge se vide et la partie s\'arrête', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'couloirs');
    await expect(page.locator('#mnRes')).toContainText('la jauge d\'erreurs est vide', { timeout: 25_000 });
    await expect(page.locator('#gm')).toBeHidden();
  });

  test('la tolérance change la jauge, pas le nombre de notes', async ({ page }) => {
    test.setTimeout(60_000);
    await rubrique(page, 'Jeux');
    await page.locator('#gmGames [data-v="couloirs"]').click();
    await page.locator('#gmLv').getByRole('button', { name: 'Moyen' }).click();
    for (let i = 0; i < 25; i++) await page.locator('#gmUp').click();
    const essai = async (tol) => {
      await page.locator('#gmTol').getByRole('button', { name: tol }).click();
      await page.locator('#gmGo').click();
      await expect(page.locator('#gm')).toBeVisible();
      const n = await page.evaluate(() => window.__gm.notes().length);
      await page.waitForFunction(() => window.__gm.sc().miss >= 2, null, { timeout: 15_000 });
      const g = await page.evaluate(() => window.__gm.gauge());
      await page.locator('#gmQuit').click();
      return { n, g };
    };
    const indulgent = await essai('Indulgent');
    const strict = await essai('Strict');
    expect(indulgent.n).toBe(strict.n);
    expect(indulgent.g).toBeGreaterThan(0.7);
    expect(strict.g).toBeLessThan(0.7);
  });

  test('Quitter revient au choix, sans bilan, et une autre rubrique arrête la partie', async ({ page }) => {
    await lancer(page, 'couloirs');
    await page.locator('#gmQuit').click();
    await expect(page.locator('#gm')).toBeHidden();
    await expect(page.locator('#mnRes')).toBeHidden();
    await expect(page.locator('#p-jeux')).toBeVisible();
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#gm')).toBeHidden();
  });

  test('le clavier joue, et la barre d\'espace ne lance pas la lecture', async ({ page }) => {
    await lancer(page, 'couloirs');
    await page.keyboard.press('d');
    await page.keyboard.press('Space');
    expect((await page.evaluate(() => window.__gm.sc())).extra).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#gm')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

test.describe('Reprise de partie', () => {
  const mesure = 4 * 60 / 215;

  test('Quitter garde le point de contrôle, même après rechargement, et la reprise repart de là', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'couloirs');
    await jouerParfait(page, mesure * 5);
    const points = await page.evaluate(() => window.__gm.sc().pts);
    expect(points).toBeGreaterThan(0);
    await page.locator('#gmQuit').click();
    await expect(page.locator('#gmResume')).toContainText('mesure 5');
    await expect(page.locator('#gmGo')).toHaveText('Recommencer du début');

    await page.reload();
    await rubrique(page, 'Jeux');
    await expect(page.locator('#gmResume')).toContainText('mesure 5');
    await page.locator('#gmResume').click();
    await expect(page.locator('#gm')).toBeVisible();
    const etat = await page.evaluate(() => ({ debut: window.__gm.debut(), pts: window.__gm.sc().pts, reste: window.__gm.reste(), tout: window.__gm.notes().length }));
    expect(etat.debut).toBeCloseTo(mesure * 4, 2);
    expect(etat.pts).toBeGreaterThan(0);
    expect(etat.pts).toBeLessThanOrEqual(points);
    expect(etat.reste).toBeLessThan(etat.tout);

    await jouerParfait(page);
    await expect(page.locator('#mnRes')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#mnRes')).toContainText('Partie reprise à la mesure 5');
    await page.locator('#gmResBack').click();
    await expect(page.locator('#gmResume')).toBeHidden();
    await expect(page.locator('#gmGo')).toHaveText('Jouer');
  });

  test('jauge vide : le bilan propose de reprendre, avec une jauge pleine', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'couloirs');
    await jouerParfait(page, mesure * 5);
    await expect(page.locator('#gmResCk')).toContainText('mesure 5', { timeout: 20_000 });
    await page.locator('#gmResCk').click();
    await expect(page.locator('#gm')).toBeVisible();
    await expect(page.locator('#gmGauge')).toHaveAttribute('aria-valuenow', '100');
    await page.keyboard.press('Escape');
  });

  test('la reprise dépend du jeu et du nombre de notes', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'couloirs');
    await jouerParfait(page, mesure * 5);
    await page.locator('#gmQuit').click();
    await expect(page.locator('#gmResume')).toBeVisible();
    await page.locator('#gmLv').getByRole('button', { name: 'Moyen' }).click();
    await expect(page.locator('#gmResume')).toBeHidden();
    await page.locator('#gmLv').getByRole('button', { name: 'Peu' }).click();
    await expect(page.locator('#gmResume')).toBeVisible();
    await page.locator('#gmGames [data-v="rebonds"]').click();
    await expect(page.locator('#gmResume')).toBeHidden();
  });

  test('un point de contrôle abîmé est ignoré', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('poumtchak.jeux.reprises', JSON.stringify({ 'couloirs|rock|facile': { at: 'x', sc: null } })));
    await page.reload();
    await rubrique(page, 'Jeux');
    await expect(page.locator('#gmResume')).toBeHidden();
  });
});

test.describe('Orbite', () => {
  test('le nombre de notes règle les lunes : temps, croches, jamais trop serré', async ({ page }) => {
    await lancer(page, 'orbite');
    const compte = async (notes) => {
      await page.locator('#gmLv').getByRole('button', { name: notes }).click();
      await page.locator('#gmGo').click();
      const n = await page.evaluate(() => window.__gm.notes().length);
      await page.keyboard.press('Escape');
      return n;
    };
    await page.keyboard.press('Escape');
    expect(await compte('Peu')).toBe(64);
    expect(await compte('Moyen')).toBe(128);
    expect(await compte('Beaucoup')).toBe(128); // 215 BPM : des doubles seraient injouables
    await page.locator('#gmDown').click();
    for (let i = 0; i < 33; i++) await page.locator('#gmDown').click();
    await expect(page.locator('#gmBpm')).toHaveText('45 BPM');
    await page.locator('#gmGo').click();
    expect(await page.evaluate(() => window.__gm.notes().length)).toBe(256);
    await page.keyboard.press('Escape');
  });

  test('un robot juste finit au-dessus de 80 %, à un seul bouton', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'orbite');
    await jouerParfait(page);
    await expect(page.locator('#mnRes')).toBeVisible({ timeout: 8000 });
    expect(parseInt((await page.locator('#mnRes').textContent()).match(/(\d+) %/)[1], 10)).toBeGreaterThanOrEqual(80);
    await expect(page.locator('#mnRes h3')).toContainText('Orbite');
  });

  test('marteler ne paie pas, et la barre d\'espace joue', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'orbite');
    await page.keyboard.press('Space');
    await page.evaluate(async () => {
      const cv = document.querySelector('#gmCv');
      const r = cv.getBoundingClientRect();
      while (window.__gm.on()) {
        cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + 50, clientY: r.top + 300 }));
        await new Promise((f) => setTimeout(f, 25));
      }
    });
    await expect(page.locator('#mnRes')).toBeVisible({ timeout: 8000 });
    expect(parseInt((await page.locator('#mnRes').textContent()).match(/(\d+) %/)[1], 10)).toBeLessThan(30);
  });

  test('sur un chant, le point suit les mesures du chant', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await page.locator('#gmFile').setInputFiles(fichierChant());
    await expect(page.locator('#gmMsg')).toContainText('1 chant importé');
    await page.locator('#gmGames [data-v="orbite"]').click();
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible();
    const ts = await page.evaluate(() => window.__gm.notes().map((n) => n.t));
    expect(ts[0]).toBeCloseTo(2, 3);
    expect(ts[1]).toBeCloseTo(2.5, 3);
    await page.keyboard.press('Escape');
  });
});

test.describe('Écoute puis rejoue', () => {
  test('le métronome se coupe sur certaines mesures, sauf si on le garde', async ({ page }) => {
    const muets = async () => {
      await page.locator('#gmGo').click();
      await expect(page.locator('#gm')).toBeVisible();
      const r = await page.evaluate(() => {
        const c = window.__gm.chart();
        return { muets: c.beats.filter((b) => b.mute).length, tours: c.rounds.map((x) => x.passes.map((p) => p.cuts.some(Boolean))) };
      });
      await page.keyboard.press('Escape');
      return r;
    };
    await rubrique(page, 'Jeux');
    await page.locator('#gmGames [data-v="ecoute"]').click();
    await expect(page.locator('#gmClickRow')).toBeVisible();
    const coupe = await muets();
    expect(coupe.muets).toBeGreaterThan(0);
    expect(coupe.tours[0]).toEqual([false, false]);
    expect(coupe.tours[1]).toEqual([false, false]);
    expect(coupe.tours[2]).toEqual([false, false]);
    expect(coupe.tours[3]).toEqual([false, true]);
    await page.locator('#gmClick').getByRole('button', { name: 'Toujours là' }).click();
    expect((await muets()).muets).toBe(0);
  });

  test('taper pendant l\'écoute ne coûte rien, et les notes ne viennent qu\'après', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await page.locator('#gmGames [data-v="ecoute"]').click();
    for (let i = 0; i < 25; i++) await page.locator('#gmUp').click();
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible();
    const r = await page.evaluate(async () => {
      const cv = document.querySelector('#gmCv');
      const b = cv.getBoundingClientRect();
      const c = window.__gm.chart();
      while (window.__gm.now() < c.rounds[0].listen + 0.2) await new Promise((f) => setTimeout(f, 10));
      for (let i = 0; i < 5; i++) { cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: b.left + 10, clientY: b.top + 300 })); await new Promise((f) => setTimeout(f, 30)); }
      return { extra: window.__gm.sc().extra, avant: c.notes.filter((n) => n.t < c.rounds[0].play).length };
    });
    expect(r.extra).toBe(0);
    expect(r.avant).toBe(0);
    await page.keyboard.press('Escape');
  });

  test('un robot qui rejoue juste finit au-dessus de 80 %, et chaque manche est un point de contrôle', async ({ page }) => {
    test.setTimeout(100_000);
    await rubrique(page, 'Jeux');
    await page.locator('#gmGames [data-v="ecoute"]').click();
    for (let i = 0; i < 25; i++) await page.locator('#gmUp').click();
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible();
    const fin = await page.evaluate(() => window.__gm.chart().rounds[1].end + 0.5);
    await jouerParfait(page, fin);
    await page.waitForFunction((t) => window.__gm.now() > t, fin);
    await page.locator('#gmQuit').click();
    await expect(page.locator('#gmResume')).toContainText('manche');
    await page.locator('#gmResume').click();
    await expect(page.locator('#gm')).toBeVisible();
    await jouerParfait(page);
    await expect(page.locator('#mnRes')).toBeVisible({ timeout: 8000 });
    expect(parseInt((await page.locator('#mnRes').textContent()).match(/(\d+) %/)[1], 10)).toBeGreaterThanOrEqual(80);
  });

  test('sur un chant, on entend bien un morceau du chant', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await page.locator('#gmFile').setInputFiles(fichierChant());
    await expect(page.locator('#gmMsg')).toContainText('1 chant importé');
    await page.locator('#gmGames [data-v="ecoute"]').click();
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible();
    await page.waitForFunction(() => window.__gm.sons() > 0, null, { timeout: 8000 });
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__gm.sons())).toBe(0);
  });
});

test.describe('Comment jouer', () => {
  test('chaque jeu a son explication, accessible depuis le choix', async ({ page }) => {
    await rubrique(page, 'Jeux');
    for (const [jeu, mot] of [['couloirs', 'ligne blanche'], ['rebonds', 'tuile'], ['orbite', 'lune'], ['ecoute', 'rond creux']]) {
      await page.locator(`#gmGames [data-v="${jeu}"]`).click();
      await page.locator('#gmHow').click();
      await expect(page.locator('#mnRes')).toContainText(mot);
      await page.locator('#gmHowOk').click();
      await expect(page.locator('#mnRes')).toBeHidden();
    }
  });

  test('la première partie de chaque jeu commence par l\'explication, une seule fois', async ({ page }) => {
    await page.evaluate(() => { window.__howForce = true; });
    await rubrique(page, 'Jeux');
    await page.locator('#gmGames [data-v="orbite"]').click();
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeHidden();
    await page.locator('#gmHowOk').click();
    await expect(page.locator('#gm')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#gmGo').click();
    await expect(page.locator('#gm')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

test.describe('Écoute puis rejoue, niveaux', () => {
  test('Peu : une seule zone, n\'importe quel pad compte ; Moyen : deux zones', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await page.locator('#gmGames [data-v="ecoute"]').click();
    await page.locator('#gmGo').click();
    expect(await page.evaluate(() => window.__gm.voies())).toBe(1);
    await page.keyboard.press('Escape');
    await page.locator('#gmLv').getByRole('button', { name: 'Moyen' }).click();
    await page.locator('#gmGo').click();
    expect(await page.evaluate(() => window.__gm.voies())).toBe(2);
    await page.keyboard.press('Escape');
  });
});
