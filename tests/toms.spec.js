// Les trois toms : tom aigu (tim), tom médium (doum), tom basse (toum).
// Le tom aigu est arrivé après les autres : ce qui a été gardé avant lui doit toujours se lire.
const { test, expect, rubrique, cellule, memoire } = require('./outils/base');

test('le tom aigu a sa ligne dans la grille, son mot, et il est gardé', async ({ page }) => {
  await expect(page.locator('#grid .cell[data-id="tim"]')).toHaveCount(16);
  await cellule(page, 'tim', 2).click();
  await expect(cellule(page, 'tim', 2)).toHaveClass(/\blv[123]\b/);
  await expect.poll(async () => (await memoire(page)).bars?.[0]?.split(';').length).toBe(8);
  await page.reload();
  await expect(cellule(page, 'tim', 2)).toHaveClass(/\blv[123]\b/);
});

test('un rythme gardé avant le tom aigu (7 lignes) se lit toujours', async ({ page }) => {
  const ligne = (pas) => Array.from({ length: 16 }, (_, i) => (pas.includes(i) ? '2' : '0')).join('');
  // ancien ordre : poum, tchak, doum, toum, tss, tchaa, psch
  const vieux = [ligne([0, 8]), ligne([4, 12]), ligne([6]), ligne([14]), ligne([]), ligne([]), ligne([])].join(';');
  // posé avant le chargement de la page (sinon la page ouverte réécrit sa mémoire en partant)
  await page.addInitScript((v) => {
    if (sessionStorage.getItem('graine')) return;
    sessionStorage.setItem('graine', '1');
    localStorage.setItem('poumtchak.v2', JSON.stringify({ v: 3, meter: '44', bpm: 90, bars: [v],
      entries: [{ w: 'poum', ids: ['poum'] }, { w: 'tchak', ids: ['tchak'] }, { w: 'doum', ids: ['doum'] }, { w: 'toum', ids: ['toum'] }] }));
    localStorage.setItem('poumtchak.exos', JSON.stringify([{ name: 'Vieux', meter: '44', swing: false,
      bars: [{ poum: Array(16).fill(0).map((_, i) => (i === 0 ? 2 : 0)), tchak: Array(16).fill(0), doum: Array(16).fill(0), toum: Array(16).fill(0),
        tss: Array(16).fill(0), tchaa: Array(16).fill(0), psch: Array(16).fill(0) }] }]));
  }, vieux);
  await page.reload();
  await page.locator('#grid .cell').first().waitFor();
  await expect(cellule(page, 'poum', 0)).toHaveClass(/\blv[123]\b/);
  await expect(cellule(page, 'doum', 6)).toHaveClass(/\blv[123]\b/);
  await expect(cellule(page, 'toum', 14)).toHaveClass(/\blv[123]\b/);
  await expect(page.locator('#grid .cell[data-id="tim"].on')).toHaveCount(0);
  // l'ancien dictionnaire reçoit le mot du tom aigu (gardé à la prochaine modification)
  await cellule(page, 'tss', 1).click();
  await expect.poll(async () => ((await memoire(page)).entries || []).some((e) => e.w === 'tim')).toBe(true);
  // l'exercice gardé pour le casque est toujours là
  await rubrique(page, 'Mots');
  await expect(page.locator('#exoList')).toContainText('Vieux');
});

test("les trois toms dans « Jouer sur l'écran », au bon endroit sur la batterie", async ({ page }) => {
  await rubrique(page, 'Pratique');
  await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
  await expect(page.locator('#kitView')).toBeVisible();
  for (const id of ['tim', 'doum', 'toum']) await expect(page.locator(`.pad[data-id="${id}"]`)).toBeVisible();
  const box = async (id) => page.locator(`.pad[data-id="${id}"]`).boundingBox();
  const [a, m, b] = [await box('tim'), await box('doum'), await box('toum')];
  // de gauche à droite comme sur une vraie batterie, et sans se chevaucher
  expect(a.x + a.width).toBeLessThanOrEqual(m.x + 1);
  expect(m.x).toBeLessThan(b.x);
  expect(m.y + m.height).toBeLessThanOrEqual(b.y + b.height);
});
