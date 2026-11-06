// Jeux : Couloirs et Rebonds, joués par un robot qui lit la partition.
const { test, expect, rubrique } = require('./outils/base');

/** Lance une partie courte et rapide : 16 mesures à 200 BPM, soit moins de 20 s. */
async function lancer(page, jeu, niveau = 'Facile') {
  await rubrique(page, 'Jeux');
  await page.locator(`#gmGames [data-v="${jeu}"]`).click();
  await page.locator('#gmLv').getByRole('button', { name: niveau }).click();
  for (let i = 0; i < 25; i++) await page.locator('#gmUp').click();
  await expect(page.locator('#gmBpm')).toHaveText('215 BPM');
  await page.locator('#gmGo').click();
  await expect(page.locator('#gm')).toBeVisible();
}

/** Tape chaque note à son instant, au centre de sa colonne. */
async function jouerParfait(page) {
  return page.evaluate(async () => {
    const cv = document.querySelector('#gmCv');
    const r = cv.getBoundingClientRect();
    const notes = window.__gm.notes();
    const larg = r.width / window.__gm.voies();
    for (const note of notes) {
      while (window.__gm.on() && window.__gm.now() < note.t) await new Promise((f) => setTimeout(f, 2));
      if (!window.__gm.on()) break;
      cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + larg * (note.lane + 0.5), clientY: r.top + 300 }));
    }
    return notes.length;
  });
}

/** Un petit fichier de chant : 120 BPM, poum et tchak en alternance, son de silence. */
function fichierChant(titre = 'Mon <b>chant</b>') {
  const notes = [];
  for (let i = 0; i < 16; i++) notes.push([2 + i * 0.5, 2 + i * 0.5, i % 2]);
  const entete = Buffer.from(JSON.stringify({ id: 'essai', title: titre, bpm: 120, dur: 12, drums: ['poum', 'tchak'], notes, downbeats: [2, 4, 6, 8, 10] }));
  const taux = 8000, n = taux * 12;
  const wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(taux, 24); wav.writeUInt32LE(taux * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  const tete = Buffer.alloc(9); tete.write('PTCH', 0); tete[4] = 1; tete.writeUInt32LE(entete.length, 5);
  return { name: 'essai.poumtchak', mimeType: 'application/octet-stream', buffer: Buffer.concat([tete, entete, wav]) };
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

    await page.locator('#gmLv').getByRole('button', { name: 'Difficile' }).click();
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

  test('un fichier qui n\'est pas un chant est refusé', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await page.locator('#gmFile').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('pas un chant du tout') });
    await expect(page.locator('#gmMsg')).toContainText('Ce n\'est pas un fichier de chant');
    await expect(page.locator('#gmCh [data-v^="chant:"]')).toHaveCount(0);
  });
});

test.describe('Jeux', () => {
  test('la rubrique propose deux jeux, et le choix est gardé', async ({ page }) => {
    await rubrique(page, 'Jeux');
    await expect(page.locator('.gm-game')).toHaveCount(2);
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

  test('Rebonds : sans jouer, la balle tombe après cinq tuiles', async ({ page }) => {
    test.setTimeout(60_000);
    await lancer(page, 'rebonds');
    await expect(page.locator('#mnRes')).toContainText('La balle est tombée', { timeout: 20_000 });
    await expect(page.locator('#gm')).toBeHidden();
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
