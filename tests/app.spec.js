// @ts-check
const { test, expect } = require('@playwright/test');

async function stubChart(page) {
  // Les tests ne doivent pas dépendre de CDN tiers (Chart.js, Google Fonts) : on les
  // court-circuite pour des tests rapides et déterministes, avec ou sans accès réseau réel.
  await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.addInitScript(() => {
    window.Chart = function (ctx, cfg) {
      this.data = cfg.data;
      this.update = () => {};
    };
  });
}

async function goPage(page, id) {
  await page.evaluate((pageId) => {
    window.event = { currentTarget: document.body };
    goPage(pageId);
  }, id);
}

test.describe('Observation — validation et saisie', () => {
  test('refuse de démarrer sans poste ni poids', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.click('#btnStart');
    await expect(page.locator('#poste')).toHaveClass(/input-error/);
  });

  test('enregistre un levage et permet de l\'annuler', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Poste test');
    await page.fill('#poids', '20');
    await page.click('#btnStart');
    await page.click('#btnLevage');
    await page.click('#btnLevage');
    await expect(page.locator('#kLevages')).toHaveText('2');
    await page.click('text=Annuler le dernier levage');
    await expect(page.locator('#kLevages')).toHaveText('1');
  });

  test('raccourci clavier Espace enregistre un levage', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Poste clavier');
    await page.fill('#poids', '10');
    await page.click('#btnStart');
    await page.keyboard.press('Space');
    await expect(page.locator('#kLevages')).toHaveText('1');
  });

  test('chaque levage peut avoir un poids différent (bagages non uniformes)', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Poids variables');
    await page.fill('#poids', '23');
    await page.click('#btnStart');
    await page.click('#btnLevage'); // 23 kg (poids initial repris)
    await page.click('.weight-chip >> text="15"'); // 15 kg via préréglage rapide
    await page.fill('#poidsCourant', '32');
    await page.click('#btnLevage'); // 32 kg saisi manuellement
    await expect(page.locator('#kMasse')).toHaveText('70.0');
    const poidsLoggues = await page.locator('.lc-p').allTextContents();
    expect(poidsLoggues).toEqual(['23kg', '15kg', '32kg']);
  });

  test('"Arrêter" exige une confirmation avant de pouvoir reprendre', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test stop');
    await page.fill('#poids', '10');
    await page.click('#btnStart');
    await page.click('#btnStop');
    await expect(page.locator('#timerLbl')).toHaveText('TERMINÉ');
    let dialogSeen = false;
    page.once('dialog', (d) => { dialogSeen = true; d.dismiss(); });
    await page.click('#btnStart');
    await page.waitForTimeout(100);
    expect(dialogSeen).toBe(true);
    expect(await page.evaluate(() => S.running)).toBe(false); // annulée : ne reprend pas
  });

  test('les préréglages de poids sont inertes tant que l\'observation n\'est pas active', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test puces inertes');
    await page.fill('#poids', '10');
    await expect(page.locator('.weight-chip').first()).toBeDisabled();
    await page.click('#btnStart');
    await expect(page.locator('.weight-chip').first()).toBeEnabled();
    page.once('dialog', (d) => d.dismiss());
    await page.click('#btnStop');
    await expect(page.locator('.weight-chip').first()).toBeDisabled();
    // même en forçant un clic JS sur la puce désactivée, aucun levage ne doit être ajouté
    await page.evaluate(() => document.querySelector('.weight-chip').click());
    await expect(page.locator('#kLevages')).toHaveText('0');
  });

  test('l\'état "terminé" survit à un rechargement de page', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test persistance arrêt');
    await page.fill('#poids', '10');
    await page.click('#btnStart');
    await page.click('#btnStop');
    await page.reload();
    await expect(page.locator('#timerLbl')).toHaveText('TERMINÉ (restauré)');
    let dialogSeen = false;
    page.once('dialog', (d) => { dialogSeen = true; d.dismiss(); });
    await page.click('#btnStart');
    await page.waitForTimeout(100);
    expect(dialogSeen).toBe(true);
  });
});

test.describe('Pauses et inactivité — observations longues', () => {
  test('les pauses sont comptabilisées et affichées', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test pauses');
    await page.fill('#poids', '15');
    await page.click('#btnStart');
    await page.click('#btnStart'); // pause
    await expect(page.locator('#pauseSummary')).toBeVisible();
    await expect(page.locator('#pauseSummary')).toContainText('1 pause');
    await page.click('#btnStart'); // reprendre
    expect(await page.evaluate(() => S.pauses.length)).toBe(1);
  });

  test('un rappel apparaît après une longue inactivité et permet de mettre en pause', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test inactivité');
    await page.fill('#poids', '15');
    await page.click('#btnStart');
    await expect(page.locator('#idleNudge')).toBeHidden();
    await page.evaluate(() => { S.lastActivityTs = Date.now() - 6 * 60 * 1000; checkIdle(); });
    await expect(page.locator('#idleNudge')).toBeVisible();
    await page.click('#idleNudge >> text=Mettre en pause');
    expect(await page.evaluate(() => S.running)).toBe(false);
    await expect(page.locator('#idleNudge')).toBeHidden();
  });

  test('enregistrer un levage masque immédiatement le rappel d\'inactivité', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test inactivité 2');
    await page.fill('#poids', '15');
    await page.click('#btnStart');
    await page.evaluate(() => { S.lastActivityTs = Date.now() - 6 * 60 * 1000; checkIdle(); });
    await expect(page.locator('#idleNudge')).toBeVisible();
    await page.click('#btnLevage');
    await expect(page.locator('#idleNudge')).toBeHidden();
  });

  test('un rechargement pendant une observation active ne classe pas le temps actif écoulé comme une pause', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test reload actif');
    await page.fill('#poids', '10');
    await page.click('#btnStart');
    await page.waitForTimeout(1200); // temps actif réel avant le rechargement, sans saveState() entre-temps
    const tBeforeReload = Date.now();
    await page.reload();
    const reloadWallMs = Date.now() - tBeforeReload;
    const elapsed = await page.evaluate(() => S.elapsed);
    expect(elapsed).toBeGreaterThan(1000); // l'écoulé réel doit être capturé, pas une valeur figée à 0
    const pauseMs = await page.evaluate(() => getPauseStats().ms);
    // La pause implicite ne doit couvrir que la fenêtre du rechargement lui-même (quelle que soit
    // sa durée réelle dans l'environnement de test), pas les 1.2s actives qui l'ont précédée.
    expect(pauseMs).toBeLessThanOrEqual(reloadWallMs + 300);
  });
});

test.describe('Génération de rapport', () => {
  test('le bouton se désactive après génération et empêche les doublons', async ({ page }) => {
    await stubChart(page);
    page.on('dialog', (d) => d.accept());
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Anti-doublon');
    await page.fill('#poids', '20');
    await page.click('#btnStart');
    await page.click('#btnLevage');
    await page.waitForTimeout(5200);
    await page.click('#btnAnalyse');
    await expect(page.locator('#btnAnalyse')).toBeDisabled();
    expect(await page.evaluate(() => S.analyses.length)).toBe(1);
    // même en forçant un appel direct, le garde-fou interne doit bloquer
    await page.evaluate(() => lancerAnalyse());
    expect(await page.evaluate(() => S.analyses.length)).toBe(1);
    // un nouveau levage réactive le bouton — il faut d'abord reprendre l'observation
    // (lancerAnalyse() a arrêté le chrono), ce qui redemande confirmation
    await page.click('.modal-close');
    await page.click('#btnStart');
    await page.click('.weight-chip >> nth=0');
    await expect(page.locator('#btnAnalyse')).toBeEnabled();
  });
});

test.describe('Posture et prise par levage', () => {
  test('la posture capturée à chaque levage pèse sur la charge effective, pas la case cochée en fin de session', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test posture par levage');
    await page.fill('#poids', '20');
    await page.click('#btnStart');
    await page.fill('#poidsCourant', '20');
    await page.click('#btnLevage'); // levage 1 : aucune posture cochée
    await page.click('#pi0'); // dos fléchi (-25%), coché seulement pour le levage 2 (case masquée : on clique le label)
    await page.click('#btnLevage'); // levage 2 : posture cochée
    await page.click('#pi0'); // décochée avant la fin de la session
    const brute = await page.evaluate(() => getTotalMasse());
    const eff = await page.evaluate(() => getMasseEffective());
    expect(brute).toBeCloseTo(40, 5);
    expect(eff).toBeCloseTo(20 + 20 / 0.75, 5); // seul le 2e levage porte la pénalité posturale
    const postures = await page.evaluate(() => S.levages.map((l) => l.postures[0]));
    expect(postures).toEqual([false, true]); // chaque levage garde sa propre capture
  });
});

test.describe('Journal des levages', () => {
  test('un levage au milieu du journal peut être supprimé sans tout annuler', async ({ page }) => {
    await stubChart(page);
    page.on('dialog', (d) => d.accept());
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test suppression levage');
    await page.fill('#poids', '10');
    await page.click('#btnStart');
    await page.fill('#poidsCourant', '10'); await page.click('#btnLevage');
    await page.fill('#poidsCourant', '15'); await page.click('#btnLevage');
    await page.fill('#poidsCourant', '20'); await page.click('#btnLevage');
    await expect(page.locator('#kMasse')).toHaveText('45.0');
    await page.locator('.log-row').nth(1).locator('.lc-del').click(); // supprime le 15kg (au milieu)
    await expect(page.locator('#kMasse')).toHaveText('30.0');
    const poids = await page.locator('.lc-p').allTextContents();
    expect(poids).toEqual(['10kg', '20kg']);
  });
});

test.describe('Sauvegarde et restauration', () => {
  test('exporter une sauvegarde déclenche un téléchargement JSON', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Test export sauvegarde');
    await page.fill('#poids', '20');
    await page.click('#btnStart');
    await page.click('#btnLevage');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => exportBackup()),
    ]);
    expect(download.suggestedFilename()).toMatch(/^ergotrak_sauvegarde_.*\.json$/);
  });

  test('restaurer un fichier de sauvegarde remplace la session actuellement affichée', async ({ page }) => {
    await stubChart(page);
    page.on('dialog', (d) => d.accept());
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const backup = {
      sessionId: 'SGT-TESTBACKUP', elapsed: 60000, stopped: true, analyzed: false, running: false,
      pauses: [], pauseStart: 0, lastActivityTs: Date.now(),
      levages: [{ ts: Date.now(), tSec: 10, poids: 27, dist: 0, rythme: null, postures: [false, false, false, false, false], typePrise: 'two_good' }],
      actions: [], analyses: [],
      form: {
        poste: 'Poste restauré', operateur: '', entite: '', genre: 'H', age: '', poids: '27', poidsCourant: '27',
        distTransport: '0', dureePoste: '7', typePrise: 'two_good', notes: '', postures: [false, false, false, false, false],
      },
      savedAt: Date.now(),
    };
    await Promise.all([
      page.waitForNavigation(),
      page.setInputFiles('#restoreFile', {
        name: 'sauvegarde.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup)),
      }),
    ]);
    await expect(page.locator('#poste')).toHaveValue('Poste restauré');
    await expect(page.locator('#kLevages')).toHaveText('1');
  });
});

test.describe('Persistance', () => {
  test('restaure poste et levages après un rechargement', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('#poste', 'Poste persistance');
    await page.fill('#poids', '15');
    await page.click('#btnStart');
    await page.click('#btnLevage');
    await page.reload();
    await expect(page.locator('#poste')).toHaveValue('Poste persistance');
    await expect(page.locator('#kLevages')).toHaveText('1');
  });
});

test.describe('REBA — fidélité au calcul officiel', () => {
  test('posture neutre donne un score de 1', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await goPage(page, 'reba');
    const score = await page.evaluate(() => {
      ['rTronc', 'rTroncTw', 'rCou', 'rCouTw', 'rJambes', 'rGenoux', 'rBras', 'rBrasMod', 'rBrasAbd', 'rAvantBras', 'rPoignet', 'rPoignetTw', 'rCharge', 'rCouplage'].forEach((id) => {
        document.getElementById(id).value = document.getElementById(id).options[0].value;
      });
      document.getElementById('rActStatic').checked = false;
      document.getElementById('rActRepet').checked = false;
      document.getElementById('rActRapide').checked = false;
      calcReba();
      return document.getElementById('rebaScore').textContent;
    });
    expect(score).toBe('1');
  });

  test('posture pire cas donne un score de 15 (plafond officiel)', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await goPage(page, 'reba');
    const score = await page.evaluate(() => {
      const setMax = (id) => {
        const opts = document.getElementById(id).options;
        document.getElementById(id).value = opts[opts.length - 1].value;
      };
      ['rTronc', 'rTroncTw', 'rCou', 'rCouTw', 'rJambes', 'rGenoux', 'rBras', 'rBrasMod', 'rBrasAbd', 'rAvantBras', 'rPoignet', 'rPoignetTw', 'rCharge', 'rCouplage'].forEach(setMax);
      document.getElementById('rActStatic').checked = true;
      document.getElementById('rActRepet').checked = true;
      document.getElementById('rActRapide').checked = true;
      calcReba();
      return document.getElementById('rebaScore').textContent;
    });
    expect(score).toBe('15');
  });
});

test.describe('NIOSH', () => {
  test('IL <= 1 quand le poids réel est sous la LPR', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await goPage(page, 'niosh');
    const badge = await page.evaluate(() => {
      document.getElementById('nH').value = 25;
      document.getElementById('nV').value = 75;
      document.getElementById('nD').value = 25;
      document.getElementById('nA').value = 0;
      document.getElementById('nF').value = 0.2;
      document.getElementById('nPoids').value = 5;
      calcNiosh();
      return document.getElementById('nIL_badge').className;
    });
    expect(badge).toContain('li-ok');
  });
});

test.describe('KIM', () => {
  test('respecte la structure Temps × (Poids + Posture + Conditions)', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    await goPage(page, 'mac');
    const score = await page.evaluate(() => {
      document.getElementById('genre').value = 'H'; // le genre est repris de la page Observation
      document.getElementById('kPoids').value = '15'; // ipoids=4 pour un homme
      document.getElementById('kDuree').value = '2';   // itemps=3
      document.getElementById('kPosture').value = '1';
      document.getElementById('kCond').value = '0';
      calcKIM();
      return document.getElementById('kimScore').textContent;
    });
    // 3 * (4 + 1 + 0) = 15
    expect(score).toBe('15');
  });
});

test.describe('Responsive', () => {
  for (const [name, size] of Object.entries({
    'petit mobile': { width: 320, height: 600 },
    mobile: { width: 375, height: 800 },
    tablette: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
  })) {
    test(`pas de débordement horizontal — ${name}`, async ({ page }) => {
      await stubChart(page);
      await page.setViewportSize(size);
      await page.goto('/index.html');
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    });
  }

  test('le menu hamburger fonctionne sous 1100px', async ({ page }) => {
    await stubChart(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/index.html');
    await expect(page.locator('#hamburgerBtn')).toBeVisible();
    await page.click('#hamburgerBtn');
    await expect(page.locator('#navTabs')).toHaveClass(/mobile-open/);
  });
});

test.describe('PWA', () => {
  test('expose un manifest et un service worker valides', async ({ page }) => {
    await stubChart(page);
    await page.goto('/index.html');
    const manifestStatus = await page.evaluate(async () => (await fetch('/manifest.json')).status);
    expect(manifestStatus).toBe(200);
    const swStatus = await page.evaluate(async () => (await fetch('/sw.js')).status);
    expect(swStatus).toBe(200);
  });
});
