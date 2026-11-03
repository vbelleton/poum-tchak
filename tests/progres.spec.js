// Progrès : bilan de fin de séance, historique, compétences à débloquer.
const { test, expect, rubrique } = require('./outils/base');

async function jouer(page, mains, duree) {
  await page.evaluate(async ({ mains, duree }) => {
    const fin = performance.now() + duree;
    const pads = { l: document.querySelector('#mnPadL'), r: document.querySelector('#mnPadR') };
    const boucle = async (h) => {
      while (performance.now() < fin && document.body.classList.contains('mn-live')) {
        const x = window.__mnExp(h);
        if (x != null) {
          await new Promise((r) => setTimeout(r, x * 1000));
          pads[h].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 40));
        } else await new Promise((r) => setTimeout(r, 10));
      }
    };
    await Promise.all(mains.map(boucle));
  }, { mains, duree });
}

test.describe('Progrès', () => {
  test('fin de séance : score, compétence débloquée, tempo suivant, précision, continuer', async ({ page }) => {
    test.setTimeout(60_000);
    await rubrique(page, 'Mains');
    await page.locator('#bpmIn').fill('200');
    await page.locator('#bpmIn').press('Enter');
    await page.locator('#mnColL .mn-opt[data-v="1"]').click();
    await page.locator('#mnColR .mn-opt[data-v="1"]').click();
    await page.locator('#play').click();
    await jouer(page, ['l', 'r'], 20000);
    const res = page.locator('#mnRes');
    await expect(res).toBeVisible({ timeout: 6000 });
    await expect(res).toContainText('Gauche 1 · droite 1');
    await expect(res).toContainText('points');
    await expect(res).toContainText('Compétence débloquée');
    await expect(res).toContainText('Noires');
    await expect(res).toContainText('Prochain');
    await expect(res).toContainText('Première séance sur cet exercice');
    await expect(res.locator('.pr-gauge')).toBeVisible();
    await expect(page.locator('#mnResGo')).toHaveText('Continuer à 210 BPM');
    // c'est gardé, et visible dans le Parcours
    const m = await page.evaluate(() => JSON.parse(localStorage.getItem('poumtchak.progres')));
    expect(m.s.length).toBe(1);
    expect(m.s[0]).toMatchObject({ g: 'mains', k: '1-1', bpm: 200 });
    await page.locator('#mnResGo').click();
    await expect(page.locator('#bpmIn')).toHaveValue('210');
    await expect(page.locator('#mnRes')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/mn-live/);
  });

  test('Parcours : les compétences et l\'historique, niveaux et prochain objectif', async ({ page }) => {
    await page.evaluate(() => {
      const s = [];
      for (let i = 0; i < 5; i++) s.push({ g: 'mains', d: Date.now() - i * 1000, bpm: 100, acc: { l: 80 + i * 3, r: 90 }, score: 500 + i * 50, k: '1-2', l: 1, r: 2, mode: 'ensemble', pf: 30 });
      localStorage.setItem('poumtchak.progres', JSON.stringify({ s, trad: { 1: 4 } }));
    });
    await page.reload();
    await rubrique(page, 'Parcours');
    const box = page.locator('#prBox');
    await expect(box).toContainText('Tes compétences');
    await expect(box).toContainText('4 / 7 débloquées');
    const croches = box.locator('.pr-sk', { hasText: 'Croches' }).first();
    await expect(croches).toContainText('Avancé');
    await expect(croches).toContainText('Prochain niveau : 120 BPM (tu en es à 100 BPM)');
    await expect(box.locator('.pr-sk', { hasText: 'Triolets' })).toContainText('À débloquer');
    await expect(box.locator('.pr-sk', { hasText: 'Indépendance' })).toContainText('Débutant');
    await expect(box.locator('.pr-sk', { hasText: 'Lecture' })).toContainText('Débutant');
    await expect(box).toContainText('5 séances en tout');
    await expect(box.locator('.pr-spark')).toBeVisible();
  });

  test('sans séance, le Parcours explique comment remplir ses progrès', async ({ page }) => {
    await rubrique(page, 'Parcours');
    await expect(page.locator('#prBox')).toContainText('0 / 7 débloquées');
    await expect(page.locator('#prBox')).toContainText('Joue une séance');
  });
});
