// Rubrique Mains : chaque main joue n coups par temps et est notée à part.
const { test, expect, rubrique } = require('./outils/base');

async function ouvrir(page) {
  await rubrique(page, 'Mains');
  await expect(page.locator('#p-mains')).toBeVisible();
}
const regler = (page, bpm) => page.locator('#bpmIn').fill(String(bpm)).then(() => page.locator('#bpmIn').press('Enter'));
const choix = (page, main, v) => page.locator(main === 'g' ? '#mnColL' : '#mnColR').locator(`.mn-opt[data-v="${v}"]`);

// Tape une main en rythme, décalée de « decal » ms, d'après l'horloge du son de la page.
async function taper(page, h, n, decal = 0, rater = 0) {
  return page.evaluate(async ({ h, n, decal, rater }) => {
    const pad = document.querySelector(h === 'l' ? '#mnPadL' : '#mnPadR');
    const fin = performance.now() + 4500;
    let faits = 0;
    while (performance.now() < fin) {
      const x = window.__mnExp(h);
      if (x != null) {
        const att = x * 1000 + decal;
        if (att > 0) await new Promise((r) => setTimeout(r, att));
        if (faits % 4 !== 3 || !rater) pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        faits++;
        await new Promise((r) => setTimeout(r, 30));
      } else await new Promise((r) => setTimeout(r, 10));
      if (faits >= n) break;
    }
    return faits;
  }, { h, n, decal, rater });
}

test.describe('Mains', () => {
  test('un tableau à deux colonnes : fraction, note, solfège et compte', async ({ page }) => {
    await ouvrir(page);
    await expect(page.locator('#mnColL .mn-opt')).toHaveCount(5);
    await expect(page.locator('#mnColR .mn-opt')).toHaveCount(5);
    const croches = choix(page, 'g', 2);
    await expect(croches).toContainText('½ temps');
    await expect(croches).toContainText('croches');
    await expect(croches).toContainText('ti‑ti');
    await expect(croches).toContainText('1 et');
    await expect(choix(page, 'd', 3)).toContainText('tri‑o‑let');
    await expect(choix(page, 'd', 4)).toContainText('¼ temps');
    await expect(croches).toHaveAttribute('aria-checked', 'true');
    await expect(choix(page, 'd', 1)).toHaveAttribute('aria-checked', 'true');
  });

  test('choisir une case change la main et la frise', async ({ page }) => {
    await ouvrir(page);
    await choix(page, 'g', 3).click();
    await expect(page.locator('#mnL .mn-dot')).toHaveCount(12);
    await choix(page, 'd', 0).click();
    await expect(page.locator('#mnR .mn-dot')).toHaveCount(10);
    await expect(page.locator('#mnMsg')).toContainText('Gauche : 3 coups par temps · droite : 1, 2, 3 puis 4 coups');
    await choix(page, 'd', 0).press('ArrowDown');
    await expect(choix(page, 'd', 1)).toHaveAttribute('aria-checked', 'true');
  });

  test('le solfège suit le réglage Takadimi', async ({ page }) => {
    await rubrique(page, 'Rythme');
    await page.locator('#solfSeg').getByRole('button', { name: 'Takadimi' }).click();
    await ouvrir(page);
    await expect(choix(page, 'g', 4)).toContainText('ta‑ka‑di‑mi');
  });

  test('ça joue : décompte, puis chaque main allume tous ses coups régulièrement', async ({ page }) => {
    await ouvrir(page);
    await regler(page, 200);
    await choix(page, 'g', 2).click();
    await choix(page, 'd', 3).click();
    await page.evaluate(() => {
      window.__v = { r: [], l: [] };
      for (const h of ['r', 'l']) {
        document.querySelectorAll('#mn' + h.toUpperCase() + ' .mn-dot').forEach((d, i) => {
          new MutationObserver((ms) => {
            const avant = (ms[0].oldValue || '').split(' ').includes('on');
            if (!avant && d.classList.contains('on')) window.__v[h].push([i, performance.now()]);
          }).observe(d, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        });
      }
    });
    await page.locator('#play').click();
    await expect(page.locator('#play')).toContainText('Stop');
    await expect(page.locator('#mnCount')).toContainText(/[1-4]/);
    await page.waitForTimeout(3300);
    const v = await page.evaluate(() => window.__v);
    expect(new Set(v.r.map((x) => x[0])).size).toBe(12);
    expect(new Set(v.l.map((x) => x[0])).size).toBe(8);
    const ecarts = v.r.slice(1).map((x, i) => x[1] - v.r[i][1]).filter((e) => e < 400).sort((a, b) => a - b);
    const med = ecarts[Math.floor(ecarts.length / 2)];
    expect(med).toBeGreaterThan(75);
    expect(med).toBeLessThan(125);
    await page.locator('#play').click();
    await expect(page.locator('#play')).toContainText('Jouer');
  });

  test('chaque main est notée à part', async ({ page }) => {
    await ouvrir(page);
    await regler(page, 80);
    await choix(page, 'g', 1).click();
    await choix(page, 'd', 2).click();
    await page.locator('#play').click();
    await page.waitForTimeout(3000); // décompte
    // droite en place ; gauche en rate un sur quatre
    await Promise.all([taper(page, 'r', 10, 0, 0), taper(page, 'l', 6, 0, 1)]);
    const d = await page.locator('#mnStatR').textContent();
    const g = await page.locator('#mnStatL').textContent();
    const pct = (t) => parseInt(t.match(/(\d+) %/)[1], 10);
    expect(pct(d)).toBeGreaterThanOrEqual(80);
    expect(pct(g)).toBeLessThan(pct(d));
    await page.locator('#play').click();
    await expect(page.locator('#mnMsg')).toContainText('Bilan : gauche');
  });

  test('taper trop tôt est signalé, avec l\'avance moyenne', async ({ page }) => {
    await ouvrir(page);
    await regler(page, 70);
    await choix(page, 'd', 1).click();
    await page.locator('#play').click();
    await page.waitForTimeout(3600);
    await taper(page, 'r', 5, -60, 0);
    await expect(page.locator('#mnStatR')).toContainText('en avance de');
  });

  test('les touches F et J tapent gauche et droite', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#mnPadL').focus();
    await page.keyboard.press('j');
    await expect(page.locator('#mnPadR')).toHaveAttribute('data-n', '1');
  });

  test('changer de rubrique arrête les mains', async ({ page }) => {
    await ouvrir(page);
    await page.locator('#play').click();
    await expect(page.locator('#play')).toContainText('Stop');
    await rubrique(page, 'Rythme');
    await expect(page.locator('#play')).toContainText('Jouer');
  });

  test('les 16 duos s\'enchaînent, deux mesures chacun', async ({ page }) => {
    await ouvrir(page);
    await regler(page, 220);
    await page.locator('#mnWalk').check();
    await page.locator('#play').click();
    await expect(page.locator('#mnMsg')).toContainText('Duo 1 sur 16 : gauche 1 contre droite 1');
    await expect(page.locator('#mnMsg')).toContainText('Duo 2 sur 16 : gauche 1 contre droite 2', { timeout: 6000 });
    await expect(choix(page, 'd', 2)).toHaveAttribute('aria-checked', 'true');
  });

  test('le réglage est gardé', async ({ page }) => {
    await ouvrir(page);
    await choix(page, 'd', 4).click();
    await page.reload();
    await ouvrir(page);
    await expect(page.locator('#mnR .mn-dot')).toHaveCount(16);
  });

  test('pas de débordement à 320 px, syllabes jamais coupées', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await ouvrir(page);
    const l = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(l).toBeLessThanOrEqual(0);
    const coupe = await page.evaluate(() => [...document.querySelectorAll('.mn-opt .s, .mn-opt .c, .tabs [role=tab]')]
      .some((e) => e.scrollWidth > e.clientWidth + 1));
    expect(coupe).toBe(false);
  });

  test('batterie MIDI : la caisse claire compte pour la droite', async ({ page }) => {
    await page.addInitScript(() => {
      const entree = { name: 'Alesis Nitro Max', onmidimessage: null };
      window.__frappe = (note) => entree.onmidimessage
        && entree.onmidimessage({ data: new Uint8Array([0x99, note, 100]), timeStamp: performance.now() });
      navigator.requestMIDIAccess = async () => ({ inputs: new Map([['1', entree]]), onstatechange: null });
    });
    await page.reload();
    await ouvrir(page);
    await page.locator('#mnMidi').click();
    await expect(page.locator('#mnMsg')).toContainText('Alesis Nitro Max');
    await page.evaluate(() => window.__frappe(38));
    await expect(page.locator('#mnPadR')).toHaveAttribute('data-n', '1');
    await page.evaluate(() => window.__frappe(48));
    await expect(page.locator('#mnPadL')).toHaveAttribute('data-n', '1');
  });

  test('iPhone : la session audio passe en « lecture »', async ({ page }) => {
    await page.addInitScript(() => { navigator.audioSession = { type: 'auto' }; });
    await page.reload();
    await ouvrir(page);
    await page.locator('#play').click();
    expect(await page.evaluate(() => navigator.audioSession.type)).toBe('playback');
  });
});

test.describe('Mains : couloirs et son', () => {
  test('au-dessus de chaque pad, les coups arrivent dans un couloir', async ({ page }) => {
    await rubrique(page, 'Mains');
    await page.locator('#bpmIn').fill('90');
    await page.locator('#bpmIn').press('Enter');
    await page.locator('#play').click();
    await page.waitForTimeout(3200);
    // pixels de la couleur de chaque main dans le haut du couloir (les coups qui arrivent)
    const n = await page.evaluate(() => ['#mnLaneL', '#mnLaneR'].map((s) => {
      const cv = document.querySelector(s), c = cv.getContext('2d');
      const d = c.getImageData(0, 0, cv.width, Math.floor(cv.height * 0.8)).data;
      let k = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 120 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) k++;
      return k;
    }));
    expect(n[0]).toBeGreaterThan(50);
    expect(n[1]).toBeGreaterThan(50);
  });

  test('sans son : ni clic, ni modèle, ni son au toucher', async ({ page }) => {
    await page.addInitScript(() => {
      window.__sons = 0;
      const o = AudioScheduledSourceNode.prototype.start;
      AudioScheduledSourceNode.prototype.start = function (...a) { window.__sons++; return o.apply(this, a); };
    });
    await page.reload();
    await rubrique(page, 'Mains');
    await page.locator('#mnModel').getByRole('button', { name: 'Sans son' }).click();
    await page.locator('#play').click();
    await page.waitForTimeout(1500);
    await page.locator('#mnPadR').dispatchEvent('pointerdown');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__sons)).toBe(0);
    await page.locator('#play').click();
    // avec le clic seul, ça sonne
    await page.locator('#mnModel').getByRole('button', { name: 'Clic seul' }).click();
    await page.locator('#play').click();
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__sons)).toBeGreaterThan(0);
  });
});
