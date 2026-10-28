const { test, expect, rubrique } = require('./outils/base');
const AxeBuilder = require('@axe-core/playwright').default;

const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function analyser(page) {
  const r = await new AxeBuilder({ page }).withTags(NORMES).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

async function debordement(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const fautifs = [];
    document.querySelectorAll('body *').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || (r.right <= W + 1 && r.left >= -1)) return;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        if (['auto', 'hidden', 'scroll'].includes(getComputedStyle(p).overflowX)) return;
      }
      fautifs.push(`${e.tagName.toLowerCase()}.${e.className}`);
    });
    return { large: document.documentElement.scrollWidth > W, fautifs: fautifs.slice(0, 5) };
  });
}

for (const theme of ['light', 'dark']) {
  test.describe(`Accessibilité, thème ${theme === 'light' ? 'clair' : 'sombre'}`, () => {
    test.use({ colorScheme: theme });

    for (const onglet of ['Rythme', 'Pratique', 'Écoute', 'Mots']) {
      test(`rubrique ${onglet} : aucune erreur axe`, async ({ page }) => {
        await rubrique(page, onglet);
        if (onglet === 'Mots') {
          await page.locator('#dictDrums summary').first().click();
          await page.locator('#combosDet summary').click();
        }
        expect(await analyser(page)).toEqual([]);
      });
    }

    test("vue Jouer sur l'écran : aucune erreur axe", async ({ page }) => {
      await rubrique(page, 'Pratique');
      await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
      expect(await analyser(page)).toEqual([]);
    });
  });
}

test.describe('Mise en page', () => {
  for (const largeur of [320, 375, 768, 1280]) {
    test(`aucun débordement horizontal à ${largeur} px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 800 });
      for (const onglet of ['Rythme', 'Pratique', 'Écoute', 'Mots']) {
        await rubrique(page, onglet);
        const d = await debordement(page);
        expect(d, onglet).toEqual({ large: false, fautifs: [] });
      }
      await rubrique(page, 'Pratique');
      await page.getByRole('button', { name: "Jouer sur l'écran" }).first().click();
      expect(await debordement(page), 'batterie').toEqual({ large: false, fautifs: [] });
    });
  }

  test('les commandes du bas restent visibles et assez grandes', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const sel of ['#clic', '#bpmDown', '#bpmIn', '#bpmUp', '#tap', '#play']) {
      await expect(page.locator(sel)).toBeInViewport();
      const b = await page.locator(sel).boundingBox();
      expect(b.height, sel).toBeGreaterThanOrEqual(44);
      expect(b.width, sel).toBeGreaterThanOrEqual(32);
    }
  });

  test('le lien d\'évitement mène au contenu', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('chaque champ et bouton a un nom', async ({ page }) => {
    for (const onglet of ['Rythme', 'Pratique', 'Écoute', 'Mots']) {
      await rubrique(page, onglet);
      const sansNom = await page.evaluate(() => [...document.querySelectorAll('button, input, select, textarea')]
        .filter((e) => e.offsetParent !== null && e.type !== 'file')
        .filter((e) => !(e.getAttribute('aria-label') || e.labels?.length || e.textContent.trim() || e.getAttribute('aria-labelledby')))
        .map((e) => e.outerHTML.slice(0, 80)));
      expect(sansNom, onglet).toEqual([]);
    }
  });
});
