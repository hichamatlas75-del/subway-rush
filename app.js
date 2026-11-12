/*!
 * Subway Rush — app.js (Version Haute Définition HD)
 * Moteur 3D Canvas HD, Shading Stylisé Cel-Shaded, Jake/Tricky/Ninja, Inspecteur & Chien,
 * Audio Synthesizer WebAudio + BGM Synthwave, Garage/Boutique & Missions, Commandes Tactiles
 */

const $ = i => document.getElementById(i),
      cv = $('c'),
      cx = cv.getContext('2d'),
      OFF = 7.5,
      CY0 = 4.4;

const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
      ld = (k, def = 0) => {
        try {
          const v = localStorage.getItem(k);
          return v != null ? JSON.parse(v) : def;
        } catch (e) { return def; }
      };

const show = e => e && e.classList.remove('hide'),
      hide = e => e.classList.add('hide');

/* ---------- État Global & Sauvegardes ---------- */
let W, H, F, HOR,
    camX = 0, camY = CY0, camZ = 0, pz = 0, tt = 0,
    shake = 0, flash = 0, combo = 0, comboT = 0,
    banked = 0, revived = 0,
    best = ld('sr_best', 0),
    wallet = ld('sr_wallet', 150), // 150 pièces de bienvenue pour tester la boutique !
    boardsStock = ld('sr_boards_stock', 3),
    unlockedChars = ld('sr_chars', ['jake']),
    unlockedBoards = ld('sr_boards', ['classic']),
    activeChar = ld('sr_active_char', 'jake'),
    activeBoard = ld('sr_active_board', 'classic'),
    baseMult = ld('sr_base_mult', 1),
    activeMissions = ld('sr_missions', null),
    touchControlsActive = ld('sr_touch_ctrls', false),
    sfxMute = ld('sr_sfx_mute', false),
    bgmMute = ld('sr_bgm_mute', false),
    AC, sfxGain, bgmGain, bgmInterval,
    last = 0, lastTap = 0, lastTapX = 0, lastTapY = 0;

/* ---------- Initialisation du Moteur ---------- */
const G = new SubwayEngine({ baseMultiplier: baseMult }),
      menu = $('menu'),
      ov = $('over'),
      ps = $('pause'),
      shopModal = $('shop'),
      missionsModal = $('missions-modal'),
      vig = $('vig'),
      touchOverlay = $('touch-controls');

/* Palettes Atmosphériques (Coucher de Soleil, Cyberpunk Nuit, Métropole Jour) */
const THS = [
  { top: [255, 110, 90], hor: [255, 205, 150], side: [80, 64, 96], trk: [96, 88, 110], bld: [130, 84, 124] },
  { top: [8, 12, 38], hor: [70, 56, 130], side: [26, 26, 52], trk: [44, 46, 72], bld: [46, 44, 100] },
  { top: [64, 150, 238], hor: [205, 232, 255], side: [100, 156, 112], trk: [124, 128, 142], bld: [176, 186, 206] }
];

const T = JSON.parse(JSON.stringify(THS[0]));

const EM = { magnet: '🧲', sneakers: '👟', multiplier: '×2', jetpack: '🚀', hoverboard: '🛹' },
      TX = {
        magnet: '🧲 AIMANT MAGNÉTIQUE',
        sneakers: '👟 SUPER BASKETS',
        multiplier: '×2 MULTIPLICATEUR FLASH',
        jetpack: '🚀 TURBO JETPACK',
        hoverboard: '🛹 HOVERBOARD ACTIVÉ'
      },
      DUR = {
        magnet: G.cfg.magnetDuration,
        sneakers: G.cfg.sneakersDuration,
        multiplier: G.cfg.multiplierDuration,
        jetpack: G.cfg.jetpackDuration,
        hoverboard: G.cfg.hoverboardDuration
      };

// Génération des jauges Power-Up dans le HUD
$('pu').innerHTML = '';
for (const k in EM) {
  $('pu').insertAdjacentHTML('beforeend', `<div class="chip" id="p_${k}">${EM[k]}<i><b></b></i></div>`);
}

/* ---------- Redimensionnement & Support Retina / HiDPI ---------- */
function rs() {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  cv.width = Math.floor(W * d);
  cv.height = Math.floor(H * d);
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  cx.setTransform(d, 0, 0, d, 0, 0);
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  F = Math.min(H * 0.92, W * 0.88);
  HOR = H * 0.8 - CY0 * F / OFF;
}
addEventListener('resize', rs);
rs();

/* ---------- Système Audio Synthétisé (Web Audio API) ---------- */
function initAudio() {
  if (AC) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    AC = new AudioCtx();
    sfxGain = AC.createGain();
    sfxGain.gain.setValueAtTime(sfxMute ? 0 : 0.8, AC.currentTime);
    sfxGain.connect(AC.destination);

    bgmGain = AC.createGain();
    bgmGain.gain.setValueAtTime(bgmMute ? 0 : 0.28, AC.currentTime);
    bgmGain.connect(AC.destination);
  } catch (e) {
    console.warn('Audio non supporté:', e);
  }
}

function snd(f1, f2, dur, ty = 'square', vol = 0.08) {
  if (sfxMute) return;
  initAudio();
  if (!AC) return;
  try {
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime,
          o = AC.createOscillator(),
          g = AC.createGain();
    o.type = ty;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + dur);
  } catch (e) {}
}

/* Générateur Synthwave BGM (Basse 80s + Percussion Rythmique) */
let bgmStep = 0;
const BGM_SCALE = [130.81, 146.83, 164.81, 196.00, 220.00, 261.63]; // Gamme Pentatonique C3-C4
function startBGM() {
  if (bgmInterval || bgmMute) return;
  initAudio();
  if (!AC) return;
  bgmInterval = setInterval(() => {
    if (bgmMute || G.state !== 'running') return;
    try {
      const t = AC.currentTime;
      // 1. Synth Bassline
      const baseNote = BGM_SCALE[Math.floor(bgmStep / 4) % BGM_SCALE.length];
      const octNote = (bgmStep % 2 === 0) ? baseNote : baseNote * 1.5;
      const bOsc = AC.createOscillator();
      const bGain = AC.createGain();
      bOsc.type = 'sawtooth';
      bOsc.frequency.setValueAtTime(octNote, t);
      bGain.gain.setValueAtTime(0.09, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      bOsc.connect(bGain);
      bGain.connect(bgmGain);
      bOsc.start(t);
      bOsc.stop(t + 0.16);

      // 2. Synth Hi-hat / Kick
      if (bgmStep % 4 === 0) {
        // Kick doux
        const kOsc = AC.createOscillator();
        const kGain = AC.createGain();
        kOsc.frequency.setValueAtTime(110, t);
        kOsc.frequency.exponentialRampToValueAtTime(30, t + 0.1);
        kGain.gain.setValueAtTime(0.12, t);
        kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        kOsc.connect(kGain);
        kGain.connect(bgmGain);
        kOsc.start(t);
        kOsc.stop(t + 0.1);
      }
      bgmStep = (bgmStep + 1) % 32;
    } catch (e) {}
  }, 170); // ~176 BPM
}

function stopBGM() {
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
}

/* ---------- Projection 3D & Utilitaires Graphiques ---------- */
const pr = (x, y, z) => {
  const s = F / (z - camZ);
  return [W / 2 + (x - camX) * s, HOR + (camY - y) * s, s];
};

const poly = (a, f) => {
  cx.fillStyle = f;
  cx.beginPath();
  cx.moveTo(a[0][0], a[0][1]);
  for (let i = 1; i < a.length; i++) cx.lineTo(a[i][0], a[i][1]);
  cx.closePath();
  cx.fill();
};

const rgb = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;

const fg = (c, sh, d) => {
  const t = Math.min(1, Math.pow(Math.max(0, d) / 135, 1.45)),
        h = T.hor;
  return rgb([0, 1, 2].map(i => Math.min(255, c[i] * sh * (1 - t) + h[i] * t)));
};

const rr = (x, y, w, h, r, f, strokeCol = null, strokeW = 1.2) => {
  cx.fillStyle = f;
  cx.beginPath();
  if (cx.roundRect) cx.roundRect(x, y, w, h, r);
  else cx.rect(x, y, w, h);
  cx.fill();
  if (strokeCol) {
    cx.strokeStyle = strokeCol;
    cx.lineWidth = strokeW;
    cx.stroke();
  }
};

const hs = k => {
  const v = Math.sin(k * 127.1) * 43758.5;
  return v - Math.floor(v);
};

function qd(x0, x1, z0, z1, c, sh = 1) {
  z0 = Math.max(z0, camZ + 0.7);
  if (z1 <= z0) return;
  poly([pr(x0, 0, z0), pr(x1, 0, z0), pr(x1, 0, z1), pr(x0, 0, z1)], fg(c, sh, z0 - camZ));
}

/* Boîte 3D avec Élimination du Clipping Près de Caméra */
function box(x0, x1, y0, y1, z0_raw, z1, c, stroke = false) {
  const z0 = Math.max(z0_raw, camZ + 0.7);
  if (z1 <= z0) return;
  const d = z0 - camZ, P = pr,
        a = P(x0, y0, z0), b = P(x1, y0, z0), e = P(x1, y1, z0), f = P(x0, y1, z0),
        a2 = P(x0, y0, z1), b2 = P(x1, y0, z1), e2 = P(x1, y1, z1), f2 = P(x0, y1, z1);

  if (camX < x0) poly([a, f, f2, a2], fg(c, 0.75, d));
  if (camX > x1) poly([b, e, e2, b2], fg(c, 0.65, d));
  if (camY > y1) poly([f, e, e2, f2], fg(c, 1.18, d));

  // La face avant n'est dessinée QUE si elle se trouve réellement devant le plan de coupe
  if (z0_raw >= camZ + 0.7) {
    poly([a, b, e, f], fg(c, 0.92, d));
    if (stroke) {
      cx.strokeStyle = fg(c, 0.5, d);
      cx.lineWidth = Math.max(1, 0.02 * a[2]);
      cx.stroke();
    }
  }
}

/* ---------- Modèles 3D Haute Définition (Trains, Rampes, Barrières, Items) ---------- */

// 1. Train Urbain Aérodynamique HD avec Phares LED, Climatiseurs & Déco Street-Art
function train(o) {
  const x0 = o.x - o.halfWidth, x1 = o.x + o.halfWidth,
        z0 = o.z, z1 = z0 + o.length,
        zs = Math.max(z0, camZ + 0.7), d = zs - camZ;

  // 4 Livrées de Métro Dynamiques
  const LIVERIES = [
    { base: [214, 48, 49], stripe: [255, 210, 63], text: 'EXPRESS', roof: [70, 75, 90] },
    { base: [9, 132, 227], stripe: [45, 226, 230], text: 'METRO 1', roof: [65, 75, 95] },
    { base: [232, 160, 32], stripe: [255, 255, 255], text: 'SUBWAY', roof: [85, 75, 65] },
    { base: [0, 184, 148], stripe: [255, 210, 63], text: 'CITY RAPID', roof: [60, 80, 75] }
  ];
  const liv = LIVERIES[o.variant % 4];

  // Corps principal du wagon
  box(x0, x1, 0, 3.2, z0, z1, liv.base);

  // Bogies / Roues métalliques sous le wagon
  if (zs > camZ + 0.8) {
    for (let bz = z0 + 2.5; bz < z1 - 1; bz += 5.5) {
      if (bz > camZ + 0.7) {
        box(x0 + 0.05, x1 - 0.05, 0, 0.45, bz, bz + 1.8, [35, 38, 45]);
      }
    }
  }

  // Toit avec Nervures & Unités de Climatisation
  if (camY > 3.2 && z1 > zs) {
    // Unités de climatisation sur le toit
    for (let az = z0 + 3; az < z1 - 3; az += 6) {
      if (az > camZ + 0.7) {
        box(x0 + 0.28, x1 - 0.28, 3.2, 3.48, az, az + 2.2, [80, 85, 95]);
      }
    }
  }

  // Bandes latérales, vitres et graffiti sur les côtés
  if (camX < x0 || camX > x1) {
    const sx = camX < x0 ? x0 : x1;
    // Bande vitrée teintée
    poly([pr(sx, 1.75, zs), pr(sx, 1.75, z1), pr(sx, 2.7, z1), pr(sx, 2.7, zs)], fg([22, 34, 55], 0.95, d));
    // Bande de couleur vive
    poly([pr(sx, 1.15, zs), pr(sx, 1.15, z1), pr(sx, 1.5, z1), pr(sx, 1.5, zs)], fg(liv.stripe, 1.05, d));
  }

  // Face Avant du Train (Pare-brise, Panneau de Ligne, Phares LED Volumétriques)
  if (z0 > camZ + 0.7) {
    // Pare-brise panoramique teinté
    poly([pr(x0 + 0.16, 1.65, z0), pr(x1 - 0.16, 1.65, z0), pr(x1 - 0.16, 2.85, z0), pr(x0 + 0.16, 2.85, z0)], fg([18, 28, 48], 1, d));
    // Reflet diagonal sur le pare-brise
    poly([pr(x0 + 0.25, 2.0, z0), pr(x0 + 0.6, 2.0, z0), pr(x1 - 0.35, 2.75, z0), pr(x1 - 0.7, 2.75, z0)], 'rgba(255, 255, 255, 0.22)');
    // Bandeau lumineux / Destination
    poly([pr(x0 + 0.25, 2.9, z0), pr(x1 - 0.25, 2.9, z0), pr(x1 - 0.25, 3.12, z0), pr(x0 + 0.25, 3.12, z0)], '#ff9f1c');

    // Bande contrastée inférieure
    poly([pr(x0 + 0.08, 1.15, z0), pr(x1 - 0.08, 1.15, z0), pr(x1 - 0.08, 1.45, z0), pr(x0 + 0.08, 1.45, z0)], fg(liv.stripe, 1.1, d));

    // Phares Doubles LED & Faisceaux Volumétriques
    for (const k of [-1, 1]) {
      const q = pr(o.x + k * 0.74, 0.8, z0);
      // Halo lumineux
      cx.fillStyle = 'rgba(255, 248, 180, 0.38)';
      cx.beginPath(); cx.arc(q[0], q[1], 0.34 * q[2], 0, Math.PI * 2); cx.fill();
      // Ampoule LED centrale
      cx.fillStyle = '#fffae0';
      cx.beginPath(); cx.arc(q[0], q[1], 0.18 * q[2], 0, Math.PI * 2); cx.fill();
    }
  }
}

// 2. Rampe d'Accès Métallique HD (Lattes d'adhérence & Barres latérales)
function ramp(o) {
  const x0 = o.x - o.halfWidth, x1 = o.x + o.halfWidth,
        z1 = o.z + o.length, zs = Math.max(o.z, camZ + 0.7);
  if (z1 <= zs) return;
  const ys = 3.2 * (zs - o.z) / o.length, d = zs - camZ, c = [232, 142, 40];

  if (camX < x0) poly([pr(x0, 0, zs), pr(x0, ys, zs), pr(x0, 3.2, z1), pr(x0, 0, z1)], fg(c, 0.72, d));
  if (camX > x1) poly([pr(x1, 0, zs), pr(x1, ys, zs), pr(x1, 3.2, z1), pr(x1, 0, z1)], fg(c, 0.62, d));
  poly([pr(x0, ys, zs), pr(x1, ys, zs), pr(x1, 3.2, z1), pr(x0, 3.2, z1)], fg(c, 1.12, d));

  // Lattes antidérapantes texturées
  for (let i = 1; i < 6; i++) {
    const z = o.z + o.length * i / 6, y = 3.2 * i / 6;
    if (z > zs) {
      poly([pr(x0 + 0.05, y, z), pr(x1 - 0.05, y, z), pr(x1 - 0.05, y + 0.08, z + 0.28), pr(x0 + 0.05, y + 0.08, z + 0.28)], fg([60, 40, 20], 1, d));
    }
  }
}

// 3. Barrière Basse d'Avertissement (Chantier / Rayures Rouges et Blanches)
function low(o) {
  const x0 = o.x - o.halfWidth, x1 = o.x + o.halfWidth;
  box(x0, x1, 0, 0.92, o.z, o.z + 0.8, [240, 240, 245]);
  if (o.z > camZ + 0.7) {
    const d = o.z - camZ, w = (x1 - x0) / 8;
    for (let i = 0; i < 8; i += 2) {
      poly([
        pr(x0 + i * w, 0.08, o.z),
        pr(x0 + (i + 1) * w, 0.08, o.z),
        pr(x0 + (i + 1) * w, 0.84, o.z),
        pr(x0 + i * w, 0.84, o.z)
      ], fg([225, 45, 57], 1.05, d));
    }
  }
}

// 4. Portique Haut Signalétique (Poutre Jaune et Noire sous laquelle Rouler)
function high(o) {
  const x0 = o.x - o.halfWidth, x1 = o.x + o.halfWidth, d = Math.max(o.z, camZ + 0.7) - camZ;
  // Piliers métalliques verticaux
  box(x0, x0 + 0.22, 0, 2.65, o.z, o.z + 0.35, [95, 98, 110]);
  box(x1 - 0.22, x1, 0, 2.65, o.z, o.z + 0.35, [95, 98, 110]);
  // Poutre supérieure transversale
  box(x0, x1, 1.1, 2.65, o.z, o.z + 0.85, [250, 205, 35]);

  if (o.z > camZ + 0.7) {
    const w = (x1 - x0) / 8;
    for (let i = 0; i < 8; i += 2) {
      poly([
        pr(x0 + i * w, 1.12, o.z),
        pr(x0 + (i + 1) * w, 1.12, o.z),
        pr(x0 + (i + 1) * w, 2.62, o.z),
        pr(x0 + i * w, 2.62, o.z)
      ], fg([28, 28, 34], 1, d));
    }
  }
}

// 5. Pièces 3D Tournoyantes & Orbes de Power-Ups Holographiques
function item(c) {
  const d = c.z - camZ;
  if (d < 0.8 || d > 135) return;
  const q = pr(c.x, c.y, c.z), s = q[2];
  cx.globalAlpha = 1 - Math.min(1, Math.max(0, d - 85) / 50) * 0.85;

  if (c.type === 'coin') {
    // Pièce dorée 3D avec biseau, rotation axiale fluide et éclat spéculaire
    const r = 0.35 * s;
    const spin = tt * 5.5 + c.id;
    const w = Math.max(0.08 * r, Math.abs(Math.cos(spin)) * r);

    // Ombre portée sous la pièce
    const qg = pr(c.x, 0, c.z);
    cx.fillStyle = 'rgba(0,0,0,0.25)';
    cx.beginPath();
    cx.ellipse(qg[0], qg[1], 0.32 * qg[2], 0.1 * qg[2], 0, 0, Math.PI * 2);
    cx.fill();

    // Bord externe doré foncé
    cx.fillStyle = '#b36b00';
    cx.beginPath();
    cx.ellipse(q[0], q[1], w + 0.08 * r, r * 1.08, 0, 0, Math.PI * 2);
    cx.fill();

    // Face dorée brillante
    cx.fillStyle = '#ffd23f';
    cx.beginPath();
    cx.ellipse(q[0], q[1], w, r, 0, 0, Math.PI * 2);
    cx.fill();

    // Étoile ou lueur centrale
    if (w > 0.15 * r) {
      cx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      cx.beginPath();
      cx.arc(q[0] - w * 0.25, q[1] - r * 0.3, 0.22 * w, 0, Math.PI * 2);
      cx.fill();
    }
  } else {
    // Orbe de Power-Up holographique avec anneaux énergétiques
    const r = 0.58 * s * (1 + Math.sin(tt * 6) * 0.06);

    // Anneau d'énergie extérieur pulsant
    cx.save();
    cx.strokeStyle = 'rgba(45, 226, 230, 0.65)';
    cx.lineWidth = Math.max(1.5, 0.04 * s);
    cx.beginPath();
    cx.arc(q[0], q[1], r * 1.25, 0, Math.PI * 2);
    cx.stroke();

    // Sphère lumineuse
    cx.shadowColor = '#2de2e6';
    cx.shadowBlur = 18;
    cx.fillStyle = '#ffffff';
    cx.beginPath();
    cx.arc(q[0], q[1], r, 0, Math.PI * 2);
    cx.fill();
    cx.restore();

    // Icône emoji en grand
    cx.font = `${Math.floor(r * 1.25)}px system-ui, sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(EM[c.kind] || '⭐', q[0], q[1] + r * 0.05);
  }
  cx.globalAlpha = 1;
}

/* ---------- VEDETTE JAKE, TRICKY, NINJA & INSPECTEUR + CHIEN (3D Cel-Shaded) ---------- */
function runner(x, y, z, pal, o) {
  const q = pr(x, y, z), s = q[2];
  const isGuard = pal.guard === true;
  const charSkin = isGuard ? 'guard' : (activeChar || 'jake');
  const boardSkin = activeBoard || 'classic';

  const cyc = tt * 19;
  const sw = Math.sin(cyc) * (o.air ? 0.35 : 1);
  const cw = Math.cos(cyc) * (o.air ? 0.25 : 1);
  const bob = o.air ? 0 : Math.abs(Math.sin(cyc)) * 0.09 * s;

  cx.save();
  cx.translate(q[0], q[1] - bob);
  if (o.al != null) cx.globalAlpha = o.al;

  cx.lineJoin = 'round';
  cx.lineCap = 'round';
  cx.strokeStyle = '#141824';
  cx.lineWidth = Math.max(1.4, 0.034 * s);

  // 1. HOVERBOARD HD PERSONNALISABLE AVEC PROPULSEURS NÉON
  if (o.board) {
    cx.save();
    cx.rotate(Math.sin(tt * 9) * 0.06);

    const bProps = {
      classic: { base: '#ff2a85', glow: '#00f5d4', deco: '#ffd23f', trail: '#00f5d4' },
      flame:   { base: '#ff4d00', glow: '#ffd23f', deco: '#ff003c', trail: '#ff7700' },
      cyber:   { base: '#05c46b', glow: '#2de2e6', deco: '#ffffff', trail: '#05c46b' }
    }[boardSkin] || { base: '#ff2a85', glow: '#00f5d4', deco: '#ffd23f', trail: '#00f5d4' };

    cx.shadowColor = bProps.glow;
    cx.shadowBlur = 20;

    // Planche profilée
    cx.fillStyle = bProps.base;
    cx.beginPath();
    cx.ellipse(0, -0.05 * s, 0.54 * s, 0.15 * s, 0, 0, Math.PI * 2);
    cx.fill();
    cx.stroke();

    // Ligne centrale lumineuse
    cx.fillStyle = bProps.glow;
    cx.beginPath();
    cx.ellipse(0, -0.06 * s, 0.40 * s, 0.07 * s, 0, 0, Math.PI * 2);
    cx.fill();

    // Propulseurs inférieurs à sustentation
    for (const k of [-1, 1]) {
      cx.fillStyle = bProps.deco;
      cx.beginPath();
      cx.arc(k * 0.38 * s, 0.01 * s, 0.07 * s, 0, Math.PI * 2);
      cx.fill();
    }

    // Particules de traînée du Hoverboard
    if (Math.random() < 0.6) {
      burst(q[0] + (Math.random() - 0.5) * 0.4 * s, q[1] + 0.1 * s, 2, bProps.trail, 0.8, 0.25);
    }
    cx.restore();
  }

  // 2. ROULADE ACROBATIQUE (Somersault 3D avec arcs de vitesse)
  if (o.roll) {
    cx.save();
    cx.translate(0, -0.45 * s);
    cx.rotate(tt * 24);

    const rCol = charSkin === 'tricky' ? '#2de2e6' : charSkin === 'ninja' ? '#1e293b' : '#e63946';
    cx.fillStyle = rCol;
    cx.beginPath(); cx.arc(0, 0, 0.38 * s, 0, Math.PI * 2); cx.fill(); cx.stroke();

    cx.fillStyle = '#f8f9fa';
    cx.beginPath(); cx.arc(0, -0.12 * s, 0.24 * s, Math.PI, 0); cx.fill(); cx.stroke();

    // Pieds pliés
    for (const k of [-1, 1]) {
      rr(k * 0.22 * s, 0.22 * s, 0.18 * s, 0.12 * s, 0.04 * s, '#ffffff', '#111');
    }
    cx.restore();
    cx.restore();
    return;
  }

  cx.rotate(o.tilt || 0);

  // 3. JAMBES EN PERSPECTIVE (Animations de Course & Baskets Montantes)
  const legs = [
    { side: -1, phase: sw, lift: Math.max(0, -cw) },
    { side: 1,  phase: -sw, lift: Math.max(0, cw) }
  ].sort((a, b) => a.phase - b.phase);

  for (const lg of legs) {
    cx.save();
    const hipX = lg.side * 0.14 * s;
    const hipY = -0.78 * s;
    const strideY = lg.phase * 0.18 * s - lg.lift * 0.22 * s;
    const scaleLeg = 1 + lg.phase * 0.15;

    cx.translate(hipX, hipY);
    cx.rotate(lg.phase * 0.28);

    const pantsCol = isGuard ? '#162447'
      : charSkin === 'tricky' ? '#264653'
      : charSkin === 'ninja' ? '#0f172a'
      : '#1d3557';

    const legH = (0.58 * s) + strideY * 0.5;
    rr(-0.095 * s, 0, 0.19 * s, legH, 0.08 * s, pantsCol, '#141824');

    // Basket Montante (Sneakers classiques ou Super Baskets vert néon)
    cx.translate(0, legH - 0.02 * s);
    cx.scale(scaleLeg * (o.sn ? 1.35 : 1), scaleLeg * (o.sn ? 1.35 : 1));

    const snCol = o.sn ? '#05c46b'
      : isGuard ? '#111111'
      : charSkin === 'tricky' ? '#e76f51'
      : charSkin === 'ninja' ? '#2de2e6'
      : '#e63946';

    rr(-0.12 * s, 0.04 * s, 0.25 * s, 0.10 * s, 0.04 * s, '#ffffff', '#141824');
    rr(-0.11 * s, -0.06 * s, 0.22 * s, 0.12 * s, 0.05 * s, snCol, '#141824');
    cx.fillStyle = '#ffffff';
    cx.fillRect(-0.05 * s, -0.05 * s, 0.1 * s, 0.05 * s);
    cx.restore();
  }

  // 4. JETPACK DOUBLE RÉACTEUR (Flammes & Fumée Animées)
  if (o.jet) {
    cx.save();
    for (const k of [-1, 1]) {
      const tx = k * 0.25 * s;
      rr(tx - 0.1 * s, -1.48 * s, 0.2 * s, 0.6 * s, 0.06 * s, '#cbd5e1', '#141824');
      rr(tx - 0.1 * s, -1.32 * s, 0.2 * s, 0.12 * s, 0.02 * s, '#ff9f1c');

      // Flamme de propulsion dynamique
      const flH = (0.42 + Math.random() * 0.32) * s;
      const grad = cx.createLinearGradient(tx, -0.88 * s, tx, -0.88 * s + flH);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, '#ffd23f');
      grad.addColorStop(1, '#ff3864');
      cx.fillStyle = grad;
      cx.beginPath();
      cx.moveTo(tx - 0.09 * s, -0.88 * s);
      cx.lineTo(tx, -0.88 * s + flH);
      cx.lineTo(tx + 0.09 * s, -0.88 * s);
      cx.closePath();
      cx.fill();

      // Particules d'étincelles du Jetpack
      if (Math.random() < 0.4) {
        burst(q[0] + tx, q[1] - 0.88 * s + flH, 1, '#ff9f1c', 1.2, 0.3);
      }
    }
    cx.restore();
  }

  // 5. BRAS & ACCESSOIRES (Bombe Graff Jake / Matraque Garde / Shuriken Ninja)
  for (const k of [-1, 1]) {
    cx.save();
    const armPhase = -sw * k;
    cx.translate(k * 0.31 * s, -1.38 * s);
    cx.rotate(armPhase * 0.55 + k * 0.12);

    const armSleeveCol = isGuard ? '#1b2a49'
      : charSkin === 'tricky' ? '#2a9d8f'
      : charSkin === 'ninja' ? '#1e293b'
      : '#f8f9fa';

    const armAccentCol = isGuard ? '#1b2a49'
      : charSkin === 'tricky' ? '#e76f51'
      : charSkin === 'ninja' ? '#0f172a'
      : '#e63946';

    rr(-0.075 * s, 0, 0.15 * s, 0.34 * s, 0.06 * s, armSleeveCol, '#141824');
    rr(-0.075 * s, 0.18 * s, 0.15 * s, 0.22 * s, 0.05 * s, armAccentCol);

    // Main
    cx.fillStyle = charSkin === 'ninja' ? '#1e293b' : '#f4a261';
    cx.beginPath();
    cx.arc(0, 0.43 * s, 0.075 * s, 0, Math.PI * 2);
    cx.fill();
    cx.stroke();

    // Accessoire dans la main droite
    if (k === 1) {
      if (isGuard) {
        // Matraque de l'Inspecteur
        cx.translate(0.04 * s, 0.42 * s);
        cx.rotate(-0.6);
        rr(-0.035 * s, -0.28 * s, 0.07 * s, 0.36 * s, 0.03 * s, '#222222');
      } else if (charSkin === 'jake') {
        // Bombe de peinture aérosol emblématique de Jake
        cx.translate(0.03 * s, 0.44 * s);
        cx.rotate(-0.35);
        rr(-0.065 * s, -0.12 * s, 0.13 * s, 0.24 * s, 0.03 * s, '#e63946', '#141824');
        cx.fillStyle = '#ffffff'; cx.fillRect(-0.065 * s, -0.05 * s, 0.13 * s, 0.08 * s);
        cx.fillStyle = '#ced4da'; cx.fillRect(-0.04 * s, -0.16 * s, 0.08 * s, 0.04 * s);
      }
    }
    cx.restore();
  }

  // 6. TORSE (Sweat, Veste, Ceinture et Sac à Dos)
  if (isGuard) {
    rr(-0.31 * s, -1.48 * s, 0.62 * s, 0.74 * s, 0.14 * s, '#1b2a49', '#141824');
    cx.fillStyle = '#ffd23f'; // Ceinturon doré
    cx.fillRect(-0.31 * s, -0.84 * s, 0.62 * s, 0.08 * s);
  } else if (charSkin === 'ninja') {
    rr(-0.29 * s, -1.46 * s, 0.58 * s, 0.72 * s, 0.14 * s, '#0f172a', '#141824');
    rr(-0.25 * s, -1.45 * s, 0.50 * s, 0.62 * s, 0.1 * s, '#1e293b');
    // Ruban cybernétique cyan
    cx.fillStyle = '#2de2e6';
    cx.fillRect(-0.29 * s, -0.92 * s, 0.58 * s, 0.08 * s);
  } else if (charSkin === 'tricky') {
    rr(-0.28 * s, -1.46 * s, 0.56 * s, 0.72 * s, 0.14 * s, '#2a9d8f', '#141824');
    rr(-0.25 * s, -1.45 * s, 0.50 * s, 0.62 * s, 0.1 * s, '#e76f51');
    cx.fillStyle = '#ffd23f';
    cx.beginPath(); cx.arc(0, -1.13 * s, 0.09 * s, 0, Math.PI * 2); cx.fill();
  } else {
    // Jake : Sweat rouge + Veste en jean bleue + Sac à dos
    rr(-0.28 * s, -1.46 * s, 0.56 * s, 0.72 * s, 0.14 * s, '#e63946', '#141824');
    rr(-0.26 * s, -1.45 * s, 0.52 * s, 0.62 * s, 0.1 * s, '#2b5876', '#141824');
    cx.fillStyle = '#1e3c52';
    cx.fillRect(-0.18 * s, -1.44 * s, 0.36 * s, 0.1 * s);
    // Sac à dos rouge
    rr(-0.17 * s, -1.32 * s, 0.34 * s, 0.38 * s, 0.08 * s, '#d62828', '#141824');
    cx.fillStyle = '#ffd23f';
    cx.beginPath(); cx.arc(0, -1.13 * s, 0.09 * s, 0, Math.PI * 2); cx.fill();
  }

  // 7. TÊTE, COIFFE, CASQUETTE / BONNET / MASQUE
  const headOsc = Math.sin(cyc * 0.5) * 0.04;
  cx.save();
  cx.translate(0, -1.72 * s);
  cx.rotate(headOsc);

  if (isGuard) {
    // Tête du Garde avec Casquette Militaire
    cx.fillStyle = '#f4a261';
    cx.beginPath(); cx.arc(0, 0, 0.22 * s, 0, Math.PI * 2); cx.fill(); cx.stroke();
    rr(-0.26 * s, -0.24 * s, 0.52 * s, 0.18 * s, 0.06 * s, '#0f172a');
    cx.fillStyle = '#ffd23f'; // Écusson d'or
    cx.beginPath(); cx.arc(0, -0.15 * s, 0.05 * s, 0, Math.PI * 2); cx.fill();
  } else if (charSkin === 'ninja') {
    // Capuche de Ninja + Visière Cybernétique Néon
    cx.fillStyle = '#0f172a';
    cx.beginPath(); cx.arc(0, -0.02 * s, 0.28 * s, 0, Math.PI * 2); cx.fill(); cx.stroke();
    // Visière lumineuse cyan
    cx.fillStyle = '#2de2e6';
    cx.shadowColor = '#2de2e6';
    cx.shadowBlur = 10;
    rr(-0.18 * s, -0.05 * s, 0.36 * s, 0.08 * s, 0.04 * s, '#2de2e6');
    cx.shadowBlur = 0;
  } else if (charSkin === 'tricky') {
    // Bonnet tricoté Turquoise + Mèches Blondes
    cx.fillStyle = '#f4a261';
    cx.beginPath(); cx.arc(0, 0.02 * s, 0.21 * s, 0, Math.PI * 2); cx.fill(); cx.stroke();
    // Cheveux blonds
    cx.fillStyle = '#ffd23f';
    cx.beginPath(); cx.arc(-0.18 * s, 0.12 * s, 0.08 * s, 0, Math.PI * 2); cx.fill();
    cx.beginPath(); cx.arc(0.18 * s, 0.12 * s, 0.08 * s, 0, Math.PI * 2); cx.fill();
    // Bonnet cyan
    cx.fillStyle = '#2de2e6';
    cx.beginPath(); cx.arc(0, -0.05 * s, 0.26 * s, Math.PI, 0); cx.fill(); cx.stroke();
    rr(-0.24 * s, -0.08 * s, 0.48 * s, 0.10 * s, 0.05 * s, '#00b4d8');
  } else {
    // Jake : Capuche Blanche + Casquette Rouge/Blanche retournée
    rr(-0.2 * s, 0.14 * s, 0.4 * s, 0.12 * s, 0.05 * s, '#d62828');
    cx.fillStyle = '#f1f5f9';
    cx.beginPath(); cx.arc(0, -0.02 * s, 0.29 * s, 0, Math.PI * 2); cx.fill(); cx.stroke();
    // Casquette
    cx.fillStyle = '#e63946';
    cx.beginPath(); cx.arc(0, -0.04 * s, 0.23 * s, Math.PI, 0); cx.fill();
    cx.fillStyle = '#ffffff';
    cx.beginPath(); cx.arc(0, -0.08 * s, 0.15 * s, Math.PI * 1.15, -Math.PI * 0.15); cx.fill();
    rr(-0.24 * s, -0.06 * s, 0.48 * s, 0.08 * s, 0.04 * s, '#d62828', '#141824');
    // Cheveux bruns
    rr(-0.18 * s, 0.02 * s, 0.36 * s, 0.12 * s, 0.04 * s, '#4a2c11');
  }
  cx.restore();

  // 8. CHIEN PITBULL DU GARDE (Court à côté de l'Inspecteur)
  if (isGuard) {
    cx.save();
    cx.translate(0.55 * s, -0.12 * s + Math.abs(sw) * 0.09 * s);
    // Corps du chien
    rr(-0.16 * s, -0.34 * s, 0.32 * s, 0.28 * s, 0.09 * s, '#8d5524', '#141824');
    // Oreilles tombantes
    cx.fillStyle = '#5c3818';
    cx.fillRect(-0.14 * s, -0.44 * s, 0.08 * s, 0.14 * s);
    cx.fillRect(0.06 * s, -0.44 * s, 0.08 * s, 0.14 * s);
    // Collier à pointes
    cx.fillStyle = '#e63946';
    cx.fillRect(-0.15 * s, -0.22 * s, 0.30 * s, 0.05 * s);
    cx.restore();
  }

  cx.restore();
}

/* ---------- Système de Particules & Textes Flottants ---------- */
const PA = [];
const POPUPS = [];

function burst(x, y, n, c, sp = 3, l = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, v = Math.random() * sp * 60;
    PA.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, l, m: l, c, s: 2.5 + Math.random() * 3.5 });
  }
}

function addPopupText(x, y, text, color = '#ffd23f') {
  POPUPS.push({ x, y, text, color, life: 0.85, maxLife: 0.85 });
}

/* ---------- Rendu de la Scène 3D & Environnement Urbain HD ---------- */
function scene(st, dt) {
  const p = st.player, lw = st.laneWidth, HW = 4.2, zb = camZ + 140;

  // 1. Fond du Ciel Dégradé
  let g = cx.createLinearGradient(0, 0, 0, HOR);
  g.addColorStop(0, rgb(T.top));
  g.addColorStop(1, rgb(T.hor));
  cx.fillStyle = g;
  cx.fillRect(-30, -30, W + 60, HOR + 30);

  // 2. Soleil / Lune avec Halo Doux
  g = cx.createRadialGradient(W * 0.7, HOR * 0.55, 0, W * 0.7, HOR * 0.55, F * 0.24);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, HOR);

  // 3. Skyline de Gratte-Ciels avec Fenêtres Allumées
  cx.fillStyle = fg(T.bld, 0.5, 95);
  {
    const sh = camX * 8, b = Math.floor(sh / 36);
    for (let i = -1; i * 36 < W + 36; i++) {
      const bH = H * 0.14 * (0.6 + hs(b + i) * 0.8);
      const bx = i * 36 - (sh - b * 36);
      cx.fillRect(bx, HOR - 8 - bH, 36, bH + 8);

      // Fenêtres allumées
      cx.fillStyle = 'rgba(255, 235, 150, 0.35)';
      for (let wy = HOR - bH + 6; wy < HOR - 6; wy += 9) {
        if (hs(b + i + wy) > 0.4) cx.fillRect(bx + 4, wy, 4, 5);
        if (hs(b + i + wy * 2) > 0.4) cx.fillRect(bx + 14, wy, 4, 5);
        if (hs(b + i + wy * 3) > 0.4) cx.fillRect(bx + 24, wy, 4, 5);
      }
      cx.fillStyle = fg(T.bld, 0.5, 95);
    }
  }

  // 4. Parois et Sol Latéral
  g = cx.createLinearGradient(0, HOR, 0, H);
  g.addColorStop(0, rgb(T.hor));
  g.addColorStop(1, rgb(T.side));
  cx.fillStyle = g;
  cx.fillRect(-30, HOR - 1, W + 60, H - HOR + 30);

  // 5. Bâtiments 3D Proches en Bordure de Voie
  const i0 = Math.floor(camZ / 12);
  for (let i = i0 + 11; i >= i0; i--) {
    for (const sd of [-1, 1]) {
      const h = hs(i * 2 + sd + 9),
            a = sd < 0 ? -(6 + h * 4) - 4 : 6 + h * 4,
            c = T.bld.map(v => v * (0.8 + h * 0.5));
      box(a, a + 4, 0, 5 + hs(i * 3 + sd) * 16, i * 12, i * 12 + 9, c);
    }
  }

  // 6. Plateforme Ferroviaire (Ballast de gravier sombre)
  g = cx.createLinearGradient(0, H, 0, HOR);
  g.addColorStop(0, rgb(T.trk));
  g.addColorStop(1, rgb(T.hor));
  cx.fillStyle = g;
  {
    const a = pr(-HW, 0, camZ + 0.7),
          b = pr(HW, 0, camZ + 0.7),
          c = pr(HW, 0, zb),
          d = pr(-HW, 0, zb);
    cx.beginPath();
    cx.moveTo(a[0], a[1]);
    cx.lineTo(b[0], b[1]);
    cx.lineTo(c[0], c[1]);
    cx.lineTo(d[0], d[1]);
    cx.fill();
  }

  // 7. Traverses de Voie Ferrée (Alignement fluide sans scintillement)
  const tie = T.trk.map(v => v * 0.55);
  const zSleeper0 = Math.floor(camZ / 1.5) * 1.5;
  for (let z = zSleeper0; z < zb; z += 1.5) {
    qd(-HW, HW, z, z + 0.38, tie);
  }

  // 8. Rails Métalliques Doubles par Voie (Continu sans clipping)
  const zRail0 = Math.floor(camZ / 12) * 12;
  for (let z = zRail0; z < zb; z += 12) {
    for (const l of [-1, 0, 1]) {
      for (const s of [-0.72, 0.72]) {
        // Rail d'acier brillant
        qd(l * lw + s - 0.05, l * lw + s + 0.05, z, z + 12, [210, 215, 225], 1.15);
      }
    }
  }

  // 9. Portiques Électriques Aériens & Feux Ferroviaires Tricolores
  const zPylon0 = Math.floor(camZ / 24) * 24;
  for (let z = zPylon0 + 120; z >= zPylon0; z -= 24) {
    // Poteaux latéraux
    box(-HW - 0.9, -HW - 0.7, 0, 6.5, z, z + 0.28, [70, 75, 90]);
    box(HW + 0.7, HW + 0.9, 0, 6.5, z, z + 0.28, [70, 75, 90]);
    // Traverse haute
    box(-HW - 0.9, HW + 0.9, 6.2, 6.5, z, z + 0.28, [65, 70, 85]);

    // Feux de signalisation suspendus au-dessus de chaque voie
    if (z > camZ + 0.8) {
      for (const l of [-1, 0, 1]) {
        const qSig = pr(l * lw, 5.8, z);
        cx.fillStyle = '#0f172a';
        cx.beginPath();
        cx.arc(qSig[0], qSig[1], 0.22 * qSig[2], 0, Math.PI * 2);
        cx.fill();

        // Voyant vert ou rouge
        cx.fillStyle = (l === 0 ? '#05c46b' : '#ff3864');
        cx.beginPath();
        cx.arc(qSig[0], qSig[1], 0.12 * qSig[2], 0, Math.PI * 2);
        cx.fill();
      }
    }
  }

  // 10. File d'attente de rendu 3D triée par profondeur Z
  const L = [];
  for (const o of st.obstacles) {
    const z1 = o.z + o.length;
    if (z1 < camZ + 0.7 || o.z > camZ + 140) continue;
    L.push([o.z > pz - 0.4 ? o.z : z1 < pz - 0.4 ? z1 : pz, o]);
  }
  for (const c of st.collectibles) {
    if (!c.taken && c.z > camZ + 0.8 && c.z < camZ + 130) L.push([c.z, c]);
  }
  L.push([pz - 0.1, 'P']);
  if (st.chaser.active || (st.status === 'over' && G.lastReason === 'caught')) {
    L.push([pz - 3.4, 'C']);
  }
  L.sort((a, b) => b[0] - a[0]);

  // Rendu des Objets du plus éloigné au plus proche
  for (const [, o] of L) {
    if (o === 'P') {
      // Ombre portée au sol ou sur le toit de train
      let gy = 0;
      for (const b of st.obstacles) {
        if (b.type === 'train' && Math.abs(b.x - p.x) < b.halfWidth && pz >= b.z && pz <= b.z + b.length && p.y >= 2.9) {
          gy = 3.2;
        }
      }
      const q = pr(p.x, gy, pz), k = 1 / (1 + (p.y - gy) * 0.35);
      cx.fillStyle = 'rgba(0,0,0,0.38)';
      cx.beginPath();
      cx.ellipse(q[0], q[1], 0.46 * q[2] * k, 0.14 * q[2] * k, 0, 0, Math.PI * 2);
      cx.fill();

      // Vedette Joueur
      runner(p.x, p.y, pz, { guard: false }, {
        roll: p.rolling,
        air: !p.grounded,
        board: st.powerups.hoverboard > 0,
        jet: st.powerups.jetpack > 0,
        sn: st.powerups.sneakers > 0,
        tilt: st.status === 'over' ? 1.3 : p.state === 'stumble' ? 0.25 * Math.sin(tt * 30) : (p.lane * lw - p.x) * -0.14,
        al: st.invulnerable && st.status === 'running' && Math.floor(tt * 14) % 2 ? 0.45 : 1
      });
    } else if (o === 'C') {
      runner(p.x, 0, pz - 3.4, { guard: true }, {});
    } else if (o.type === 'train') train(o);
    else if (o.type === 'ramp') ramp(o);
    else if (o.type === 'low') low(o);
    else if (o.type === 'high') high(o);
    else item(o);
  }

  // 11. Particules Actives (Étincelles, Fumée, Poussière)
  for (let i = PA.length - 1; i >= 0; i--) {
    const q = PA[i];
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy += 420 * dt;
    q.l -= dt;
    if (q.l <= 0) { PA.splice(i, 1); continue; }
    cx.globalAlpha = q.l / q.m;
    cx.fillStyle = q.c;
    cx.fillRect(q.x, q.y, q.s, q.s);
  }

  // 12. Textes Flottants ("+10", "COMBO ×5!")
  for (let i = POPUPS.length - 1; i >= 0; i--) {
    const pop = POPUPS[i];
    pop.y -= 38 * dt;
    pop.life -= dt;
    if (pop.life <= 0) { POPUPS.splice(i, 1); continue; }
    cx.globalAlpha = pop.life / pop.maxLife;
    cx.font = '900 18px system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.fillStyle = pop.color;
    cx.shadowColor = '#000';
    cx.shadowBlur = 6;
    cx.fillText(pop.text, pop.x, pop.y);
    cx.shadowBlur = 0;
  }
  cx.globalAlpha = 1;
}

/* ---------- Boucle de Dessin et Caméra ---------- */
function draw(st, dt) {
  const p = st.player;
  pz = p.z + (st.status === 'running' ? st.speed * st.alpha / 60 : 0);
  camZ = pz - OFF;
  camX += (p.x * 0.55 - camX) * Math.min(1, dt * 6);
  camY += (CY0 + Math.min(p.y, 7) * 0.35 - camY) * Math.min(1, dt * 4);

  // Transition douce des ambiances selon la distance
  const tg = THS[Math.floor(st.distance / 1200) % 3];
  for (const k in T) {
    T[k] = T[k].map((v, i) => v + (tg[k][i] - v) * Math.min(1, dt * 0.6));
  }

  // Effacement propre du canvas (évite les bordures fantômes lors des secousses)
  cx.clearRect(0, 0, W, H);

  cx.save();
  if (shake > 0) {
    cx.translate((Math.random() - 0.5) * shake * 22, (Math.random() - 0.5) * shake * 22);
    shake = Math.max(0, shake - dt * 1.8);
  }
  scene(st, dt);
  cx.restore();

  if (flash > 0) {
    cx.fillStyle = `rgba(255, 40, 40, ${flash * 0.45})`;
    cx.fillRect(0, 0, W, H);
    flash -= dt * 1.5;
  }
}

/* ---------- HUD & Mises à Jour ---------- */
const setTxt = (e, v) => { if (e && e._v !== v) { e._v = v; e.textContent = v; } };

function hud(st) {
  $('hud').style.visibility = st.status === 'ready' ? 'hidden' : 'visible';
  if (vig) vig.classList.toggle('danger-chase', st.chaser.active && st.status === 'running');

  setTxt($('sc'), st.score);
  setTxt($('ds'), st.distance + ' m' + (st.chaser.active ? ' · 🚨 GARDE' : ''));
  setTxt($('cn'), '🪙 ' + st.coins);
  setTxt($('mult-pill'), '×' + st.multiplier);
  setTxt($('boards-count'), '🛹 ×' + boardsStock);
  setTxt($('bh-badge'), boardsStock);

  for (const k in EM) {
    const c = $('p_' + k), v = st.powerups[k];
    if (c) {
      c.style.display = v > 0 ? 'flex' : 'none';
      if (v > 0) c.querySelector('b').style.transform = `scaleX(${v / DUR[k]})`;
    }
  }
}

function toast(t) {
  const e = $('toast');
  if (!e) return;
  e.textContent = t;
  e.classList.remove('go');
  void e.offsetWidth;
  e.classList.add('go');
}

function menuInfo() {
  if ($('best')) $('best').textContent = `🏆 Record : ${best}   ·   🪙 Banque : ${wallet}`;
  if ($('menu-mult-text')) $('menu-mult-text').textContent = `NIVEAU ×${baseMult}`;
  if ($('menu-mission-sub')) {
    const m = getActiveMissions();
    const doneCount = m.filter(x => x.progress >= x.target).length;
    $('menu-mission-sub').textContent = `${doneCount}/3 Missions complétées · Multiplicateur permanent ×${baseMult}`;
  }
}

/* ---------- Système de Missions & Multiplicateur Permanent ---------- */
const MISSION_TEMPLATES = [
  { id: 'coins', desc: 'Ramasser %n pièces d’or', target: 50, stat: 'coins' },
  { id: 'jumps', desc: 'Effectuer %n sauts', target: 12, stat: 'jumps' },
  { id: 'dist', desc: 'Courir %n mètres en une partie', target: 600, stat: 'distance' },
  { id: 'rolls', desc: 'Réaliser %n roulades', target: 8, stat: 'rolls' },
  { id: 'powerups', desc: 'Attraper %n bonus', target: 3, stat: 'powerups' }
];

function getActiveMissions() {
  if (!activeMissions || !activeMissions.length) {
    activeMissions = [
      { id: 'coins', desc: 'Ramasser 60 pièces', target: 60, progress: 0 },
      { id: 'jumps', desc: 'Effectuer 12 sauts', target: 12, progress: 0 },
      { id: 'dist', desc: 'Courir 600 mètres', target: 600, progress: 0 }
    ];
    sv('sr_missions', activeMissions);
  }
  return activeMissions;
}

function checkMissionProgress(gameStats) {
  let changed = false;
  const list = getActiveMissions();
  for (const m of list) {
    let currentVal = 0;
    if (m.id === 'coins') currentVal = gameStats.coins || 0;
    else if (m.id === 'dist') currentVal = gameStats.distance || 0;
    else if (m.id === 'jumps') currentVal = (gameStats.stats && gameStats.stats.jumps) || 0;
    else if (m.id === 'rolls') currentVal = (gameStats.stats && gameStats.stats.rolls) || 0;
    else if (m.id === 'powerups') currentVal = (gameStats.stats && gameStats.stats.powerups) || 0;

    if (currentVal > m.progress) {
      m.progress = Math.min(m.target, currentVal);
      changed = true;
    }
  }

  // Vérifier si toutes les missions sont complétées pour monter de niveau !
  if (list.every(x => x.progress >= x.target)) {
    baseMult = Math.min(30, baseMult + 1);
    sv('sr_base_mult', baseMult);
    G.setBaseMultiplier(baseMult);
    toast(`🎉 NOUVEAU MULTIPLICATEUR : ×${baseMult} !`);
    snd(523, 1046, 0.45, 'triangle', 0.15);

    // Nouvelle série de missions plus exigeantes
    activeMissions = [
      { id: 'coins', desc: `Ramasser ${60 + baseMult * 20} pièces`, target: 60 + baseMult * 20, progress: 0 },
      { id: 'jumps', desc: `Effectuer ${12 + baseMult * 4} sauts`, target: 12 + baseMult * 4, progress: 0 },
      { id: 'dist', desc: `Courir ${600 + baseMult * 250} mètres`, target: 600 + baseMult * 250, progress: 0 }
    ];
    changed = true;
  }

  if (changed) {
    sv('sr_missions', activeMissions);
    menuInfo();
  }
}

function renderMissionsModal() {
  if ($('missions-mult-display')) $('missions-mult-display').textContent = `×${baseMult}`;
  const list = getActiveMissions();
  const container = $('missions-list');
  if (!container) return;
  container.innerHTML = '';
  list.forEach(m => {
    const isDone = m.progress >= m.target;
    const pct = Math.min(100, Math.floor((m.progress / m.target) * 100));
    container.insertAdjacentHTML('beforeend', `
      <div class="mission-card ${isDone ? 'done' : ''}">
        <div class="mission-top">
          <span class="mission-desc">${m.desc}</span>
          <span class="mission-progress-text">${isDone ? '✓ ACCOMPLI' : `${m.progress} / ${m.target}`}</span>
        </div>
        <div class="mission-bar-track">
          <div class="mission-bar-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `);
  });
}

/* ---------- Système de Boutique & Garage ---------- */
const SHOP_DATA = {
  chars: [
    { id: 'jake', name: 'Jake', desc: 'Le graffeur vedette emblématique', price: 0, icon: '🧢' },
    { id: 'tricky', name: 'Tricky', desc: 'La skater aux tricks audacieux', price: 500, icon: '👧' },
    { id: 'ninja', name: 'Ninja', desc: 'Shinobi cybernétique ultra-agile', price: 1200, icon: '🥷' }
  ],
  boards: [
    { id: 'classic', name: 'Neon Wave', desc: 'Planche rose néon classique', price: 0, icon: '🛹' },
    { id: 'flame', name: 'Flame Rider', desc: 'Laisse une traînée de feu ardent', price: 400, icon: '🔥' },
    { id: 'cyber', name: 'Cyber Glide', desc: 'Lévitation électro vert matrix', price: 800, icon: '⚡' }
  ],
  upgrades: [
    { id: 'pack_boards', name: 'Pack 3 Hoverboards', desc: 'Recharge 3 skates de protection', price: 100, icon: '🛹' },
    { id: 'perm_mult', name: 'Multiplicateur +1', desc: 'Augmente définitivement votre score', price: 600, icon: '⭐' }
  ]
};

let currentShopTab = 'chars';

function renderShop() {
  if ($('shop-wallet')) $('shop-wallet').textContent = `🪙 ${wallet} Pièces disponibles`;
  const cont = $('shop-content');
  if (!cont) return;
  cont.innerHTML = '';

  const items = SHOP_DATA[currentShopTab] || [];
  items.forEach(it => {
    let isOwned = false;
    let isEquipped = false;

    if (currentShopTab === 'chars') {
      isOwned = unlockedChars.includes(it.id);
      isEquipped = activeChar === it.id;
    } else if (currentShopTab === 'boards') {
      isOwned = unlockedBoards.includes(it.id);
      isEquipped = activeBoard === it.id;
    }

    let actionBtnHtml = '';
    if (currentShopTab === 'upgrades') {
      actionBtnHtml = `<button class="m shop-buy-btn" onclick="buyShopItem('${it.id}', ${it.price})">Acheter · ${it.price} 🪙</button>`;
    } else if (isEquipped) {
      actionBtnHtml = `<button class="m shop-buy-btn equipped-btn" disabled>Équipé ✓</button>`;
    } else if (isOwned) {
      actionBtnHtml = `<button class="m shop-buy-btn" onclick="selectShopItem('${it.id}')">Choisir</button>`;
    } else {
      actionBtnHtml = `<button class="m shop-buy-btn" onclick="buyShopItem('${it.id}', ${it.price})">${it.price} 🪙</button>`;
    }

    cont.insertAdjacentHTML('beforeend', `
      <div class="shop-item-card ${isEquipped ? 'equipped' : ''}">
        <div class="item-left">
          <div class="item-icon-box">${it.icon}</div>
          <div class="item-meta">
            <h4>${it.name}</h4>
            <p>${it.desc}</p>
          </div>
        </div>
        ${actionBtnHtml}
      </div>
    `);
  });
}

window.selectShopItem = id => {
  if (currentShopTab === 'chars') {
    activeChar = id;
    sv('sr_active_char', activeChar);
  } else if (currentShopTab === 'boards') {
    activeBoard = id;
    sv('sr_active_board', activeBoard);
  }
  snd(440, 880, 0.1, 'triangle', 0.08);
  renderShop();
};

window.buyShopItem = (id, price) => {
  if (wallet < price) {
    snd(180, 80, 0.25, 'sawtooth', 0.12);
    toast('🪙 Pièces insuffisantes !');
    return;
  }
  wallet -= price;
  sv('sr_wallet', wallet);
  snd(587, 1174, 0.22, 'triangle', 0.12);

  if (id === 'pack_boards') {
    boardsStock += 3;
    sv('sr_boards_stock', boardsStock);
    toast('🛹 +3 Hoverboards ajoutés !');
  } else if (id === 'perm_mult') {
    baseMult += 1;
    sv('sr_base_mult', baseMult);
    G.setBaseMultiplier(baseMult);
    toast(`⭐ Multiplicateur permanent : ×${baseMult} !`);
  } else if (currentShopTab === 'chars') {
    unlockedChars.push(id);
    sv('sr_chars', unlockedChars);
    activeChar = id;
    sv('sr_active_char', activeChar);
    toast('👤 Nouveau personnage débloqué !');
  } else if (currentShopTab === 'boards') {
    unlockedBoards.push(id);
    sv('sr_boards', unlockedBoards);
    activeBoard = id;
    sv('sr_active_board', activeBoard);
    toast('🛹 Nouveau Hoverboard débloqué !');
  }

  menuInfo();
  renderShop();
};

/* Onglets de la Boutique */
document.querySelectorAll('.shop-tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.shop-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentShopTab = btn.getAttribute('data-tab');
    renderShop();
  };
});

/* ---------- Événements du Moteur SubwayEngine ---------- */
G.on('coin', e => {
  comboT = 0.7;
  combo = Math.min(combo + 1, 10);
  // Arpège pentatonique ascendant
  const pNote = BGM_SCALE[(combo - 1) % BGM_SCALE.length] * 4;
  snd(pNote, pNote * 1.5, 0.08, 'square', 0.035);

  const q = pr(e.x, e.y, e.z);
  burst(q[0], q[1], 7, '#ffd23f', 1.4, 0.4);
  if (combo > 3 && combo % 3 === 0) {
    addPopupText(q[0], q[1] - 15, `COMBO ×${combo}!`, '#ffd23f');
  }
});

G.on('jump', e => {
  if (e.sneakers) {
    snd(280, 950, 0.25, 'sine', 0.12);
    toast('👟 SUPER REBOND !');
  } else {
    snd(320, 740, 0.18, 'sine', 0.09);
  }
});

G.on('roll', () => snd(520, 110, 0.2, 'sawtooth', 0.04));
G.on('laneChange', () => snd(420, 560, 0.05, 'triangle', 0.05));

G.on('land', e => {
  snd(120, 50, 0.1, 'sine', 0.09);
  const q = pr(G.player.x, G.player.y, pz);
  burst(q[0], q[1], 8, '#ccc', 0.8, 0.35);
});

G.on('stumble', () => {
  shake = 0.55; flash = 0.5;
  snd(180, 40, 0.4, 'sawtooth', 0.15);
  toast('🚨 ATTENTION AU GARDE !');
  if (navigator.vibrate) navigator.vibrate(80);
});

G.on('shieldBreak', () => {
  shake = 0.35;
  snd(900, 120, 0.35, 'triangle', 0.14);
  toast('🛹 HOVERBOARD DÉTRUIT !');
  const q = pr(G.player.x, G.player.y, pz);
  burst(q[0], q[1], 16, '#2de2e6', 2.2, 0.6);
});

G.on('powerup', e => {
  snd(500, 1500, 0.32, 'triangle', 0.11);
  toast(TX[e.kind]);
});

G.on('pause', () => {
  stopBGM();
  show(ps);
});

G.on('resume', () => {
  startBGM();
  hide(ps);
});

G.on('gameOver', e => {
  G.lastReason = e.reason;
  shake = 1.1; flash = 0.85;
  stopBGM();
  snd(220, 25, 0.9, 'sawtooth', 0.22);
  if (navigator.vibrate) navigator.vibrate([120, 60, 160]);
  setTimeout(() => over(e), 850);
});

/* ---------- Écran Game Over ---------- */
function over(e) {
  if (G.state !== 'over') return;
  const newCoins = e.coins - banked;
  wallet += newCoins;
  banked = e.coins;
  sv('sr_wallet', wallet);

  checkMissionProgress(e);

  const rec = e.score > best;
  if (rec) {
    best = e.score;
    sv('sr_best', best);
    // Confettis de record !
    burst(W / 2, H * 0.4, 30, '#ffd23f', 4, 1.2);
    burst(W / 2, H * 0.4, 30, '#2de2e6', 4, 1.2);
  }

  if ($('over-tag')) $('over-tag').textContent = e.reason === 'crash' ? '💥 COLLISION FRONTALE' : '🚨 INTERPELLATION';
  $('why').textContent = e.reason === 'crash' ? 'Percuté par un train !' : 'Le garde t’a rattrapé !';

  $('st').innerHTML = `
    <div class="stat-cell"><span>Score</span><b>${e.score}</b></div>
    <div class="stat-cell"><span>Distance</span><b>${e.distance} m</b></div>
    <div class="stat-cell"><span>Pièces</span><b>🪙 ${e.coins}</b></div>`;

  const s = e.stats || {};
  if ($('telemetry')) {
    $('telemetry').textContent = `Sauts: ${s.jumps || 0} · Roulades: ${s.rolls || 0} · Voies: ${s.laneChanges || 0} · Bonus: ${s.powerups || 0}`;
  }

  $('rc').textContent = rec ? '🏆 NOUVEAU RECORD PERSONNEL !' : `Record actuel : ${best} · Banque : 🪙 ${wallet}`;

  const r = $('rev');
  r.style.display = revived ? 'none' : '';
  r.disabled = wallet < 50;

  show(ov);
}

/* ---------- Lancement & Contrôles ---------- */
function play() {
  hide(menu); hide(ov); hide(ps); hide(shopModal); hide(missionsModal);
  banked = 0; revived = 0; combo = 0; PA.length = 0; POPUPS.length = 0;
  snd(440, 880, 0.12, 'triangle', 0.08);
  startBGM();
  G.setBaseMultiplier(baseMult);
  G.restart();
}

function tryBoard() {
  if (G.state === 'running' && G.powerups.hoverboard <= 0) {
    if (boardsStock > 0) {
      boardsStock--;
      sv('sr_boards_stock', boardsStock);
      setTxt($('boards-count'), '🛹 ×' + boardsStock);
      setTxt($('bh-badge'), boardsStock);
      G.activatePowerup('hoverboard');
    } else {
      toast('🛒 Aucun Skate en stock !');
      snd(200, 100, 0.18, 'sawtooth', 0.08);
    }
  }
}

/* Boutons UI & Navigation */
$('play').onclick = $('again').onclick = play;

$('rev').onclick = () => {
  if (wallet >= 50 && !revived) {
    wallet -= 50;
    sv('sr_wallet', wallet);
    revived = 1;
    hide(ov);
    startBGM();
    G.revive();
  }
};

$('home').onclick = $('quit').onclick = () => {
  stopBGM();
  G.reset();
  hide(ov); hide(ps); hide(shopModal); hide(missionsModal);
  show(menu);
  menuInfo();
};

$('resume').onclick = () => G.resume();

$('bp').onclick = () => {
  G.state === 'running' ? G.pause() : G.resume();
};

// Contrôle Effets Sonores (SFX)
$('bm').onclick = e => {
  sfxMute = !sfxMute;
  sv('sr_sfx_mute', sfxMute);
  if (sfxGain && AC) sfxGain.gain.setValueAtTime(sfxMute ? 0 : 0.8, AC.currentTime);
  e.currentTarget.textContent = sfxMute ? '🔇' : '🔊';
};
if (sfxMute) $('bm').textContent = '🔇';

// Contrôle Musique (BGM)
$('bmusic').onclick = e => {
  bgmMute = !bgmMute;
  sv('sr_bgm_mute', bgmMute);
  if (bgmGain && AC) bgmGain.gain.setValueAtTime(bgmMute ? 0 : 0.28, AC.currentTime);
  e.currentTarget.textContent = bgmMute ? '🎵❌' : '🎵';
  if (!bgmMute && G.state === 'running') startBGM();
  else if (bgmMute) stopBGM();
};
if (bgmMute) $('bmusic').textContent = '🎵❌';

// Bouton Hoverboard
$('bh').onclick = tryBoard;

// Boutons Boutique & Missions
$('open-shop').onclick = $('over-shop').onclick = $('pause-shop').onclick = () => {
  renderShop();
  show(shopModal);
};
$('close-shop').onclick = () => hide(shopModal);

$('open-missions').onclick = () => {
  renderMissionsModal();
  show(missionsModal);
};
$('close-missions').onclick = () => hide(missionsModal);

/* Toggle Commandes Tactiles à l'écran */
$('btouch').onclick = () => {
  touchControlsActive = !touchControlsActive;
  sv('sr_touch_ctrls', touchControlsActive);
  touchOverlay.classList.toggle('hide', !touchControlsActive);
  toast(touchControlsActive ? '🎮 Boutons tactiles activés' : '🎮 Mode Balayage pur');
};
if (touchControlsActive) touchOverlay.classList.remove('hide');

// Liaison des boutons tactiles virtuels
$('t-left').onclick = () => G.input('left');
$('t-right').onclick = () => G.input('right');
$('t-up').onclick = () => G.input('jump');
$('t-down').onclick = () => G.input('roll');

/* Enregistrement des Entrées Clavier & Touch Native */
SubwayInput.keyboard(G);
SubwayInput.touch(G, cv);

addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    if (!menu.classList.contains('hide') || !ov.classList.contains('hide')) play();
  } else if (e.key.toLowerCase() === 'h') {
    tryBoard();
  }
});

// Détection propre du double-tap sur le canvas (uniquement si ce n'est pas un swipe)
cv.addEventListener('touchstart', e => {
  if (!e.touches.length) return;
  const n = Date.now();
  const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
  const dist = Math.hypot(tx - lastTapX, ty - lastTapY);
  if (n - lastTap < 290 && dist < 35) {
    tryBoard();
  }
  lastTap = n;
  lastTapX = tx;
  lastTapY = ty;
}, { passive: true });

// Gestion de la visibilité d'onglet
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'running') G.pause();
});
addEventListener('blur', () => {
  if (G.state === 'running') G.pause();
});

/* ---------- Boucle Principale 60 FPS ---------- */
function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  tt += dt;
  if ((comboT -= dt) <= 0) combo = 0;

  G.update(dt);
  const st = G.getState();
  draw(st, dt);
  hud(st);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
menuInfo();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
