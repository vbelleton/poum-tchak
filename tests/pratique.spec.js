const { test, expect, rubrique, frapperPad } = require('./outils/base');

async function ouvrirBatterie(page) {
  await rubrique(page, 'Pratique');
  await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
  await expect(page.locator('#kitView')).toBeVisible();
}

/* Tape sur un pad au moment où la grille arrive sur une case de ce fût (avec un décalage en ms). */
async function frapperEnRythme(page, id, nombre, decalage = 0) {
  return page.evaluate(([id, nombre, decalage]) => new Promise((ok) => {
    let n = 0, derniere = document.querySelector(`#grid .cell.on.now[data-id="${id}"]`);
    const iv = setInterval(() => {
      const c = document.querySelector(`#grid .cell.on.now[data-id="${id}"]`);
      if (derniere && !derniere.classList.contains('now')) derniere = null;
      if (c && c !== derniere) {
        derniere = c; n++;
        setTimeout(() => document.querySelector(`.pad[data-id="${id}"]`).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, cancelable: true, pressure: 1 })), decalage);
        if (n >= nombre) { clearInterval(iv); setTimeout(() => ok(n), decalage + 50); }
      }
    }, 4);
  }), [id, nombre, decalage]);
}

test.describe("Jouer sur l'écran", () => {
  test('la partition montre les fûts du rythme, et le choix des zones est visible', async ({ page }) => {
    await ouvrirBatterie(page);
    await expect(page.locator('#kvLayout')).toBeVisible();
    await expect(page.locator('#kvStaff')).toBeVisible();
    // Rock : charleston fermé, caisse claire, grosse caisse
    await expect(page.locator('#kvStaff .ks-lab span')).toHaveCount(3);
    await expect(page.locator('#kvStaff .ks-c')).toHaveCount(16);
    await expect(page.locator('#kvStaff .ks-d i').first()).toBeVisible();
    await page.locator('#kvLayout').getByRole('button', { name: 'Utiles' }).click();
    await expect(page.locator('.pad:visible')).toHaveCount(3);
    await expect(page.locator('#kvMineRow')).toBeVisible();
    await page.locator('#kvLayout').getByRole('button', { name: 'Cascade' }).click();
    await expect(page.locator('#kvFall')).toBeVisible();
    await expect(page.locator('.pad:visible')).toHaveCount(3);
    await page.locator('#kvLayout').getByRole('button', { name: 'Batterie' }).click();
    await expect(page.locator('#kvFall')).toBeHidden();
    await expect(page.locator('.pad:visible')).toHaveCount(7);
    await page.locator('#play').click();
    await expect(page.locator('#kvStaff .ks-c.now')).toHaveCount(1);
  });

  test('la batterie occupe l\'écran, avec des pads assez grands', async ({ page }) => {
    await ouvrirBatterie(page);
    await expect(page.locator('.pad')).toHaveCount(7);
    for (const id of ['poum', 'tchak', 'doum', 'toum', 'tss', 'tchaa', 'psch']) {
      const b = await page.locator(`.pad[data-id="${id}"]`).boundingBox();
      expect(b.width, id).toBeGreaterThanOrEqual(44);
      expect(b.height, id).toBeGreaterThanOrEqual(44);
    }
    const kick = await page.locator('.pad[data-id="poum"]').boundingBox();
    const crash = await page.locator('.pad[data-id="psch"]').boundingBox();
    expect(kick.y).toBeGreaterThan(crash.y);
    await expect(page.locator('.dock')).toBeVisible();
    await expect(page.locator('#play')).toBeInViewport();
    await expect(page.locator('#kvRead')).toContainText('pouts');
    await expect(page.locator('#kvStaff .ks-b')).toHaveCount(4);
  });

  test('une frappe allume le pad et affiche le mot', async ({ page }) => {
    await ouvrirBatterie(page);
    await frapperPad(page, 'toum');
    await expect(page.locator('#kvWord')).toHaveText('toum');
  });

  test('deux doigts en même temps donnent le mot fondu', async ({ page }) => {
    await ouvrirBatterie(page);
    await page.evaluate(() => ['poum', 'tss'].forEach((id, i) => document.querySelector(`.pad[data-id="${id}"]`)
      .dispatchEvent(new PointerEvent('pointerdown', { pointerId: i + 1, bubbles: true, cancelable: true, pressure: 1 }))));
    await expect(page.locator('#kvWord')).toHaveText('pouts');
  });

  test('avant de jouer, la vue invite à lancer la lecture', async ({ page }) => {
    await ouvrirBatterie(page);
    await expect(page.locator('#kvVerdict')).toHaveText('Prêt');
    await expect(page.locator('#kvHint')).toContainText('Appuie sur ▶');
  });

  test('les pads à frapper sont entourés pendant la lecture', async ({ page }) => {
    await ouvrirBatterie(page);
    await page.locator('#play').click();
    await expect(page.locator('.pad.cible').first()).toBeVisible();
    await expect(page.locator('.pad[data-id="tss"].cible, .pad[data-id="tss"].proche')).toHaveCount(1, { timeout: 3000 });
    await page.locator('#play').click();
    await expect(page.locator('.pad.cible, .pad.proche')).toHaveCount(0);
  });

  test('frappes en rythme : verdict, précision, série, jauge', async ({ page }) => {
    await ouvrirBatterie(page);
    await page.locator('#play').click();
    await frapperEnRythme(page, 'poum', 4);
    await expect(page.locator('#kvScore')).toHaveText(/^4 justes/);
    await expect(page.locator('#kvScore')).toContainText('noté sur poum');
    await expect(page.locator('#kvPct')).toContainText('100 %');
    await expect(page.locator('#kvStreak')).toHaveText(/série [34]/);
    await expect(page.locator('#kvBar i:not(.mid)')).toHaveCount(4);
  });

  test('une frappe en retard est signalée, une frappe sans note est en trop', async ({ page }) => {
    await ouvrirBatterie(page);
    await page.locator('#play').click();
    await frapperEnRythme(page, 'tchak', 1, 92);
    await expect(page.locator('#kvScore')).toContainText('1 tôt ou tard');
    await frapperPad(page, 'psch');
    await expect(page.locator('#kvVerdict')).toHaveText('En trop');
    await expect(page.locator('#kvVerdict')).toHaveClass(/bad/);
    await expect(page.locator('#kvScore')).toContainText('1 en trop');
  });

  test('seuls les fûts joués comptent leurs ratés, et le bilan reste à l\'arrêt', async ({ page }) => {
    await ouvrirBatterie(page);
    await page.locator('#play').click();
    await frapperEnRythme(page, 'poum', 2);
    await page.waitForTimeout(2600);
    await expect(page.locator('#kvScore')).toContainText(/[1-9] ratées?/);
    await expect(page.locator('#kvScore')).not.toContainText('tss');
    await page.locator('#play').click();
    await expect(page.locator('#kvVerdict')).toHaveText('Fini');
    await expect(page.locator('#kvScore')).toHaveText(/^Bilan : \d+ % de précision, série max \d+/);
  });

  test('changer de rythme et de sons sans quitter la batterie', async ({ page }) => {
    await ouvrirBatterie(page);
    await page.getByLabel('Rythme à jouer').selectOption('valse');
    await expect(page.locator('#kvStaff .ks-b')).toHaveCount(3);
    await expect(page.locator('#kvRead')).toContainText('pouts');
    await page.getByRole('button', { name: 'Réglages de la vue' }).click();
    await page.locator('#kvSound').getByRole('button', { name: 'Batterie' }).click();
    await expect(page.locator('#kvSound [data-v="kit"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.locator('#meterSeg [aria-pressed="true"]')).toHaveText('3/4');
    await expect(page.locator('#soundSeg [data-v="kit"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Échap ferme la vue et rend le focus au bouton', async ({ page }) => {
    await ouvrirBatterie(page);
    await expect(page.getByRole('button', { name: 'Fermer' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#kitView')).toBeHidden();
    await expect(page.getByRole('button', { name: "Jouer sur l'écran" }).first()).toBeFocused();
  });
});

test.describe('Parle-le avant de le jouer', () => {
  const etape = (page, nom) => page.locator('#drillSteps').getByRole('button', { name: new RegExp(nom) });

  test('Écouter joue la mesure, retoucher arrête', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await etape(page, 'Écouter').click();
    await expect(etape(page, 'Écouter')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#play')).toHaveText('Stop');
    await expect(page.locator('#drillMsg')).toContainText('suis les syllabes');
    await etape(page, 'Écouter').click();
    await expect(etape(page, 'Écouter')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#play')).toHaveText('Jouer');
  });

  test('passer de Dire à Écouter garde une seule étape active', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await etape(page, 'Dire').click();
    await expect(page.locator('#drillMsg')).toContainText('à voix haute');
    await etape(page, 'Écouter').click();
    await expect(page.locator('#drillSteps [aria-pressed="true"]')).toHaveCount(1);
    await expect(etape(page, 'Écouter')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Jouer sur l\'écran ouvre la batterie, la mesure se tait et la note reste à la fin', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await etape(page, "Jouer sur l'écran").click();
    await expect(page.locator('#kitView')).toBeVisible();
    await expect(page.locator('#play')).toHaveText('Stop');
    expect(await page.evaluate(() => document.querySelector('#drillSteps [data-v="screen"]').getAttribute('aria-pressed'))).toBe('true');
    await frapperEnRythme(page, 'tchak', 2);
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.locator('#play')).toHaveText('Jouer');
    await expect(page.locator('#drillMsg')).toHaveText(/^Dernier passage : \d+ % de précision, série max \d+/);
    await expect(etape(page, "Jouer sur l'écran")).toHaveAttribute('aria-pressed', 'false');
  });

  test('le bouton Jouer du bas sort de l\'étape en cours', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await etape(page, 'Dire').click();
    await page.locator('#play').click();
    await expect(page.locator('#drillSteps [aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('#play')).toHaveText('Jouer');
  });
});

test.describe('Défi : écoute, puis joue', () => {
  /* Tape les notes du rythme, mais seulement quand la vue dit « À toi ». */
  const jouerSonTour = (page, id) => page.evaluate((id) => {
    let derniere = null;
    window.__tour = setInterval(() => {
      const c = document.querySelector(`#grid .cell.on.now[data-id="${id}"]`);
      if (derniere && !derniere.classList.contains('now')) derniere = null;
      if (c && c !== derniere && document.querySelector('#kvHint').textContent.startsWith('À toi')) {
        derniere = c;
        document.querySelector(`.pad[data-id="${id}"]`).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, cancelable: true, pressure: 1 }));
      }
    }, 4);
  }, id);

  test('le défi s\'ouvre depuis Pratique, écoute puis décompte puis ton tour', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.locator('#chalBtn').click();
    await expect(page.locator('#kitView')).toBeVisible();
    await expect(page.locator('#kvMode [data-v="defi"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#kvHint')).toHaveText('Écoute le rythme…');
    await expect(page.locator('#kvHint')).toHaveText('Prépare-toi…', { timeout: 9000 });
    await expect(page.locator('#kvCount')).toHaveClass(/pre/);
    await expect(page.locator('#kvHint')).toHaveText('À toi : poum et tchak', { timeout: 9000 });
    await expect(page.locator('#kvMine .chip[aria-pressed="true"]')).toHaveCount(2);
    await expect(page.locator('.pad.cible')).toHaveCount(0);
  });

  test('sans rien jouer, le tempo ralentit', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.locator('#chalBtn').click();
    await expect(page.locator('#kvChal')).toContainText('ralentit', { timeout: 24000 });
    await expect(page.locator('#bpmIn')).toHaveValue('54');
    await expect(page.locator('#kvChal')).toContainText('Manche 2');
    await expect(page.locator('#kvChal')).toContainText('pas grave');
  });

  test('en jouant juste, le tempo accélère', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.locator('#chalBtn').click();
    await jouerSonTour(page, 'tchak');
    await jouerSonTour(page, 'poum');
    await jouerSonTour(page, 'tss');
    await expect(page.locator('#kvChal')).toContainText('accélère', { timeout: 24000 });
    await expect(page.locator('#bpmIn')).toHaveValue('65');
    await expect(page.locator('#kvChal')).toContainText('★');
    await expect(page.locator('#kvVerdict')).toContainText(/Bravo|Bien joué|Superbe|Tu l/);
    await expect(page.locator('.kv-card')).toHaveClass(/win/);
    await page.locator('#play').click();
    await expect(page.locator('#bpmIn')).toHaveValue('60');
    await expect(page.locator('#kvChal')).toContainText('record 60');
  });
});

test.describe('Cascade', () => {
  test('des barres colorées tombent vers la ligne, et chaque couloir se frappe', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
    await page.locator('#kvLayout').getByRole('button', { name: 'Cascade' }).click();
    await page.locator('#play').click();
    await page.waitForTimeout(1500);
    const pixels = await page.evaluate(() => {
      const cv = document.querySelector('#kvFall');
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++;
      return n;
    });
    expect(pixels).toBeGreaterThan(500);
    const pads = await page.locator('.pad:visible').count();
    expect(pads).toBe(3);
    for (let i = 0; i < pads; i++) {
      const b = await page.locator('.pad:visible').nth(i).boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('la batterie dessinée : sept disques assez grands, sans se recouvrir trop', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
    const boxes = [];
    for (const id of ['poum', 'tchak', 'doum', 'toum', 'tss', 'tchaa', 'psch']) {
      const b = await page.locator(`.pad[data-id="${id}"]`).boundingBox();
      expect(b.width, id).toBeGreaterThanOrEqual(44);
      boxes.push({ id, ...b });
    }
    const dedans = await page.evaluate(() => {
      const z = document.querySelector('#kvPads').getBoundingClientRect();
      return [...document.querySelectorAll('.pad')].every((p) => { const r = p.getBoundingClientRect(); return r.left >= z.left - 1 && r.right <= z.right + 1 && r.top >= z.top - 1 && r.bottom <= z.bottom + 1; });
    });
    expect(dedans).toBe(true);
  });
});

test.describe('Rien ne bouge pendant le jeu', () => {
  for (const [nom, bouton, zone] of [['en libre, fûts utiles', "Jouer sur l'écran", 'Utiles'], ['en défi, batterie', 'Défi : écoute, puis joue', 'Batterie']]) {
    test(`les pads gardent leur place malgré les verdicts (${nom})`, async ({ page }) => {
      await rubrique(page, 'Pratique');
      await page.getByRole('button', { name: bouton }).first().click();
      await page.locator('#kvLayout').getByRole('button', { name: zone }).click();
      if (bouton === "Jouer sur l'écran") await page.locator('#play').click();
      await page.evaluate(() => {
        window.__pos = new Set();
        setInterval(() => {
          const r = document.querySelector('#kvPads').getBoundingClientRect();
          window.__pos.add(Math.round(r.top) + '/' + Math.round(r.height));
        }, 16);
      });
      // des ratés (rien n'est joué) puis un bilan de manche
      await page.waitForTimeout(bouton === "Jouer sur l'écran" ? 4500 : 14500);
      expect(await page.evaluate(() => [...window.__pos])).toHaveLength(1);
    });
  }
});

test('Recaler apparaît quand toutes les frappes sont en retard, et corrige le décalage', async ({ page }) => {
  await rubrique(page, 'Pratique');
  await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
  await expect(page.locator('#offAuto2')).toBeVisible();
  await page.locator('#play').click();
  const n = await frapperEnRythme(page, 'tss', 8, 90);
  expect(n).toBe(8);
  await page.locator('#offAuto2').click();
  await expect(page.locator('#kvScore')).toContainText('Recalé');
  await expect(page.locator('#offAuto2')).toBeHidden();
  await page.getByRole('button', { name: 'Réglages de la vue' }).click();
  await expect(page.locator('#offVal')).not.toHaveText('0 ms');
});

test.describe("Anneau d'approche", () => {
  test('un anneau se resserre sur le pad à frapper, et disparaît après le coup', async ({ page }) => {
    await rubrique(page, 'Pratique');
    await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
    await page.locator('#play').click();
    await expect(page.locator('#kvPads .pad.ring').first()).toBeVisible({ timeout: 6000 });
    const k = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#kvPads .pad.ring')).getPropertyValue('--ring')));
    expect(k).toBeGreaterThanOrEqual(1);
    expect(k).toBeLessThanOrEqual(2);
    await page.locator('#play').click();
    await expect(page.locator('#kvPads .pad.ring')).toHaveCount(0);
  });
});
