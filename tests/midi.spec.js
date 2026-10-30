// Batterie électronique branchée en MIDI (USB) : une fausse batterie « Alesis Nitro Max ».
const { test, expect, rubrique } = require('./outils/base');

async function ouvrirVue(page) {
  await rubrique(page, 'Pratique');
  await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
  await expect(page.locator('#kitView')).toBeVisible();
}

test.describe('Batterie électronique (MIDI)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const entree = { name: 'Alesis Nitro Max', onmidimessage: null };
      // un coup : note on sur le canal 10, avec l'heure du navigateur
      window.__frappe = (note, vel = 100) => entree.onmidimessage
        && entree.onmidimessage({ data: new Uint8Array([0x99, note, vel]), timeStamp: performance.now() });
      navigator.requestMIDIAccess = async () => ({ inputs: new Map([['1', entree]]), onstatechange: null });
    });
    await page.reload();
    await page.locator('#grid .cell').first().waitFor();
  });

  test('la batterie est reconnue et chaque fût allume son pad', async ({ page }) => {
    await ouvrirVue(page);
    await page.locator('#kvMidi').click();
    await expect(page.locator('#kvMidi')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#kvHear')).toContainText('Alesis Nitro Max');
    await expect(page.locator('#kvHint')).toContainText('Joue sur ta batterie');
    const allumes = await page.evaluate(async () => {
      const vus = new Set();
      document.querySelectorAll('.pad').forEach((p) => new MutationObserver(() => {
        if (p.classList.contains('on')) vus.add(p.dataset.id);
      }).observe(p, { attributes: true, attributeFilter: ['class'] }));
      // grosse caisse, caisse claire, charleston fermé, ouvert, tom, tom basse, crash
      for (const n of [36, 38, 42, 46, 48, 43, 49]) { window.__frappe(n); await new Promise((r) => setTimeout(r, 60)); }
      return [...vus].sort();
    });
    expect(allumes).toEqual(['doum', 'poum', 'psch', 'tchaa', 'tchak', 'toum', 'tss']);
  });

  test('le tempo joué s\'affiche, et on peut le prendre', async ({ page }) => {
    await ouvrirVue(page);
    await page.locator('#kvMidi').click();
    // 14 coups toutes les 500 ms : 120 BPM
    await page.evaluate(() => new Promise((ok) => {
      let n = 0;
      const iv = setInterval(() => { window.__frappe(n % 2 ? 38 : 36); if (++n >= 14) { clearInterval(iv); ok(); } }, 500);
    }));
    await expect(page.locator('#kvHear')).toContainText(/≈ (119|120|121) BPM/);
    await page.locator('#kvTake').click();
    await expect(page.locator('#bpmIn')).toHaveValue(/^(119|120|121)$/);
  });

  test('en jouant, des coups en rythme sont notés justes', async ({ page }) => {
    await ouvrirVue(page);
    await page.locator('#kvMidi').click();
    await page.locator('#play').click();
    await page.evaluate(() => new Promise((ok) => {
      const der = {};
      let n = 0;
      const iv = setInterval(() => {
        for (const [id, note] of [['poum', 36], ['tchak', 38]]) {
          const c = document.querySelector(`#grid .cell.on.now[data-id="${id}"]`);
          if (der[id] && !der[id].classList.contains('now')) der[id] = null;
          if (c && c !== der[id]) { der[id] = c; window.__frappe(note); n++; }
        }
        if (n >= 6) { clearInterval(iv); setTimeout(ok, 200); }
      }, 3);
    }));
    await expect(page.locator('#kvScore')).toContainText(/^[4-9] justes/);
    await expect(page.locator('#kvScore')).not.toContainText('en trop');
  });

  test('l\'appli ne joue plus que le clic quand la batterie est branchée', async ({ page }) => {
    await ouvrirVue(page);
    await page.locator('#kvMidi').click();
    await page.locator('#play').click();
    await expect(page.locator('#kvHint')).toContainText('avec le clic', { timeout: 6000 });
    // débrancher rend la main aux sons de l'appli
    await page.locator('#kvMidi').click();
    await expect(page.locator('#kvMidi')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#kvHint')).not.toContainText('avec le clic');
  });
});

test.describe('Sans MIDI dans le navigateur (Safari sur iPhone)', () => {
  test('on explique quoi faire', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: undefined, configurable: true }); });
    await page.reload();
    await page.locator('#grid .cell').first().waitFor();
    await ouvrirVue(page);
    await page.locator('#kvMidi').click();
    await expect(page.locator('#kvHear')).toContainText('Pas de MIDI');
    await expect(page.locator('#kvScore')).toContainText('Web MIDI Browser');
    await expect(page.locator('#kvMidi')).toHaveAttribute('aria-pressed', 'false');
  });
});
