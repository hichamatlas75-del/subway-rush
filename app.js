/*!
 * Subway Rush HD — app.js (Version Complète Ultra HD)
 * Moteur 3D Canvas HD, Shading Stylisé Cel-Shaded, 4 Personnages (Jake, Tricky, Ninja, Lucy),
 * Inspecteur & Chien, Audio WebAudio + BGM Synthwave, Garage/Boutique, Missions & Multiplicateur,
 * Calendrier Journalier, Boîtes Mystères 3D, Câblage Caténaire, Support Manette Gamepad.
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
    wallet = ld('sr_wallet', 200),
    boardsStock = ld('sr_boards_stock', 3),
    unlockedChars = ld('sr_chars', ['ren']),
    unlockedBoards = ld('sr_boards', ['classic']),
    activeChar = ld('sr_active_char', 'ren'),
    activeBoard = ld('sr_active_board', 'classic'),
    baseMult = ld('sr_base_mult', 1),
    activeMissions = ld('sr_missions', null),
    puLevels = ld('sr_pu_levels', { magnet: 1, sneakers: 1, multiplier: 1, jetpack: 1 }),
    dailyStreak = ld('sr_daily_streak', 0),
    lastDailyClaim = ld('sr_daily_last', 0),
    graphicsQuality = ld('sr_quality', 'high'),
    sfxVol = ld('sr_sfx_vol', 0.8),
    bgmVol = ld('sr_bgm_vol', 0.3),
    touchControlsActive = ld('sr_touch_ctrls', false),
    activeBgmTrack = ld('sr_bgm_track', 'shinobi'),
    sfxMute = ld('sr_sfx_mute', false),
    bgmMute = ld('sr_bgm_mute', false),
    mysteryBoxesInRun = 0,
    pendingHeadstart = null,
    AC, sfxGain, bgmGain, bgmFilter, bgmAmbGain, bgmInterval, ambientPadTimer,
    gamepadConnected = false,
    gpLastState = { left: false, right: false, up: false, down: false, btnA: false, btnB: false, btnH: false, btnP: false, btnY: false },
    last = 0, lastTap = 0, lastTapX = 0, lastTapY = 0;

// Migration transparente des anciens profils vers les Héros Anime Japonais (Ren, Hikari, Kuro, Ryu)
const LEGACY_CHAR_MAP = { jake: 'ren', tricky: 'hikari', ninja: 'kuro', lucy: 'ryu' };
if (LEGACY_CHAR_MAP[activeChar]) activeChar = LEGACY_CHAR_MAP[activeChar];
unlockedChars = (unlockedChars || []).map(c => LEGACY_CHAR_MAP[c] || c);
if (!unlockedChars.includes('ren')) unlockedChars.unshift('ren');
sv('sr_active_char', activeChar);
sv('sr_chars', unlockedChars);

/* ---------- Initialisation du Moteur ---------- */
const G = new SubwayEngine({ baseMultiplier: baseMult }),
      menu = $('menu'),
      ov = $('over'),
      ps = $('pause'),
      shopModal = $('shop'),
      missionsModal = $('missions-modal'),
      dailyModal = $('daily-modal'),
      mysteryModal = $('mystery-modal'),
      settingsModal = $('settings-modal'),
      vig = $('vig'),
      speedFx = $('speed-fx'),
      touchOverlay = $('touch-controls'),
      milestoneBanner = $('milestone-banner');

/* Application des Durées Améliorées des Power-Ups */
function applyUpgradedDurations() {
  G.setPowerupDuration('magnet', 10 + (puLevels.magnet - 1) * 2.5);
  G.setPowerupDuration('sneakers', 12 + (puLevels.sneakers - 1) * 2.5);
  G.setPowerupDuration('multiplier', 15 + (puLevels.multiplier - 1) * 3);
  G.setPowerupDuration('jetpack', 6 + (puLevels.jetpack - 1) * 1.5);
}
applyUpgradedDurations();

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
      };

// Génération des puces Power-Up dans le HUD
$('pu').innerHTML = '';
for (const k in EM) {
  $('pu').insertAdjacentHTML('beforeend', `<div class="chip" id="p_${k}">${EM[k]}<i><b></b></i></div>`);
}

/* ---------- Redimensionnement & HiDPI ---------- */
function rs() {
  const d = Math.min(window.devicePixelRatio || 1, graphicsQuality === 'ultra' ? 2.5 : 2);
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

/* ---------- Audio Synthétisé & Moteur Musical d'Ambiance (Web Audio API) ---------- */
function initAudio() {
  if (AC) {
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return;
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    AC = new AudioCtx();
    
    // SFX Bus
    sfxGain = AC.createGain();
    sfxGain.gain.setValueAtTime(sfxMute ? 0 : sfxVol, AC.currentTime);
    sfxGain.connect(AC.destination);

    // BGM Master Filter (Filtre dynamique pour ambiance et Overdrive)
    bgmFilter = AC.createBiquadFilter();
    bgmFilter.type = 'lowpass';
    bgmFilter.frequency.setValueAtTime(2200, AC.currentTime);
    bgmFilter.Q.setValueAtTime(1.8, AC.currentTime);
    bgmFilter.connect(AC.destination);

    // BGM Rhythm / Melodic Bus
    bgmGain = AC.createGain();
    bgmGain.gain.setValueAtTime(bgmMute ? 0 : bgmVol, AC.currentTime);
    bgmGain.connect(bgmFilter);

    // BGM Ambient Pad Bus (Nappes chaleureuses et planantes)
    bgmAmbGain = AC.createGain();
    bgmAmbGain.gain.setValueAtTime(bgmMute ? 0 : (bgmVol * 0.45), AC.currentTime);
    bgmAmbGain.connect(bgmFilter);
  } catch (e) {
    console.warn('Audio non supporté:', e);
  }
}

function snd(f1, f2, dur, ty = 'square', vol = 0.08) {
  if (sfxMute) return;
  initAudio();
  if (!AC) return;
  try {
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    const t = AC.currentTime,
          o = AC.createOscillator(),
          g = AC.createGain();
    o.type = ty;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol * (sfxVol / 0.8), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + dur);
  } catch (e) {}
}

/* 3 Pistes Musicales d'Ambiance Synthwave & Cyber-Shinobi */
const BGM_TRACKS = {
  shinobi: {
    name: 'Cyber Shinobi 🥷',
    bpm: 124,
    chords: [
      [220.00, 261.63, 329.63, 493.88], // Am9
      [174.61, 261.63, 329.63, 440.00], // Fmaj7
      [146.83, 220.00, 261.63, 329.63], // Dm9
      [164.81, 196.00, 246.94, 329.63]  // Em7
    ],
    bassRoots: [110.00, 87.31, 73.42, 82.41],
    lead: [
      440, 0, 523.25, 0, 587.33, 0, 659.25, 659.25,
      0, 587.33, 0, 523.25, 493.88, 0, 440, 0,
      659.25, 0, 698.46, 0, 783.99, 0, 659.25, 0,
      587.33, 0, 523.25, 493.88, 440, 0, 0, 0,
      440, 0, 659.25, 0, 587.33, 0, 523.25, 0,
      493.88, 0, 523.25, 0, 440, 440, 0, 0,
      329.63, 0, 440, 0, 523.25, 0, 587.33, 0,
      659.25, 0, 783.99, 0, 880, 0, 0, 0
    ],
    arpScale: [220, 261.63, 329.63, 440, 493.88, 523.25, 659.25, 880]
  },
  tokyo: {
    name: 'Néo-Tokyo 🌸',
    bpm: 116,
    chords: [
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [196.00, 246.94, 293.66, 392.00], // G6
      [164.81, 196.00, 246.94, 329.63], // Em7
      [220.00, 261.63, 329.63, 392.00]  // Am7
    ],
    bassRoots: [87.31, 98.00, 82.41, 110.00],
    lead: [
      329.63, 0, 392.00, 0, 440.00, 0, 523.25, 0,
      493.88, 0, 392.00, 0, 329.63, 0, 0, 0,
      261.63, 0, 293.66, 0, 329.63, 0, 392.00, 0,
      440.00, 0, 523.25, 0, 493.88, 0, 0, 0,
      523.25, 0, 587.33, 0, 659.25, 0, 523.25, 0,
      440.00, 0, 392.00, 0, 329.63, 0, 0, 0,
      392.00, 0, 440.00, 0, 493.88, 0, 523.25, 0,
      440.00, 0, 0, 0, 0, 0, 0, 0
    ],
    arpScale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25]
  },
  overdrive: {
    name: 'Overdrive ⚡',
    bpm: 132,
    chords: [
      [146.83, 220.00, 293.66, 349.23], // Dm
      [116.54, 174.61, 233.08, 293.66], // Bbmaj7
      [130.81, 196.00, 261.63, 329.63], // C
      [110.00, 164.81, 220.00, 277.18]  // A7
    ],
    bassRoots: [73.42, 58.27, 65.41, 55.00],
    lead: [
      293.66, 293.66, 349.23, 0, 440.00, 0, 587.33, 587.33,
      523.25, 0, 440.00, 0, 349.23, 0, 293.66, 0,
      440.00, 440.00, 523.25, 0, 587.33, 0, 698.46, 698.46,
      659.25, 0, 587.33, 0, 440.00, 0, 0, 0,
      587.33, 0, 659.25, 0, 698.46, 0, 587.33, 0,
      523.25, 0, 440.00, 0, 349.23, 0, 293.66, 0,
      349.23, 0, 440.00, 0, 523.25, 0, 587.33, 0,
      698.46, 0, 880.00, 0, 587.33, 0, 0, 0
    ],
    arpScale: [146.83, 174.61, 220.00, 261.63, 293.66, 349.23, 440.00, 587.33]
  }
};

let bgmStep = 0;
let ambientPadStep = 0;

function playPadChord(notes, duration = 1.95) {
  if (!AC || bgmMute) return;
  try {
    const t = AC.currentTime;
    notes.forEach(freq => {
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.024 * (bgmVol / 0.3), t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      o.connect(g);
      g.connect(bgmAmbGain || bgmGain);
      o.start(t);
      o.stop(t + duration);
    });
  } catch (e) {}
}

function playBassNote(freq, dur = 0.11) {
  if (!AC || bgmMute) return;
  try {
    const t = AC.currentTime;
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.075 * (bgmVol / 0.3), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(bgmGain);
    o.start(t);
    o.stop(t + dur);
  } catch (e) {}
}

function playLeadNote(freq, dur = 0.16) {
  if (!AC || bgmMute || !freq) return;
  try {
    const t = AC.currentTime;
    const o = AC.createOscillator();
    const g = AC.createGain();
    const isAwk = (G.timers && G.timers.awakening > 0);
    o.type = isAwk ? 'sawtooth' : 'square';
    o.frequency.setValueAtTime(freq, t);
    if (dur > 0.13) {
      o.frequency.linearRampToValueAtTime(freq * 1.015, t + dur * 0.7);
      o.frequency.linearRampToValueAtTime(freq, t + dur);
    }
    const vol = (isAwk ? 0.07 : 0.05) * (bgmVol / 0.3);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bgmGain);
    o.start(t);
    o.stop(t + dur);
  } catch (e) {}
}

function playArpNote(scale, step) {
  if (!AC || bgmMute || !scale || !scale.length) return;
  try {
    const t = AC.currentTime;
    const idx = (step * 3) % scale.length;
    const freq = scale[idx];
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2, t);
    g.gain.setValueAtTime(0.026 * (bgmVol / 0.3), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g);
    g.connect(bgmGain);
    o.start(t);
    o.stop(t + 0.08);
  } catch (e) {}
}

function playDrumKick() {
  if (!AC || bgmMute) return;
  try {
    const t = AC.currentTime;
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.frequency.setValueAtTime(125, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.08);
    g.gain.setValueAtTime(0.13 * (bgmVol / 0.3), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g);
    g.connect(bgmGain);
    o.start(t);
    o.stop(t + 0.08);
  } catch (e) {}
}

function playDrumSnare() {
  if (!AC || bgmMute) return;
  try {
    const t = AC.currentTime;
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.07);
    g.gain.setValueAtTime(0.08 * (bgmVol / 0.3), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g);
    g.connect(bgmGain);
    o.start(t);
    o.stop(t + 0.07);
  } catch (e) {}
}

function playDrumHihat() {
  if (!AC || bgmMute) return;
  try {
    const t = AC.currentTime;
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(7500, t);
    g.gain.setValueAtTime(0.012 * (bgmVol / 0.3), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g);
    g.connect(bgmGain);
    o.start(t);
    o.stop(t + 0.03);
  } catch (e) {}
}

function bgmTick() {
  if (bgmMute || G.state !== 'running') return;
  try {
    initAudio();
    if (!AC) return;
    const t = AC.currentTime;
    const track = BGM_TRACKS[activeBgmTrack] || BGM_TRACKS.shinobi;
    const isAwk = (G.timers && G.timers.awakening > 0);

    // Filtre passe-bas dynamique : s'ouvre complètement lors de l'Éveil pour une énergie intense
    if (bgmFilter) {
      const targetFreq = isAwk ? 4500 : (G.timers && G.timers.jetpack > 0 ? 3600 : 2200);
      bgmFilter.frequency.setTargetAtTime(targetFreq, t, 0.1);
    }

    const barIdx = Math.floor(bgmStep / 16) % track.chords.length;
    const stepInBar = bgmStep % 16;

    // 1. Nappe d'accords ambiante (toutes les 16 doubles-croches)
    if (stepInBar === 0) {
      playPadChord(track.chords[barIdx], 1.9);
    }

    // 2. Basse roulante 16e note Synthwave
    const root = track.bassRoots[barIdx];
    let bassFreq = root;
    if (stepInBar % 4 === 1 || stepInBar % 4 === 3) {
      bassFreq = root * 2;
    } else if (stepInBar % 4 === 2) {
      bassFreq = root * 1.5;
    }
    playBassNote(bassFreq, 0.10);

    // 3. Arpège étincelant en contre-temps
    if (stepInBar % 2 === 1) {
      playArpNote(track.arpScale, bgmStep);
    }

    // 4. Mélodie Anime héroïque
    const leadNote = track.lead[bgmStep % track.lead.length];
    if (leadNote > 0) {
      playLeadNote(leadNote, 0.15);
    }

    // 5. Rythmique Synthwave (Pied, Caisse claire, Charleston)
    if (stepInBar === 0 || stepInBar === 8) {
      playDrumKick();
    } else if (stepInBar === 4 || stepInBar === 12) {
      playDrumSnare();
    }
    if (stepInBar % 2 === 0) {
      playDrumHihat();
    }

    bgmStep = (bgmStep + 1) % 64;
  } catch (e) {}
}

function startAmbientMenuBGM() {
  if (ambientPadTimer || bgmMute) return;
  initAudio();
  if (!AC) return;
  if (bgmFilter) {
    try { bgmFilter.frequency.setTargetAtTime(700, AC.currentTime, 0.2); } catch (e) {}
  }
  const track = BGM_TRACKS[activeBgmTrack] || BGM_TRACKS.shinobi;
  playPadChord(track.chords[ambientPadStep % track.chords.length], 2.2);
  ambientPadStep = (ambientPadStep + 1) % track.chords.length;
  ambientPadTimer = setInterval(() => {
    if (bgmMute || G.state === 'running') {
      stopAmbientMenuBGM();
      return;
    }
    const tr = BGM_TRACKS[activeBgmTrack] || BGM_TRACKS.shinobi;
    playPadChord(tr.chords[ambientPadStep % tr.chords.length], 2.2);
    ambientPadStep = (ambientPadStep + 1) % tr.chords.length;
  }, 2200);
}

function stopAmbientMenuBGM() {
  if (ambientPadTimer) {
    clearInterval(ambientPadTimer);
    ambientPadTimer = null;
  }
}

function startBGM() {
  stopAmbientMenuBGM();
  if (bgmInterval || bgmMute) return;
  initAudio();
  if (!AC) return;
  const track = BGM_TRACKS[activeBgmTrack] || BGM_TRACKS.shinobi;
  const stepMs = Math.round((60 / track.bpm) / 4 * 1000);
  bgmInterval = setInterval(bgmTick, stepMs);
}

function stopBGM() {
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
}

/* ---------- Projection 3D & Dessin ---------- */
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

function box(x0, x1, y0, y1, z0_raw, z1, c, stroke = false) {
  const z0 = Math.max(z0_raw, camZ + 0.7);
  if (z1 <= z0) return;
  const d = z0 - camZ, P = pr,
        a = P(x0, y0, z0), b = P(x1, y0, z0), e = P(x1, y1, z0), f = P(x0, y1, z0),
        a2 = P(x0, y0, z1), b2 = P(x1, y0, z1), e2 = P(x1, y1, z1), f2 = P(x0, y1, z1);

  if (camX < x0) poly([a, f, f2, a2], fg(c, 0.75, d));
  if (camX > x1) poly([b, e, e2, b2], fg(c, 0.65, d));
  if (camY > y1) poly([f, e, e2, f2], fg(c, 1.18, d));

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

function train(o) {
  const x0 = o.x - o.halfWidth, x1 = o.x + o.halfWidth,
        z0 = o.z, z1 = z0 + o.length,
        zs = Math.max(z0, camZ + 0.7), d = zs - camZ;

  const LIVERIES = [
    { base: [214, 48, 49], stripe: [255, 210, 63], text: 'EXPRESS', roof: [70, 75, 90] },
    { base: [9, 132, 227], stripe: [45, 226, 230], text: 'METRO 1', roof: [65, 75, 95] },
    { base: [232, 160, 32], stripe: [255, 255, 255], text: 'SUBWAY', roof: [85, 75, 65] },
    { base: [0, 184, 148], stripe: [255, 210, 63], text: 'CITY RAPID', roof: [60, 80, 75] }
  ];
  const liv = LIVERIES[o.variant % 4];

  // Caisse principale
  box(x0, x1, 0, 3.2, z0, z1, liv.base);

  // Bogies métalliques inférieurs
  if (zs > camZ + 0.8) {
    for (let bz = z0 + 2.5; bz < z1 - 1; bz += 5.5) {
      if (bz > camZ + 0.7) box(x0 + 0.05, x1 - 0.05, 0, 0.45, bz, bz + 1.8, [35, 38, 45]);
    }
  }

  // Toit avec unités de climatisation
  if (camY > 3.2 && z1 > zs) {
    for (let az = z0 + 3; az < z1 - 3; az += 6) {
      if (az > camZ + 0.7) box(x0 + 0.28, x1 - 0.28, 3.2, 3.48, az, az + 2.2, [80, 85, 95]);
    }
  }

  // Bandes latérales et vitres
  if (camX < x0 || camX > x1) {
    const sx = camX < x0 ? x0 : x1;
    poly([pr(sx, 1.75, zs), pr(sx, 1.75, z1), pr(sx, 2.7, z1), pr(sx, 2.7, zs)], fg([22, 34, 55], 0.95, d));
    poly([pr(sx, 1.15, zs), pr(sx, 1.15, z1), pr(sx, 1.5, z1), pr(sx, 1.5, zs)], fg(liv.stripe, 1.05, d));
  }

  // Face Avant (Phares LED, Grille de pare-chocs, Pare-brise teinté)
  if (z0 > camZ + 0.7) {
    poly([pr(x0 + 0.16, 1.65, z0), pr(x1 - 0.16, 1.65, z0), pr(x1 - 0.16, 2.85, z0), pr(x0 + 0.16, 2.85, z0)], fg([18, 28, 48], 1, d));
    poly([pr(x0 + 0.25, 2.0, z0), pr(x0 + 0.6, 2.0, z0), pr(x1 - 0.35, 2.75, z0), pr(x1 - 0.7, 2.75, z0)], 'rgba(255, 255, 255, 0.22)');
    poly([pr(x0 + 0.25, 2.9, z0), pr(x1 - 0.25, 2.9, z0), pr(x1 - 0.25, 3.12, z0), pr(x0 + 0.25, 3.12, z0)], '#ff9f1c');
    poly([pr(x0 + 0.08, 1.15, z0), pr(x1 - 0.08, 1.15, z0), pr(x1 - 0.08, 1.45, z0), pr(x0 + 0.08, 1.45, z0)], fg(liv.stripe, 1.1, d));

    for (const k of [-1, 1]) {
      const q = pr(o.x + k * 0.74, 0.8, z0);
      cx.fillStyle = 'rgba(255, 248, 180, 0.38)';
      cx.beginPath(); cx.arc(q[0], q[1], 0.34 * q[2], 0, Math.PI * 2); cx.fill();
      cx.fillStyle = '#fffae0';
      cx.beginPath(); cx.arc(q[0], q[1], 0.18 * q[2], 0, Math.PI * 2); cx.fill();
    }
  }
}

function ramp(o) {
  const x0 = o.x - o.halfWidth, x1 = o.x + o.halfWidth,
        z1 = o.z + o.length, zs = Math.max(o.z, camZ + 0.7);
  if (z1 <= zs) return;
  const ys = 3.2 * (zs - o.z) / o.length, d = zs - camZ, c = [232, 142, 40];
  if (camX < x0) poly([pr(x0, 0, zs), pr(x0, ys, zs), pr(x0, 3.2, z1), pr(x0, 0, z1)], fg(c, 0.72, d));
  if (camX > x1) poly([pr(x1, 0, zs), pr(x1, ys, zs), pr(x1, 3.2, z1), pr(x1, 0, z1)], fg(c, 0.62, d));
  poly([pr(x0, ys, zs), pr(x1, ys, zs), pr(x1, 3.2, z1), pr(x0, 3.2, z1)], fg(c, 1.12, d));

  for (let i = 1; i < 6; i++) {
    const z = o.z + o.length * i / 6, y = 3.2 * i / 6;
    if (z > zs) {
      poly([pr(x0 + 0.05, y, z), pr(x1 - 0.05, y, z), pr(x1 - 0.05, y + 0.08, z + 0.28), pr(x0 + 0.05, y + 0.08, z + 0.28)], fg([60, 40, 20], 1, d));
    }
  }
}

function low(o) {
  const x0 = o.x - o.halfWidth, x1 = o.x + o.halfWidth;
  box(x0, x1, 0, 0.92, o.z, o.z + 0.8, [240, 240, 245]);
  if (o.z > camZ + 0.7) {
    const d = o.z - camZ, w = (x1 - x0) / 8;
    for (let i = 0; i < 8; i += 2) {
      poly([pr(x0 + i * w, 0.08, o.z), pr(x0 + (i + 1) * w, 0.08, o.z), pr(x0 + (i + 1) * w, 0.84, o.z), pr(x0 + i * w, 0.84, o.z)], fg([225, 45, 57], 1.05, d));
    }
  }
}

function high(o) {
  const x0 = o.x - o.halfWidth, x1 = o.x + o.halfWidth, d = Math.max(o.z, camZ + 0.7) - camZ;
  box(x0, x0 + 0.22, 0, 2.65, o.z, o.z + 0.35, [95, 98, 110]);
  box(x1 - 0.22, x1, 0, 2.65, o.z, o.z + 0.35, [95, 98, 110]);
  box(x0, x1, 1.1, 2.65, o.z, o.z + 0.85, [250, 205, 35]);
  if (o.z > camZ + 0.7) {
    const w = (x1 - x0) / 8;
    for (let i = 0; i < 8; i += 2) {
      poly([pr(x0 + i * w, 1.12, o.z), pr(x0 + (i + 1) * w, 1.12, o.z), pr(x0 + (i + 1) * w, 2.62, o.z), pr(x0 + i * w, 2.62, o.z)], fg([28, 28, 34], 1, d));
    }
  }
}

function item(c) {
  const d = c.z - camZ;
  if (d < 0.8 || d > 135) return;
  const q = pr(c.x, c.y, c.z), s = q[2];
  cx.globalAlpha = 1 - Math.min(1, Math.max(0, d - 85) / 50) * 0.85;

  if (c.type === 'coin') {
    const r = 0.35 * s;
    const spin = tt * 5.5 + c.id;
    const w = Math.max(0.08 * r, Math.abs(Math.cos(spin)) * r);

    // Ombre au sol
    const qg = pr(c.x, 0, c.z);
    cx.fillStyle = 'rgba(0,0,0,0.25)';
    cx.beginPath(); cx.ellipse(qg[0], qg[1], 0.32 * qg[2], 0.1 * qg[2], 0, 0, Math.PI * 2); cx.fill();

    // Pièce dorée
    cx.fillStyle = '#b36b00';
    cx.beginPath(); cx.ellipse(q[0], q[1], w + 0.08 * r, r * 1.08, 0, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#ffd23f';
    cx.beginPath(); cx.ellipse(q[0], q[1], w, r, 0, 0, Math.PI * 2); cx.fill();
    if (w > 0.15 * r) {
      cx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      cx.beginPath(); cx.arc(q[0] - w * 0.25, q[1] - r * 0.3, 0.22 * w, 0, Math.PI * 2); cx.fill();
    }
  } else if (c.type === 'mystery_box') {
    // Boîte Mystère 3D Flottante avec Ruban Doré
    const r = 0.52 * s * (1 + Math.sin(tt * 4 + c.id) * 0.08);
    cx.save();
    cx.translate(q[0], q[1]);
    cx.rotate(Math.sin(tt * 3) * 0.1);

    // Cube violet/or
    cx.shadowColor = '#ffd23f'; cx.shadowBlur = 18;
    rr(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2, r * 0.25, '#7b2cbf', '#ffd23f', 2);
    // Ruban or
    cx.fillStyle = '#ffd23f';
    cx.fillRect(-r * 0.15, -r * 0.6, r * 0.3, r * 1.2);
    cx.fillRect(-r * 0.6, -r * 0.15, r * 1.2, r * 0.3);
    // Nœud
    cx.beginPath(); cx.arc(0, -r * 0.62, r * 0.22, 0, Math.PI * 2); cx.fill();
    cx.restore();
  } else {
    // Orbe de Power-Up
    const r = 0.58 * s * (1 + Math.sin(tt * 6) * 0.06);
    cx.save();
    cx.strokeStyle = 'rgba(45, 226, 230, 0.65)';
    cx.lineWidth = Math.max(1.5, 0.04 * s);
    cx.beginPath(); cx.arc(q[0], q[1], r * 1.25, 0, Math.PI * 2); cx.stroke();

    cx.shadowColor = '#2de2e6'; cx.shadowBlur = 18;
    cx.fillStyle = '#ffffff';
    cx.beginPath(); cx.arc(q[0], q[1], r, 0, Math.PI * 2); cx.fill();
    cx.restore();

    cx.font = `${Math.floor(r * 1.25)}px system-ui, sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(EM[c.kind] || '⭐', q[0], q[1] + r * 0.05);
  }
  cx.globalAlpha = 1;
}

/* ---------- HÉROS 3D STYLE ANIME JAPONAIS & GUARDIAN CYBER ---------- */
// Archetypes Anime : Ren (蓮 - Cyber Shinobi), Hikari (光 - Anime Valkyrie), Kuro (黒 - Shadow Ninja), Ryu (竜 - Flame Ronin)
const ANIME_HEROES = {
  ren: {
    name: 'Ren 蓮',
    kanji: '疾',
    hairBase: '#0f172a',
    hairShadow: '#020617',
    hairHighlight: '#00f5d4',
    hairBand: '#1e293b',
    plate: '#e2e8f0',
    ribbon: '#00f5d4',
    skin: '#fed7aa',
    skinShadow: '#fbcfe8',
    eyes: '#00f5d4',
    scarf: '#00f5d4',
    scarfTrim: '#05c46b',
    jacket: '#0f172a',
    jacketInner: '#1e293b',
    jacketAccent: '#2de2e6',
    katanaScabbard: '#0f172a',
    katanaGlow: '#00f5d4',
    katanaHilt: '#1e293b',
    katanaGuard: '#38bdf8',
    pants: '#1e293b',
    pantsStripe: '#00f5d4',
    sneaker: '#0f172a',
    sole: '#00f5d4',
    aura: '#00f5d4',
    auraSec: '#ffd23f'
  },
  hikari: {
    name: 'Hikari 光',
    kanji: '光',
    hairBase: '#fef08a',
    hairShadow: '#eab308',
    hairHighlight: '#ff007f',
    hairBand: '#ff007f',
    plate: '#ffffff',
    ribbon: '#ff007f',
    skin: '#ffedd5',
    skinShadow: '#fecdd3',
    eyes: '#ff007f',
    scarf: '#ffffff',
    scarfTrim: '#ff007f',
    jacket: '#ffffff',
    jacketInner: '#ff007f',
    jacketAccent: '#ffd23f',
    katanaScabbard: '#ffffff',
    katanaGlow: '#ff007f',
    katanaHilt: '#ff007f',
    katanaGuard: '#ffd23f',
    pants: '#f8fafc',
    pantsStripe: '#ff007f',
    sneaker: '#ffffff',
    sole: '#ff007f',
    aura: '#ff007f',
    auraSec: '#ffd23f'
  },
  kuro: {
    name: 'Kuro 黒',
    kanji: '影',
    hairBase: '#09090b',
    hairShadow: '#000000',
    hairHighlight: '#dc2626',
    hairBand: '#18181b',
    plate: '#71717a',
    ribbon: '#dc2626',
    skin: '#fed7aa',
    skinShadow: '#d4d4d8',
    eyes: '#ef4444',
    scarf: '#991b1b',
    scarfTrim: '#ef4444',
    jacket: '#09090b',
    jacketInner: '#18181b',
    jacketAccent: '#dc2626',
    katanaScabbard: '#18181b',
    katanaGlow: '#ef4444',
    katanaHilt: '#000000',
    katanaGuard: '#991b1b',
    pants: '#09090b',
    pantsStripe: '#7f1d1d',
    sneaker: '#18181b',
    sole: '#ef4444',
    aura: '#9333ea',
    auraSec: '#dc2626'
  },
  ryu: {
    name: 'Ryu 竜',
    kanji: '竜',
    hairBase: '#dc2626',
    hairShadow: '#991b1b',
    hairHighlight: '#fbbf24',
    hairBand: '#7f1d1d',
    plate: '#fbbf24',
    ribbon: '#f59e0b',
    skin: '#fed7aa',
    skinShadow: '#fca5a5',
    eyes: '#f59e0b',
    scarf: '#ea580c',
    scarfTrim: '#fbbf24',
    jacket: '#7f1d1d',
    jacketInner: '#ea580c',
    jacketAccent: '#fbbf24',
    katanaScabbard: '#450a0a',
    katanaGlow: '#f59e0b',
    katanaHilt: '#7f1d1d',
    katanaGuard: '#fbbf24',
    pants: '#1c1917',
    pantsStripe: '#ea580c',
    sneaker: '#292524',
    sole: '#f59e0b',
    aura: '#f97316',
    auraSec: '#facc15'
  }
};

function runner(x, y, z, pal, o) {
  const q = pr(x, y, z), s = q[2];
  const isGuard = pal.guard === true;
  const heroKey = isGuard ? 'guard' : (ANIME_HEROES[activeChar] ? activeChar : { jake: 'ren', tricky: 'hikari', ninja: 'kuro', lucy: 'ryu' }[activeChar] || 'ren');
  const hero = ANIME_HEROES[heroKey] || ANIME_HEROES.ren;
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
  cx.strokeStyle = '#0b0f19';
  cx.lineWidth = Math.max(1.4, 0.034 * s);

  // 1. AURA D'ÉVEIL ANIME (Mode Éveil / Overdrive ⚡ 覚醒)
  if (o.awakening && !isGuard) {
    cx.save();
    // Halo radiale flamboyant
    const aGrad = cx.createRadialGradient(0, -0.9 * s, 0.15 * s, 0, -0.9 * s, 1.45 * s);
    aGrad.addColorStop(0, hero.auraSec);
    aGrad.addColorStop(0.35, hero.aura);
    aGrad.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = aGrad;
    cx.beginPath();
    cx.arc(0, -0.9 * s, 1.45 * s, 0, Math.PI * 2);
    cx.fill();

    // Flammes d'énergie anime cel-shaded ondulantes
    cx.fillStyle = hero.aura;
    cx.beginPath();
    const auraCount = 12;
    for (let i = 0; i <= auraCount; i++) {
      const ang = (i / auraCount) * Math.PI * 2;
      const rDist = (1.08 + Math.sin(tt * 24 + i * 1.5) * 0.22 + Math.cos(tt * 18 - i * 0.8) * 0.12) * s;
      const ax = Math.cos(ang) * rDist;
      const ay = -0.9 * s + Math.sin(ang) * rDist * 1.1;
      if (i === 0) cx.moveTo(ax, ay); else cx.lineTo(ax, ay);
    }
    cx.closePath();
    cx.globalAlpha = 0.55;
    cx.fill();
    cx.globalAlpha = 1;

    // Arcs électriques / éclairs anime
    cx.strokeStyle = '#ffffff';
    cx.lineWidth = Math.max(1.8, 0.038 * s);
    for (let k = 0; k < 4; k++) {
      const startA = (k / 4) * Math.PI * 2 + tt * 9;
      let ex = Math.cos(startA) * 0.45 * s;
      let ey = -0.9 * s + Math.sin(startA) * 0.75 * s;
      cx.beginPath();
      cx.moveTo(ex, ey);
      for (let j = 0; j < 3; j++) {
        ex += (Math.sin(tt * 30 + k * 2 + j) * 0.25) * s;
        ey += (Math.cos(tt * 25 + k * 3 + j) * 0.25) * s;
        cx.lineTo(ex, ey);
      }
      cx.stroke();
    }
    cx.restore();
  }

  // 2. HOVERBOARD HD
  if (o.board) {
    cx.save();
    cx.rotate(Math.sin(tt * 9) * 0.06);

    const bProps = {
      classic: { base: '#ff2a85', glow: '#00f5d4', deco: '#ffd23f', trail: '#00f5d4' },
      flame:   { base: '#ff4d00', glow: '#ffd23f', deco: '#ff003c', trail: '#ff7700' },
      cyber:   { base: '#05c46b', glow: '#2de2e6', deco: '#ffffff', trail: '#05c46b' }
    }[boardSkin] || { base: '#ff2a85', glow: '#00f5d4', deco: '#ffd23f', trail: '#00f5d4' };

    cx.shadowColor = bProps.glow; cx.shadowBlur = 20;
    cx.fillStyle = bProps.base;
    cx.beginPath(); cx.ellipse(0, -0.05 * s, 0.54 * s, 0.15 * s, 0, 0, Math.PI * 2); cx.fill(); cx.stroke();

    cx.fillStyle = bProps.glow;
    cx.beginPath(); cx.ellipse(0, -0.06 * s, 0.40 * s, 0.07 * s, 0, 0, Math.PI * 2); cx.fill();

    for (const k of [-1, 1]) {
      cx.fillStyle = bProps.deco;
      cx.beginPath(); cx.arc(k * 0.38 * s, 0.01 * s, 0.07 * s, 0, Math.PI * 2); cx.fill();
    }
    if (Math.random() < 0.6) {
      burst(q[0] + (Math.random() - 0.5) * 0.4 * s, q[1] + 0.1 * s, 2, bProps.trail, 0.8, 0.25);
    }
    cx.restore();
  }

  // 3. ROULADE ACROBATIQUE NINJA (Spin acrobatique avec disque de coupe)
  if (o.roll) {
    cx.save();
    cx.translate(0, -0.48 * s);
    cx.rotate(tt * 26);

    // Orbe de roulade
    cx.fillStyle = isGuard ? '#1b2a49' : hero.jacket;
    cx.beginPath(); cx.arc(0, 0, 0.42 * s, 0, Math.PI * 2); cx.fill(); cx.stroke();

    // Lame circulaire d'énergie tranchante
    cx.strokeStyle = isGuard ? '#ffd23f' : hero.katanaGlow;
    cx.lineWidth = 0.065 * s;
    cx.beginPath(); cx.arc(0, 0, 0.48 * s, 0, Math.PI * 1.5); cx.stroke();

    // Écharpe enroulée dans la rotation
    cx.fillStyle = isGuard ? '#ffd23f' : hero.scarf;
    cx.beginPath(); cx.arc(0, -0.08 * s, 0.28 * s, Math.PI, 0); cx.fill(); cx.stroke();

    for (const k of [-1, 1]) {
      rr(k * 0.22 * s, 0.22 * s, 0.18 * s, 0.12 * s, 0.04 * s, isGuard ? '#111' : hero.sneaker, '#0b0f19');
    }
    cx.restore();
    cx.restore();
    return;
  }

  cx.rotate(o.tilt || 0);

  // 4. ÉCHARPE ANIME FLOTTANTE (Dynamique 4 segments au vent)
  if (!isGuard) {
    cx.save();
    const scarfBaseY = -1.52 * s;
    const scarfTailX = -(o.tilt || 0) * 0.35 * s;
    const scarfSegs = 4;
    const ptsLeft = [];
    const ptsRight = [];

    for (let i = 0; i <= scarfSegs; i++) {
      const prog = i / scarfSegs;
      const wave = Math.sin(tt * 18 - i * 0.95) * (0.05 + prog * 0.18) * s;
      const sway = Math.cos(tt * 14 - i * 0.75) * (0.04 + prog * 0.12) * s;
      const py = scarfBaseY + (prog * 0.88 * s) + (prog * prog * 0.16 * s);
      const px = scarfTailX + wave + (sway * 0.5);
      const halfW = (0.15 - prog * 0.05) * s;
      ptsLeft.push({ x: px - halfW, y: py });
      ptsRight.push({ x: px + halfW, y: py });
    }

    // Pan principal de l'écharpe
    cx.fillStyle = hero.scarf;
    cx.strokeStyle = '#0b0f19';
    cx.lineWidth = Math.max(1.3, 0.03 * s);
    cx.beginPath();
    cx.moveTo(ptsLeft[0].x, ptsLeft[0].y);
    for (let i = 1; i <= scarfSegs; i++) cx.lineTo(ptsLeft[i].x, ptsLeft[i].y);
    for (let i = scarfSegs; i >= 0; i--) cx.lineTo(ptsRight[i].x, ptsRight[i].y);
    cx.closePath();
    cx.fill();
    cx.stroke();

    // Bande centrale cel-shaded contrastée
    cx.fillStyle = hero.scarfTrim;
    cx.beginPath();
    cx.moveTo(ptsLeft[0].x + 0.04 * s, ptsLeft[0].y);
    for (let i = 1; i <= scarfSegs; i++) cx.lineTo(ptsLeft[i].x + 0.04 * s, ptsLeft[i].y);
    for (let i = scarfSegs; i >= 0; i--) cx.lineTo(ptsLeft[i].x + 0.07 * s, ptsRight[i].y);
    cx.closePath();
    cx.fill();

    // Deuxième pan d'écharpe flottant en décalé
    cx.beginPath();
    for (let i = 1; i <= scarfSegs; i++) {
      const prog = i / scarfSegs;
      const subWave = Math.sin(tt * 18 - i * 0.95 + 1.2) * (0.06 + prog * 0.15) * s;
      const py = scarfBaseY + (prog * 0.74 * s);
      const px = scarfTailX + subWave + 0.07 * s;
      if (i === 1) cx.moveTo(px, py); else cx.lineTo(px, py);
    }
    cx.strokeStyle = hero.scarf;
    cx.lineWidth = 0.07 * s;
    cx.stroke();
    cx.restore();
  }

  // 5. CYBER-KATANA SUR LE DOS (サイバー刀)
  if (!isGuard) {
    cx.save();
    cx.translate(0.04 * s, -1.26 * s);
    cx.rotate(0.68 + (o.tilt || 0) * 0.25);

    // Fourreau (Saya) métallique noir mat
    const sayaL = 0.96 * s;
    const sayaW = 0.082 * s;
    rr(-sayaW / 2, -sayaL * 0.45, sayaW, sayaL, 0.024 * s, hero.katanaScabbard, '#0b0f19');

    // Ligne de conduit d'énergie néon sur le fourreau
    cx.fillStyle = hero.katanaGlow;
    cx.fillRect(-0.012 * s, -sayaL * 0.42, 0.024 * s, sayaL * 0.94);

    // Garde (Tsuba) mecha angulaire
    rr(-0.09 * s, -sayaL * 0.45 - 0.03 * s, 0.18 * s, 0.045 * s, 0.015 * s, hero.katanaGuard, '#0b0f19');

    // Poignée (Tsuka) avec tressage traditionnel losange (Tsukamaki)
    const tsukaL = 0.35 * s;
    rr(-0.04 * s, -sayaL * 0.45 - 0.03 * s - tsukaL, 0.08 * s, tsukaL, 0.015 * s, hero.katanaHilt, '#0b0f19');

    // Losanges de tressage tsukamaki
    cx.fillStyle = hero.katanaGlow;
    for (let rz = 0; rz < 3; rz++) {
      const rzy = -sayaL * 0.45 - 0.06 * s - rz * 0.095 * s;
      cx.beginPath();
      cx.moveTo(0, rzy - 0.022 * s);
      cx.lineTo(0.022 * s, rzy);
      cx.lineTo(0, rzy + 0.022 * s);
      cx.lineTo(-0.022 * s, rzy);
      cx.closePath();
      cx.fill();
    }
    // Pommeau (Kashira)
    cx.fillStyle = hero.katanaGuard;
    cx.fillRect(-0.045 * s, -sayaL * 0.45 - 0.03 * s - tsukaL - 0.022 * s, 0.09 * s, 0.022 * s);
    cx.restore();
  }

  // 6. JAMBES & BASKETS MECHA ANIME (Perspective & Stride)
  const legs = [
    { side: -1, phase: sw, lift: Math.max(0, -cw) },
    { side: 1,  phase: -sw, lift: Math.max(0, cw) }
  ].sort((a, b) => a.phase - b.phase);

  for (const lg of legs) {
    cx.save();
    const hipX = lg.side * 0.14 * s, hipY = -0.76 * s;
    const strideY = lg.phase * 0.18 * s - lg.lift * 0.22 * s;
    const scaleLeg = 1 + lg.phase * 0.15;

    cx.translate(hipX, hipY);
    cx.rotate(lg.phase * 0.30);

    const legH = (0.58 * s) + strideY * 0.5;
    // Pantalon techwear / shinobi
    rr(-0.095 * s, 0, 0.19 * s, legH, 0.07 * s, isGuard ? '#162447' : hero.pants, '#0b0f19');

    if (!isGuard) {
      // Bande néon / armure genouillère
      cx.fillStyle = hero.pantsStripe;
      cx.fillRect(-0.075 * s, legH * 0.35, 0.15 * s, 0.05 * s);
      // Genouillère mecha angulaire
      rr(-0.085 * s, legH * 0.42, 0.17 * s, 0.14 * s, 0.04 * s, hero.jacketInner, '#0b0f19');
    }

    cx.translate(0, legH - 0.02 * s);
    cx.scale(scaleLeg * (o.sn ? 1.35 : 1), scaleLeg * (o.sn ? 1.35 : 1));

    // Baskets mecha futuristes
    // Semelle épaisse amortissante
    rr(-0.13 * s, 0.04 * s, 0.27 * s, 0.11 * s, 0.04 * s, '#0b0f19', '#000');
    // Conduit lumineux néon dans la semelle
    cx.fillStyle = o.sn ? '#00f5d4' : (isGuard ? '#3b82f6' : hero.sole);
    cx.fillRect(-0.11 * s, 0.07 * s, 0.23 * s, 0.05 * s);

    // Corps mecha de la basket
    rr(-0.12 * s, -0.07 * s, 0.24 * s, 0.13 * s, 0.05 * s, isGuard ? '#1e293b' : hero.sneaker, '#0b0f19');
    // Sangles / détails
    cx.fillStyle = '#ffffff';
    cx.fillRect(-0.06 * s, -0.06 * s, 0.12 * s, 0.04 * s);

    // Ailes de propulsion Super Baskets (si actif)
    if (o.sn) {
      cx.fillStyle = '#00f5d4';
      cx.beginPath();
      cx.moveTo(lg.side * 0.1 * s, -0.02 * s);
      cx.lineTo(lg.side * 0.28 * s, -0.16 * s);
      cx.lineTo(lg.side * 0.22 * s, 0.02 * s);
      cx.closePath();
      cx.fill();
    }
    cx.restore();
  }

  // 7. JETPACK DOUBLE
  if (o.jet) {
    cx.save();
    for (const k of [-1, 1]) {
      const tx = k * 0.25 * s;
      rr(tx - 0.1 * s, -1.48 * s, 0.2 * s, 0.6 * s, 0.06 * s, '#cbd5e1', '#0b0f19');
      rr(tx - 0.1 * s, -1.32 * s, 0.2 * s, 0.12 * s, 0.02 * s, '#ff9f1c');

      const flH = (0.42 + Math.random() * 0.32) * s;
      const grad = cx.createLinearGradient(tx, -0.88 * s, tx, -0.88 * s + flH);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, '#ffd23f'); grad.addColorStop(1, '#ff3864');
      cx.fillStyle = grad;
      cx.beginPath(); cx.moveTo(tx - 0.09 * s, -0.88 * s); cx.lineTo(tx, -0.88 * s + flH); cx.lineTo(tx + 0.09 * s, -0.88 * s); cx.closePath(); cx.fill();

      if (Math.random() < 0.4) burst(q[0] + tx, q[1] - 0.88 * s + flH, 1, '#ff9f1c', 1.2, 0.3);
    }
    cx.restore();
  }

  // 8. BRAS & ACCESSOIRES (Gants de combat tactiques)
  for (const k of [-1, 1]) {
    cx.save();
    const armPhase = -sw * k;
    cx.translate(k * 0.31 * s, -1.38 * s);
    cx.rotate(armPhase * 0.55 + k * 0.12);

    const armSleeveCol = isGuard ? '#1b2a49' : hero.jacket;
    const armAccentCol = isGuard ? '#ffd23f' : hero.jacketAccent;

    rr(-0.075 * s, 0, 0.15 * s, 0.34 * s, 0.06 * s, armSleeveCol, '#0b0f19');
    rr(-0.075 * s, 0.18 * s, 0.15 * s, 0.22 * s, 0.05 * s, armAccentCol);

    // Poing / Gant tactique fingerless
    cx.fillStyle = isGuard ? '#1e293b' : hero.skin;
    cx.beginPath(); cx.arc(0, 0.43 * s, 0.075 * s, 0, Math.PI * 2); cx.fill(); cx.stroke();

    if (k === 1 && isGuard) {
      // Bâton de capture électrique du garde
      cx.translate(0.04 * s, 0.42 * s); cx.rotate(-0.6);
      rr(-0.035 * s, -0.28 * s, 0.07 * s, 0.36 * s, 0.03 * s, '#0f172a', '#000');
      cx.fillStyle = '#ef4444'; cx.fillRect(-0.02 * s, -0.26 * s, 0.04 * s, 0.12 * s);
    }
    cx.restore();
  }

  // 9. TORSE & VESTE SHINOBI TECHWEAR AVEC KANJI DORSAL
  if (isGuard) {
    rr(-0.31 * s, -1.48 * s, 0.62 * s, 0.74 * s, 0.14 * s, '#1b2a49', '#0b0f19');
    cx.fillStyle = '#ffd23f'; cx.fillRect(-0.31 * s, -0.84 * s, 0.62 * s, 0.08 * s);
  } else {
    // Veste techwear principale
    rr(-0.29 * s, -1.48 * s, 0.58 * s, 0.74 * s, 0.13 * s, hero.jacket, '#0b0f19');
    // Plastron / Col montant intérieur
    rr(-0.24 * s, -1.46 * s, 0.48 * s, 0.62 * s, 0.09 * s, hero.jacketInner);
    // Liserés d'énergie néon verticaux
    cx.fillStyle = hero.jacketAccent;
    cx.fillRect(-0.18 * s, -1.46 * s, 0.035 * s, 0.65 * s);
    cx.fillRect(0.145 * s, -1.46 * s, 0.035 * s, 0.65 * s);
    // Ceinture mecha avec boucle
    cx.fillStyle = '#0b0f19';
    cx.fillRect(-0.29 * s, -0.88 * s, 0.58 * s, 0.08 * s);
    cx.fillStyle = hero.jacketAccent;
    cx.fillRect(-0.06 * s, -0.89 * s, 0.12 * s, 0.10 * s);

    // Emblème Kanji dans le dos
    cx.save();
    cx.font = `900 ${Math.floor(0.24 * s)}px "Noto Sans JP", system-ui, sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillStyle = hero.jacketAccent;
    cx.shadowColor = hero.jacketAccent;
    cx.shadowBlur = 8;
    cx.fillText(hero.kanji, 0, -1.18 * s);
    cx.restore();
  }

  // 10. TÊTE, BANDEAU SHINOBI & COIFFURE ANIME 3D MULTI-COUCHES
  const headOsc = Math.sin(cyc * 0.5) * 0.04;
  cx.save();
  cx.translate(0, -1.74 * s);
  cx.rotate(headOsc);

  if (isGuard) {
    // Garde Cyber-Enforcer
    cx.fillStyle = '#f4a261'; cx.beginPath(); cx.arc(0, 0, 0.23 * s, 0, Math.PI * 2); cx.fill(); cx.stroke();
    // Visière cybernétique rouge néon
    rr(-0.25 * s, -0.12 * s, 0.50 * s, 0.16 * s, 0.04 * s, '#0f172a', '#000');
    cx.fillStyle = '#ef4444'; cx.shadowColor = '#ef4444'; cx.shadowBlur = 10;
    cx.fillRect(-0.21 * s, -0.08 * s, 0.42 * s, 0.08 * s);
    cx.shadowBlur = 0;
    // Casquette tactique de police
    rr(-0.28 * s, -0.32 * s, 0.56 * s, 0.22 * s, 0.06 * s, '#0f172a');
    cx.fillStyle = '#ffd23f'; cx.fillRect(-0.06 * s, -0.22 * s, 0.12 * s, 0.08 * s);
  } else {
    // VISAGE ANIME (Menton effilé et cel-shading)
    cx.fillStyle = hero.skin;
    cx.beginPath();
    cx.moveTo(-0.20 * s, -0.10 * s);
    cx.lineTo(-0.18 * s, 0.08 * s);
    cx.lineTo(0, 0.22 * s); // Menton pointu anime
    cx.lineTo(0.18 * s, 0.08 * s);
    cx.lineTo(0.20 * s, -0.10 * s);
    cx.closePath();
    cx.fill(); cx.stroke();

    // Ombre du menton
    cx.fillStyle = hero.skinShadow;
    cx.beginPath();
    cx.moveTo(-0.08 * s, 0.12 * s);
    cx.lineTo(0, 0.22 * s);
    cx.lineTo(0.08 * s, 0.12 * s);
    cx.closePath();
    cx.fill();

    // BANDEAU SHINOBI (Hachimaki) avec plaque métallique gravée
    rr(-0.23 * s, -0.18 * s, 0.46 * s, 0.15 * s, 0.03 * s, hero.hairBand, '#0b0f19');
    // Plaque métallique polie
    const plateGrad = cx.createLinearGradient(0, -0.17 * s, 0, -0.05 * s);
    plateGrad.addColorStop(0, '#f8fafc');
    plateGrad.addColorStop(0.5, hero.plate);
    plateGrad.addColorStop(1, '#94a3b8');
    rr(-0.14 * s, -0.16 * s, 0.28 * s, 0.11 * s, 0.025 * s, plateGrad, '#0b0f19');
    // Gravure sur plaque (Insigne de Course 疾)
    cx.fillStyle = '#0b0f19';
    cx.fillRect(-0.05 * s, -0.115 * s, 0.10 * s, 0.022 * s);
    cx.fillRect(-0.011 * s, -0.145 * s, 0.022 * s, 0.08 * s);

    // Rubans du bandeau flottant au vent à l'arrière
    const ribPhase = tt * 16;
    for (const rk of [-1, 1]) {
      const rx0 = rk * 0.12 * s;
      const ry0 = -0.12 * s;
      const rx1 = rx0 + Math.sin(ribPhase + rk) * 0.08 * s + rk * 0.12 * s;
      const ry1 = ry0 + 0.18 * s;
      const rx2 = rx1 + Math.sin(ribPhase * 1.3 + rk) * 0.12 * s + rk * 0.15 * s;
      const ry2 = ry1 + 0.22 * s;

      cx.strokeStyle = hero.ribbon;
      cx.lineWidth = 0.045 * s;
      cx.beginPath();
      cx.moveTo(rx0, ry0);
      cx.quadraticCurveTo(rx1, ry1, rx2, ry2);
      cx.stroke();
    }

    // COIFFURE ANIME JAPONAIS 3D
    if (heroKey === 'hikari') {
      // --- HIKARI : TWIN-TAILS DYNAMIQUES & FRANGE BLONDE/MAGENTA ---
      cx.fillStyle = hero.hairBase;
      cx.beginPath(); cx.arc(0, -0.16 * s, 0.26 * s, Math.PI, 0); cx.fill(); cx.stroke();

      const bangs = [
        [-0.18, -0.15, -0.14, 0.02, -0.09, -0.15],
        [-0.09, -0.15, -0.04, 0.05, 0.01, -0.15],
        [0.01, -0.15, 0.06, 0.04, 0.11, -0.15],
        [0.11, -0.15, 0.16, 0.01, 0.20, -0.15]
      ];
      for (const b of bangs) {
        cx.beginPath();
        cx.moveTo(b[0] * s, b[1] * s);
        cx.lineTo(b[2] * s, b[3] * s);
        cx.lineTo(b[4] * s, b[5] * s);
        cx.closePath();
        cx.fill(); cx.stroke();
      }

      // Reflet céleste ("tenshi no wa")
      cx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      cx.beginPath();
      cx.ellipse(0, -0.25 * s, 0.18 * s, 0.04 * s, 0, 0, Math.PI * 2);
      cx.fill();

      // Twin-Tails dynamiques gauche & droite
      for (const side of [-1, 1]) {
        cx.save();
        const tieX = side * 0.24 * s, tieY = -0.22 * s;
        cx.translate(tieX, tieY);
        rr(-0.04 * s, -0.04 * s, 0.08 * s, 0.08 * s, 0.03 * s, hero.hairBand, '#0b0f19');

        const tSway = Math.sin(tt * 15 + side * 1.2) * 0.14 * s;
        const tBounce = Math.cos(tt * 12) * 0.08 * s;
        const tailGrad = cx.createLinearGradient(0, 0, side * 0.2 * s, 0.65 * s);
        tailGrad.addColorStop(0, hero.hairBase);
        tailGrad.addColorStop(0.6, hero.hairShadow);
        tailGrad.addColorStop(1, hero.hairHighlight);

        cx.fillStyle = tailGrad;
        cx.strokeStyle = '#0b0f19';
        cx.lineWidth = Math.max(1.2, 0.028 * s);
        cx.beginPath();
        cx.moveTo(-0.03 * s, 0);
        cx.bezierCurveTo(side * 0.18 * s + tSway, 0.2 * s + tBounce, side * 0.25 * s + tSway * 1.5, 0.45 * s, side * 0.08 * s + tSway, 0.72 * s);
        cx.lineTo(side * 0.02 * s + tSway, 0.72 * s);
        cx.bezierCurveTo(side * 0.10 * s + tSway, 0.42 * s, side * 0.04 * s, 0.2 * s, 0.03 * s, 0);
        cx.closePath();
        cx.fill(); cx.stroke();
        cx.restore();
      }
    } else {
      // --- REN, KURO & RYU : COUPE SPIKY SHONEN MULTI-COUCHES EN 3D ---
      // Couche d'ombre arrière
      cx.fillStyle = hero.hairShadow;
      cx.beginPath(); cx.arc(0, -0.16 * s, 0.27 * s, Math.PI, 0); cx.fill();

      // Couronne de pointes spiky 3D (5 épis majeurs)
      const spikes = [
        [-0.26, -0.15, -0.34, -0.38, -0.16, -0.28],
        [-0.18, -0.26, -0.18, -0.52, -0.06, -0.32],
        [-0.08, -0.32, 0.02, -0.58, 0.08, -0.32],
        [0.06, -0.32, 0.20, -0.50, 0.18, -0.26],
        [0.16, -0.26, 0.32, -0.36, 0.25, -0.14]
      ];

      const spikeGrad = cx.createLinearGradient(0, -0.58 * s, 0, -0.14 * s);
      spikeGrad.addColorStop(0, hero.hairHighlight);
      spikeGrad.addColorStop(0.35, hero.hairBase);
      spikeGrad.addColorStop(1, hero.hairShadow);

      cx.fillStyle = spikeGrad;
      cx.strokeStyle = '#0b0f19';
      cx.lineWidth = Math.max(1.3, 0.03 * s);

      for (const sp of spikes) {
        const wind = Math.sin(tt * 20 + sp[2] * 4) * 0.025 * s;
        cx.beginPath();
        cx.moveTo(sp[0] * s, sp[1] * s);
        cx.lineTo(sp[2] * s + wind, sp[3] * s);
        cx.lineTo(sp[4] * s, sp[5] * s);
        cx.closePath();
        cx.fill();
        cx.stroke();
      }

      // Frange avant encadrant le visage
      const frontBangs = [
        [-0.22, -0.14, -0.17, 0.05, -0.10, -0.14],
        [-0.11, -0.14, -0.05, 0.08, 0.00, -0.14],
        [-0.01, -0.14, 0.06, 0.07, 0.12, -0.14],
        [0.11, -0.14, 0.18, 0.04, 0.22, -0.14]
      ];
      cx.fillStyle = hero.hairBase;
      for (const fb of frontBangs) {
        cx.beginPath();
        cx.moveTo(fb[0] * s, fb[1] * s);
        cx.lineTo(fb[2] * s, fb[3] * s);
        cx.lineTo(fb[4] * s, fb[5] * s);
        cx.closePath();
        cx.fill(); cx.stroke();
      }

      // Reflet brillant en croissant ("tenshi no wa")
      cx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      cx.beginPath();
      cx.ellipse(0, -0.28 * s, 0.20 * s, 0.045 * s, -0.08, 0, Math.PI * 2);
      cx.fill();
    }
  }
  cx.restore();

  // 11. CYBER-HOUND DU GARDE
  if (isGuard) {
    cx.save();
    cx.translate(0.55 * s, -0.12 * s + Math.abs(sw) * 0.09 * s);
    // Corps mecha
    rr(-0.17 * s, -0.34 * s, 0.34 * s, 0.28 * s, 0.08 * s, '#334155', '#0b0f19');
    // Visière optique rouge
    cx.fillStyle = '#ef4444';
    cx.fillRect(-0.16 * s, -0.30 * s, 0.12 * s, 0.05 * s);
    // Oreilles mecha dressées
    cx.fillStyle = '#1e293b';
    cx.beginPath(); cx.moveTo(-0.14 * s, -0.34 * s); cx.lineTo(-0.10 * s, -0.46 * s); cx.lineTo(-0.06 * s, -0.34 * s); cx.closePath(); cx.fill(); cx.stroke();
    cx.beginPath(); cx.moveTo(0.06 * s, -0.34 * s); cx.lineTo(0.10 * s, -0.46 * s); cx.lineTo(0.14 * s, -0.34 * s); cx.closePath(); cx.fill(); cx.stroke();
    // Pattes
    cx.fillStyle = '#0b0f19';
    cx.fillRect(-0.14 * s, -0.06 * s, 0.07 * s, 0.12 * s);
    cx.fillRect(0.07 * s, -0.06 * s, 0.07 * s, 0.12 * s);
    cx.restore();
  }

  cx.restore();
}

/* ---------- Particules & Textes Flottants ---------- */
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

/* ---------- Rendu de Scène 3D Haute Définition ---------- */
function scene(st, dt) {
  const p = st.player, lw = st.laneWidth, HW = 4.2, zb = camZ + 140;

  // 1. Dégradé de Ciel Atmosphérique
  let g = cx.createLinearGradient(0, 0, 0, HOR);
  g.addColorStop(0, rgb(T.top)); g.addColorStop(1, rgb(T.hor));
  cx.fillStyle = g; cx.fillRect(-30, -30, W + 60, HOR + 30);

  // 2. Soleil / Lune
  g = cx.createRadialGradient(W * 0.7, HOR * 0.55, 0, W * 0.7, HOR * 0.55, F * 0.24);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, W, HOR);

  // 3. Skyline Urbaine avec Fenêtres
  cx.fillStyle = fg(T.bld, 0.5, 95);
  {
    const sh = camX * 8, b = Math.floor(sh / 36);
    for (let i = -1; i * 36 < W + 36; i++) {
      const bH = H * 0.14 * (0.6 + hs(b + i) * 0.8);
      const bx = i * 36 - (sh - b * 36);
      cx.fillRect(bx, HOR - 8 - bH, 36, bH + 8);

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
  g.addColorStop(0, rgb(T.hor)); g.addColorStop(1, rgb(T.side));
  cx.fillStyle = g; cx.fillRect(-30, HOR - 1, W + 60, H - HOR + 30);

  // 5. Bâtiments 3D Proches en Bordure
  const i0 = Math.floor(camZ / 12);
  for (let i = i0 + 11; i >= i0; i--) {
    for (const sd of [-1, 1]) {
      const h = hs(i * 2 + sd + 9), a = sd < 0 ? -(6 + h * 4) - 4 : 6 + h * 4, c = T.bld.map(v => v * (0.8 + h * 0.5));
      box(a, a + 4, 0, 5 + hs(i * 3 + sd) * 16, i * 12, i * 12 + 9, c);
    }
  }

  // 6. Plateforme Ferroviaire & Ballast
  g = cx.createLinearGradient(0, H, 0, HOR);
  g.addColorStop(0, rgb(T.trk)); g.addColorStop(1, rgb(T.hor));
  cx.fillStyle = g;
  {
    const a = pr(-HW, 0, camZ + 0.7), b = pr(HW, 0, camZ + 0.7), c = pr(HW, 0, zb), d = pr(-HW, 0, zb);
    cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.lineTo(c[0], c[1]); cx.lineTo(d[0], d[1]); cx.fill();
  }

  // 7. Traverses de Voie Ferrée
  const tie = T.trk.map(v => v * 0.55), zSleeper0 = Math.floor(camZ / 1.5) * 1.5;
  for (let z = zSleeper0; z < zb; z += 1.5) qd(-HW, HW, z, z + 0.38, tie);

  // 8. Rails Métalliques Doubles
  const zRail0 = Math.floor(camZ / 12) * 12;
  for (let z = zRail0; z < zb; z += 12) {
    for (const l of [-1, 0, 1]) {
      for (const s of [-0.72, 0.72]) {
        qd(l * lw + s - 0.05, l * lw + s + 0.05, z, z + 12, [210, 215, 225], 1.15);
      }
    }
  }

  // 9. Câbles Aériens de Caténaire en Cuivre (Lignes 3D continues)
  cx.strokeStyle = 'rgba(180, 185, 200, 0.45)';
  cx.lineWidth = 1.2;
  for (const l of [-1, 0, 1]) {
    const q1 = pr(l * lw, 6.35, camZ + 0.7), q2 = pr(l * lw, 6.35, zb);
    cx.beginPath(); cx.moveTo(q1[0], q1[1]); cx.lineTo(q2[0], q2[1]); cx.stroke();
  }

  // 10. Portiques Électriques & Feux Ferroviaires
  const zPylon0 = Math.floor(camZ / 24) * 24;
  for (let z = zPylon0 + 120; z >= zPylon0; z -= 24) {
    box(-HW - 0.9, -HW - 0.7, 0, 6.5, z, z + 0.28, [70, 75, 90]);
    box(HW + 0.7, HW + 0.9, 0, 6.5, z, z + 0.28, [70, 75, 90]);
    box(-HW - 0.9, HW + 0.9, 6.2, 6.5, z, z + 0.28, [65, 70, 85]);

    if (z > camZ + 0.8) {
      for (const l of [-1, 0, 1]) {
        const qSig = pr(l * lw, 5.8, z);
        cx.fillStyle = '#0f172a';
        cx.beginPath(); cx.arc(qSig[0], qSig[1], 0.22 * qSig[2], 0, Math.PI * 2); cx.fill();
        cx.fillStyle = (l === 0 ? '#05c46b' : '#ff3864');
        cx.beginPath(); cx.arc(qSig[0], qSig[1], 0.12 * qSig[2], 0, Math.PI * 2); cx.fill();
      }
    }
  }

  // 11. Objets triés par profondeur Z
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

  for (const [, o] of L) {
    if (o === 'P') {
      let gy = 0;
      for (const b of st.obstacles) {
        if (b.type === 'train' && Math.abs(b.x - p.x) < b.halfWidth && pz >= b.z && pz <= b.z + b.length && p.y >= 2.9) gy = 3.2;
      }
      const q = pr(p.x, gy, pz), k = 1 / (1 + (p.y - gy) * 0.35);
      cx.fillStyle = 'rgba(0,0,0,0.38)';
      cx.beginPath(); cx.ellipse(q[0], q[1], 0.46 * q[2] * k, 0.14 * q[2] * k, 0, 0, Math.PI * 2); cx.fill();

      runner(p.x, p.y, pz, { guard: false }, {
        roll: p.rolling,
        air: !p.grounded,
        board: st.powerups.hoverboard > 0,
        jet: st.powerups.jetpack > 0,
        sn: st.powerups.sneakers > 0,
        tilt: st.status === 'over' ? 1.3 : p.state === 'stumble' ? 0.25 * Math.sin(tt * 30) : (p.lane * lw - p.x) * -0.14,
        al: st.invulnerable && st.status === 'running' && Math.floor(tt * 14) % 2 ? 0.45 : 1,
        awakening: st.awakeningActive,
        awakeningTimer: st.awakeningTimer
      });
    } else if (o === 'C') {
      runner(p.x, 0, pz - 3.4, { guard: true }, {});
    } else if (o.type === 'train') train(o);
    else if (o.type === 'ramp') ramp(o);
    else if (o.type === 'low') low(o);
    else if (o.type === 'high') high(o);
    else item(o);
  }

  // 12. Particules & Textes
  for (let i = PA.length - 1; i >= 0; i--) {
    const q = PA[i];
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 420 * dt; q.l -= dt;
    if (q.l <= 0) { PA.splice(i, 1); continue; }
    cx.globalAlpha = q.l / q.m;
    cx.fillStyle = q.c;
    cx.fillRect(q.x, q.y, q.s, q.s);
  }

  for (let i = POPUPS.length - 1; i >= 0; i--) {
    const pop = POPUPS[i];
    pop.y -= 38 * dt; pop.life -= dt;
    if (pop.life <= 0) { POPUPS.splice(i, 1); continue; }
    cx.globalAlpha = pop.life / pop.maxLife;
    cx.font = '900 18px system-ui, sans-serif';
    cx.textAlign = 'center';
    cx.fillStyle = pop.color;
    cx.shadowColor = '#000'; cx.shadowBlur = 6;
    cx.fillText(pop.text, pop.x, pop.y);
    cx.shadowBlur = 0;
  }
  cx.globalAlpha = 1;
}

/* ---------- Boucle de Rendu & Caméra ---------- */
function draw(st, dt) {
  const p = st.player;
  pz = p.z + (st.status === 'running' ? st.speed * st.alpha / 60 : 0);
  camZ = pz - OFF;
  camX += (p.x * 0.55 - camX) * Math.min(1, dt * 6);
  camY += (CY0 + Math.min(p.y, 7) * 0.35 - camY) * Math.min(1, dt * 4);

  const tg = THS[Math.floor(st.distance / 1200) % 3];
  for (const k in T) {
    T[k] = T[k].map((v, i) => v + (tg[k][i] - v) * Math.min(1, dt * 0.6));
  }

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

  // Effet de vitesse visuel (lignes radiales)
  if (speedFx) {
    const isUltraFast = st.speed > 24 || st.powerups.jetpack > 0;
    speedFx.classList.toggle('active', isUltraFast && st.status === 'running');
  }
}

/* ---------- HUD & UI Updates ---------- */
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

  if ($('boxes-count')) {
    if (mysteryBoxesInRun > 0) {
      show($('boxes-count'));
      setTxt($('boxes-count'), '🎁 ×' + mysteryBoxesInRun);
    } else {
      hide($('boxes-count'));
    }
  }

  for (const k in EM) {
    const c = $('p_' + k), v = st.powerups[k];
    if (c) {
      c.style.display = v > 0 ? 'flex' : 'none';
      const maxDur = G.cfg[k + 'Duration'] || 10;
      if (v > 0) c.querySelector('b').style.transform = `scaleX(${v / maxDur})`;
    }
  }

  // Jauge d'Éveil Anime
  const awkVal = st.awakening || 0;
  const isAwkActive = st.awakeningActive || false;
  const isAwkReady = awkVal >= 100;
  if ($('awakening-gauge-fill')) $('awakening-gauge-fill').style.width = Math.min(100, isAwkActive ? ((st.awakeningTimer || 0) / 8.0) * 100 : awkVal) + '%';
  if ($('awakening-card')) {
    $('awakening-card').classList.toggle('ready', isAwkReady && !isAwkActive);
    $('awakening-card').classList.toggle('active', isAwkActive);
  }
  if ($('awakening-text')) {
    $('awakening-text').textContent = isAwkActive
      ? `⚡ ÉVEIL ACTIF (${(st.awakeningTimer || 0).toFixed(1)}s)`
      : (isAwkReady ? '⚡ ÉVEIL PRÊT ! (E)' : `ÉVEIL ${Math.floor(awkVal)}%`);
  }
  if ($('b-awakening')) {
    $('b-awakening').classList.toggle('ready', isAwkReady && !isAwkActive);
    $('b-awakening').classList.toggle('active', isAwkActive);
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

function showMilestone(dist) {
  if (!milestoneBanner) return;
  milestoneBanner.textContent = `🚩 ${dist} MÈTRES PARCOURUS !`;
  milestoneBanner.classList.remove('hide');
  snd(523, 1046, 0.45, 'triangle', 0.15);
  setTimeout(() => milestoneBanner.classList.add('hide'), 2200);
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

/* ---------- Missions & Multiplicateur ---------- */
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

  if (list.every(x => x.progress >= x.target)) {
    baseMult = Math.min(30, baseMult + 1);
    sv('sr_base_mult', baseMult);
    G.setBaseMultiplier(baseMult);
    toast(`🎉 NOUVEAU MULTIPLICATEUR : ×${baseMult} !`);
    snd(523, 1046, 0.45, 'triangle', 0.15);

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

/* ---------- Boutique, Garage & Améliorations ---------- */
const SHOP_DATA = {
  chars: [
    { id: 'ren', name: 'Ren 蓮 (Cyber Shinobi)', desc: 'Héros Shōnen cybernétique, bandeau ninja & katana d’énergie', price: 0, icon: '🥷' },
    { id: 'hikari', name: 'Hikari 光 (Anime Valkyrie)', desc: 'Skateuse anime aux twin-tails dynamiques et veste mecha', price: 500, icon: '⚡' },
    { id: 'kuro', name: 'Kuro 黒 (Shadow Ninja)', desc: 'Shinobi ténébreux aux yeux écarlates et écharpe flottante', price: 1200, icon: '🗡️' },
    { id: 'ryu', name: 'Ryu 竜 (Flame Ronin)', desc: 'Ronin enflammé aux pointes de feu et haori incandescent', price: 2000, icon: '🔥' }
  ],
  boards: [
    { id: 'classic', name: 'Neon Wave', desc: 'Planche rose néon classique', price: 0, icon: '🛹' },
    { id: 'flame', name: 'Flame Rider', desc: 'Laisse une traînée de feu ardent', price: 400, icon: '🔥' },
    { id: 'cyber', name: 'Cyber Glide', desc: 'Lévitation électro vert matrix', price: 800, icon: '⚡' }
  ],
  upgrades: [
    { id: 'pack_boards', name: 'Pack 3 Hoverboards', desc: 'Recharge 3 skates de protection', price: 100, icon: '🛹' },
    { id: 'up_magnet', name: 'Aimant Niv. ' + (puLevels.magnet + 1), desc: 'Augmente la durée (+2.5s)', price: 150 * puLevels.magnet, icon: '🧲', max: puLevels.magnet >= 5 },
    { id: 'up_sneakers', name: 'Baskets Niv. ' + (puLevels.sneakers + 1), desc: 'Augmente la durée (+2.5s)', price: 150 * puLevels.sneakers, icon: '👟', max: puLevels.sneakers >= 5 },
    { id: 'up_jetpack', name: 'Jetpack Niv. ' + (puLevels.jetpack + 1), desc: 'Augmente la durée (+1.5s)', price: 200 * puLevels.jetpack, icon: '🚀', max: puLevels.jetpack >= 5 }
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
      if (it.max) {
        actionBtnHtml = `<button class="m shop-buy-btn equipped-btn" disabled>MAX ✓</button>`;
      } else {
        actionBtnHtml = `<button class="m shop-buy-btn" onclick="buyShopItem('${it.id}', ${it.price})">Acheter · ${it.price} 🪙</button>`;
      }
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
  } else if (id === 'up_magnet' && puLevels.magnet < 5) {
    puLevels.magnet++;
    sv('sr_pu_levels', puLevels);
    applyUpgradedDurations();
    toast('🧲 Aimant amélioré au Niveau ' + puLevels.magnet + ' !');
  } else if (id === 'up_sneakers' && puLevels.sneakers < 5) {
    puLevels.sneakers++;
    sv('sr_pu_levels', puLevels);
    applyUpgradedDurations();
    toast('👟 Baskets améliorées au Niveau ' + puLevels.sneakers + ' !');
  } else if (id === 'up_jetpack' && puLevels.jetpack < 5) {
    puLevels.jetpack++;
    sv('sr_pu_levels', puLevels);
    applyUpgradedDurations();
    toast('🚀 Jetpack amélioré au Niveau ' + puLevels.jetpack + ' !');
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

document.querySelectorAll('.shop-tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.shop-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentShopTab = btn.getAttribute('data-tab');
    renderShop();
  };
});

/* ---------- Calendrier des Cadeaux Quotidiens ---------- */
const DAILY_REWARDS = [
  { day: 1, icon: '🪙', label: '+75 Pièces', type: 'coins', val: 75 },
  { day: 2, icon: '🛹', label: '+2 Skates', type: 'boards', val: 2 },
  { day: 3, icon: '🪙', label: '+150 Pièces', type: 'coins', val: 150 },
  { day: 4, icon: '🛹', label: '+3 Skates', type: 'boards', val: 3 },
  { day: 5, icon: '🪙', label: '+300 Pièces', type: 'coins', val: 300 },
  { day: 6, icon: '⭐', label: 'Multiplicateur +1', type: 'mult', val: 1 },
  { day: 7, icon: '🎁', label: 'Super Coffre : 600🪙 + 4🛹', type: 'mega', val: 600 }
];

function renderDailyModal() {
  const cont = $('daily-calendar');
  if (!cont) return;
  cont.innerHTML = '';
  const now = Date.now();
  const canClaim = now - lastDailyClaim > 18 * 3600 * 1000;
  const currentDayIndex = dailyStreak % 7;

  DAILY_REWARDS.forEach((r, idx) => {
    const isClaimed = idx < currentDayIndex || (!canClaim && idx === currentDayIndex);
    const isToday = idx === currentDayIndex && canClaim;
    cont.insertAdjacentHTML('beforeend', `
      <div class="daily-day-card ${isClaimed ? 'claimed' : ''} ${isToday ? 'today' : ''} ${idx === 6 ? 'day7' : ''}">
        <span class="daily-day-title">Jour ${r.day}</span>
        <span class="daily-day-icon">${r.icon}</span>
        <span class="daily-day-reward">${r.label}</span>
      </div>
    `);
  });

  const claimBtn = $('claim-daily');
  if (claimBtn) {
    claimBtn.disabled = !canClaim;
    claimBtn.textContent = canClaim ? '🎁 RÉCLAMER MON CADEAU DU JOUR' : '✓ CADEAU DÉJÀ RÉCLAMÉ';
  }
}

$('claim-daily').onclick = () => {
  const now = Date.now();
  if (now - lastDailyClaim <= 18 * 3600 * 1000) return;
  const reward = DAILY_REWARDS[dailyStreak % 7];
  dailyStreak++;
  lastDailyClaim = now;
  sv('sr_daily_streak', dailyStreak);
  sv('sr_daily_last', lastDailyClaim);

  if (reward.type === 'coins') {
    wallet += reward.val;
  } else if (reward.type === 'boards') {
    boardsStock += reward.val;
    sv('sr_boards_stock', boardsStock);
  } else if (reward.type === 'mult') {
    baseMult += 1;
    sv('sr_base_mult', baseMult);
    G.setBaseMultiplier(baseMult);
  } else if (reward.type === 'mega') {
    wallet += 600;
    boardsStock += 4;
    sv('sr_boards_stock', boardsStock);
  }
  sv('sr_wallet', wallet);
  snd(587, 1174, 0.35, 'triangle', 0.15);
  toast(`🎁 ${reward.label} réclamé avec succès !`);
  menuInfo();
  renderDailyModal();
};

/* ---------- Ouverture des Boîtes Mystères ---------- */
function openMysteryBox() {
  if (mysteryBoxesInRun <= 0) return;
  mysteryBoxesInRun--;
  if ($('mystery-anim-box')) $('mystery-anim-box').style.animation = 'speedPulse 0.15s 6';
  snd(440, 880, 0.25, 'triangle', 0.1);

  setTimeout(() => {
    const rewards = [
      { text: '+120 Pièces d’Or 🪙', action: () => { wallet += 120; sv('sr_wallet', wallet); } },
      { text: '+2 Hoverboards 🛹', action: () => { boardsStock += 2; sv('sr_boards_stock', boardsStock); } },
      { text: '+250 Pièces d’Or 🪙', action: () => { wallet += 250; sv('sr_wallet', wallet); } },
      { text: 'JACKPOT : +500 Pièces & 3 Skates ! ⭐', action: () => { wallet += 500; boardsStock += 3; sv('sr_wallet', wallet); sv('sr_boards_stock', boardsStock); } }
    ];
    const picked = rewards[Math.floor(Math.random() * rewards.length)];
    picked.action();
    if ($('mystery-reward-text')) $('mystery-reward-text').textContent = picked.text;
    snd(523, 1046, 0.4, 'triangle', 0.15);
    burst(W / 2, H * 0.45, 25, '#ffd23f', 3, 0.8);

    if (mysteryBoxesInRun > 0) {
      if ($('open-mystery-btn')) $('open-mystery-btn').textContent = `✨ OUVRIR ENCORE (${mysteryBoxesInRun} restante${mysteryBoxesInRun > 1 ? 's' : ''})`;
      show($('open-mystery-btn'));
      show($('close-mystery-btn'));
    } else {
      hide($('open-mystery-btn'));
      show($('close-mystery-btn'));
      hide($('over-mystery-alert'));
    }
    menuInfo();
  }, 600);
}

$('open-mystery-btn').onclick = openMysteryBox;
$('close-mystery-btn').onclick = () => hide(mysteryModal);

/* ---------- Paramètres & Options ---------- */
$('sfx-vol').oninput = e => {
  sfxVol = e.target.value / 100;
  sv('sr_sfx_vol', sfxVol);
  $('sfx-vol-val').textContent = e.target.value + '%';
  if (sfxGain && AC) sfxGain.gain.setValueAtTime(sfxMute ? 0 : sfxVol, AC.currentTime);
};
$('sfx-vol').value = sfxVol * 100;
$('sfx-vol-val').textContent = Math.round(sfxVol * 100) + '%';

$('bgm-vol').oninput = e => {
  bgmVol = e.target.value / 100;
  sv('sr_bgm_vol', bgmVol);
  $('bgm-vol-val').textContent = e.target.value + '%';
  if (bgmGain && AC) bgmGain.gain.setValueAtTime(bgmMute ? 0 : bgmVol, AC.currentTime);
  if (bgmAmbGain && AC) bgmAmbGain.gain.setValueAtTime(bgmMute ? 0 : (bgmVol * 0.45), AC.currentTime);
};
$('bgm-vol').value = bgmVol * 100;
$('bgm-vol-val').textContent = Math.round(bgmVol * 100) + '%';

// Sélecteur de qualité graphique
document.querySelectorAll('.quality-selector button[data-q]').forEach(b => {
  if (b.getAttribute('data-q') === graphicsQuality) b.classList.add('active');
  else b.classList.remove('active');
  b.onclick = () => {
    document.querySelectorAll('.quality-selector button[data-q]').forEach(btn => btn.classList.remove('active'));
    b.classList.add('active');
    graphicsQuality = b.getAttribute('data-q') || 'high';
    sv('sr_quality', graphicsQuality);
    rs();
    toast(`Qualité : ${graphicsQuality.toUpperCase()}`);
  };
});

// Sélecteur de piste d'ambiance musicale
const trackBtns = document.querySelectorAll('#bgm-track-selector .track-btn');
trackBtns.forEach(b => {
  if (b.getAttribute('data-track') === activeBgmTrack) b.classList.add('active');
  else b.classList.remove('active');
  b.onclick = () => {
    trackBtns.forEach(btn => btn.classList.remove('active'));
    b.classList.add('active');
    activeBgmTrack = b.getAttribute('data-track') || 'shinobi';
    sv('sr_bgm_track', activeBgmTrack);
    const tr = BGM_TRACKS[activeBgmTrack];
    toast(`🎵 Piste : ${tr ? tr.name : activeBgmTrack}`);
    snd(523.25, 659.25, 0.12, 'triangle', 0.1);
    if (G.state === 'running' && !bgmMute) {
      stopBGM();
      startBGM();
    }
  };
});

/* Support Manette Gamepad */
function pollGamepad() {
  if (!navigator.getGamepads) return;
  const gps = navigator.getGamepads();
  const gp = gps[0] || gps[1] || gps[2] || gps[3];
  if (!gp) {
    if (gamepadConnected) {
      gamepadConnected = false;
      if ($('gamepad-status-text')) $('gamepad-status-text').textContent = 'Non connectée';
    }
    return;
  }
  if (!gamepadConnected) {
    gamepadConnected = true;
    if ($('gamepad-status-text')) $('gamepad-status-text').textContent = 'Connectée : ' + gp.id.substring(0, 18);
    toast('🎮 Manette connectée !');
  }

  const axisX = gp.axes[0] || 0;
  const dLeft = (gp.buttons[14] && gp.buttons[14].pressed) || axisX < -0.5;
  const dRight = (gp.buttons[15] && gp.buttons[15].pressed) || axisX > 0.5;
  const btnA = (gp.buttons[0] && gp.buttons[0].pressed) || (gp.buttons[12] && gp.buttons[12].pressed);
  const btnB = (gp.buttons[1] && gp.buttons[1].pressed) || (gp.buttons[13] && gp.buttons[13].pressed);
  const btnY = (gp.buttons[3] && gp.buttons[3].pressed) || (gp.buttons[2] && gp.buttons[2].pressed);
  const btnH = (gp.buttons[5] && gp.buttons[5].pressed) || (gp.buttons[7] && gp.buttons[7].pressed);
  const btnP = (gp.buttons[9] && gp.buttons[9].pressed);

  if (dLeft && !gpLastState.left) G.input('left');
  if (dRight && !gpLastState.right) G.input('right');
  if (btnA && !gpLastState.btnA) G.input('jump');
  if (btnB && !gpLastState.btnB) G.input('roll');
  if (btnY && !gpLastState.btnY) tryAwakening();
  if (btnH && !gpLastState.btnH) tryBoard();
  if (btnP && !gpLastState.btnP) G.state === 'running' ? G.pause() : G.resume();

  gpLastState.left = dLeft; gpLastState.right = dRight;
  gpLastState.btnA = btnA; gpLastState.btnB = btnB;
  gpLastState.btnY = btnY;
  gpLastState.btnH = btnH; gpLastState.btnP = btnP;
}

/* ---------- Événements du Moteur SubwayEngine ---------- */
G.on('coin', e => {
  comboT = 0.7;
  combo = Math.min(combo + 1, 10);
  const pNote = BGM_SCALE[(combo - 1) % BGM_SCALE.length] * 4;
  snd(pNote, pNote * 1.5, 0.08, 'square', 0.035);

  const q = pr(e.x, e.y, e.z);
  burst(q[0], q[1], 7, '#ffd23f', 1.4, 0.4);
  if (combo > 3 && combo % 3 === 0) {
    addPopupText(q[0], q[1] - 15, `COMBO ×${combo}!`, '#ffd23f');
  }
});

G.on('mysteryBox', e => {
  mysteryBoxesInRun++;
  snd(659, 1318, 0.3, 'triangle', 0.12);
  toast('🎁 BOÎTE MYSTÈRE ATTRAPÉE !');
  const q = pr(e.x, e.y, e.z);
  burst(q[0], q[1], 18, '#ffd23f', 2.5, 0.6);
  burst(q[0], q[1], 18, '#a855f7', 2.5, 0.6);
});

G.on('milestone', e => {
  showMilestone(e.distance);
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

G.on('land', () => {
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

G.on('awakeningReady', () => {
  snd(587, 1174, 0.35, 'triangle', 0.15);
  toast('⚡ ÉVEIL ANIME PRÊT ! (Touche E / Bouton)');
  addPopupText(W / 2, H * 0.38, '⚡ 覚醒 READY !', '#00f5d4');
});

G.on('awakeningStart', () => {
  shake = 0.55; flash = 0.5;
  snd(260, 880, 0.45, 'sawtooth', 0.2);
  toast('⚡ OVERDRIVE ÉVEIL ACTIVÉ !');
  addPopupText(W / 2, H * 0.35, '⚡ 覚醒 OVERDRIVE !', '#ffd23f');
  burst(W / 2, H * 0.45, 25, '#00f5d4', 3.5, 0.7);
  burst(W / 2, H * 0.45, 25, '#ffd23f', 3.5, 0.7);
});

G.on('awakeningEnd', () => {
  toast('⚡ Mode Éveil terminé');
});

G.on('obstacleSmash', e => {
  shake = 0.4;
  snd(150, 40, 0.3, 'sawtooth', 0.18);
  const q = pr(e.obstacle.x, (e.obstacle.height || 1.5) / 2, pz + 1);
  burst(q[0], q[1], 20, '#ff0055', 3.5, 0.6);
  burst(q[0], q[1], 20, '#ffd23f', 3.5, 0.6);
  addPopupText(q[0], q[1] - 20, '💥 破断 SMASH!', '#ff0055');
});

G.on('nearMiss', e => {
  snd(880, 1760, 0.12, 'sine', 0.12);
  const q = pr(e.x, e.y + 1, e.z);
  burst(q[0], q[1], 10, '#00f5d4', 1.8, 0.4);
  addPopupText(q[0], q[1] - 25, '見切り +200!', '#00f5d4');
});

G.on('powerup', e => {
  snd(500, 1500, 0.32, 'triangle', 0.11);
  toast(TX[e.kind]);
});

G.on('pause', () => {
  stopBGM();
  startAmbientMenuBGM();
  show(ps);
});

G.on('resume', () => {
  stopAmbientMenuBGM();
  startBGM();
  hide(ps);
});

G.on('gameOver', e => {
  try {
    G.lastReason = (e && e.reason) || 'crash';
    shake = 1.1; flash = 0.85;
    stopBGM();
    stopAmbientMenuBGM();
  } catch (err) {}
  try { snd(220, 25, 0.9, 'sawtooth', 0.22); } catch (err) {}
  try { if (navigator.vibrate) navigator.vibrate([120, 60, 160]); } catch (err) {}

  const triggerOver = () => {
    try {
      over(e);
    } catch (err) {
      console.error('Erreur over():', err);
    } finally {
      if (ov) {
        ov.classList.remove('hide');
        ov.style.display = 'flex';
      }
    }
  };

  setTimeout(triggerOver, 750);
});

/* ---------- Écran Game Over ---------- */
function over(e) {
  if (G.state !== 'over') return;
  try {
    const rawCoins = (e && typeof e.coins === 'number') ? e.coins : G.coins;
    const newCoins = Math.max(0, rawCoins - banked);
    wallet += newCoins;
    banked = rawCoins;
    sv('sr_wallet', wallet);

    try { checkMissionProgress(e || G.getState()); } catch (err) {}

    const score = (e && typeof e.score === 'number') ? e.score : Math.floor(G.score);
    const dist = (e && typeof e.distance === 'number') ? e.distance : Math.floor(G.player.z);
    const coins = (e && typeof e.coins === 'number') ? e.coins : G.coins;
    const reason = (e && e.reason) ? e.reason : (G.lastReason || 'crash');

    const rec = score > best;
    if (rec) {
      best = score;
      sv('sr_best', best);
      try {
        burst(W / 2, H * 0.4, 30, '#ffd23f', 4, 1.2);
        burst(W / 2, H * 0.4, 30, '#2de2e6', 4, 1.2);
      } catch (err) {}
    }

    if ($('over-tag')) $('over-tag').textContent = reason === 'crash' ? '💥 COLLISION FRONTALE' : '🚨 INTERPELLATION';
    if ($('why')) $('why').textContent = reason === 'crash' ? 'Percuté par un train !' : 'Le garde t’a rattrapé !';

    if ($('st')) {
      $('st').innerHTML = `
        <div class="stat-cell"><span>Score</span><b>${score}</b></div>
        <div class="stat-cell"><span>Distance</span><b>${dist} m</b></div>
        <div class="stat-cell"><span>Pièces</span><b>🪙 ${coins}</b></div>`;
    }

    const s = (e && e.stats) || G.stats || {};
    if ($('telemetry')) {
      $('telemetry').textContent = `Sauts: ${s.jumps || 0} · Roulades: ${s.rolls || 0} · Voies: ${s.laneChanges || 0} · Bonus: ${s.powerups || 0}`;
    }

    if ($('rc')) $('rc').textContent = rec ? '🏆 NOUVEAU RECORD PERSONNEL !' : `Record actuel : ${best} · Banque : 🪙 ${wallet}`;

    if (mysteryBoxesInRun > 0 && $('over-mystery-alert')) {
      $('over-mystery-alert').textContent = `🎁 Ouvrir vos ${mysteryBoxesInRun} Boîtes Mystères !`;
      show($('over-mystery-alert'));
      $('over-mystery-alert').onclick = () => {
        hide(ov);
        if ($('open-mystery-btn')) $('open-mystery-btn').textContent = `✨ OUVRIR (${mysteryBoxesInRun})`;
        show($('open-mystery-btn'));
        hide($('close-mystery-btn'));
        show(mysteryModal);
      };
    }

    const r = $('rev');
    if (r) {
      r.style.display = revived ? 'none' : '';
      r.disabled = wallet < 50;
    }
  } catch (err) {
    console.error('Erreur over() stats:', err);
  } finally {
    if (ov) {
      ov.classList.remove('hide');
      ov.style.display = 'flex';
    }
  }
}

/* ---------- Lancement & Contrôles ---------- */
function play() {
  hide(menu); hide(ov); hide(ps); hide(shopModal); hide(missionsModal); hide(dailyModal); hide(mysteryModal); hide(settingsModal);
  if (ov) ov.style.display = '';
  banked = 0; revived = 0; combo = 0; PA.length = 0; POPUPS.length = 0; mysteryBoxesInRun = 0;
  stopAmbientMenuBGM();
  snd(440, 880, 0.12, 'triangle', 0.08);
  startBGM();
  G.setBaseMultiplier(baseMult);
  G.restart();

  if (pendingHeadstart) {
    const hs = pendingHeadstart;
    pendingHeadstart = null;
    setTimeout(() => {
      G.headstart(hs.dist, hs.jet);
      toast(hs.jet ? '🚀 MEGA BOOST 1000M !' : '⚡ HEADSTART 400M !');
    }, 150);
  }
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

function tryAwakening() {
  if (G.state === 'running') {
    if (G.awakening >= 100 && (G.timers.awakening || 0) <= 0) {
      G.activateAwakening();
    } else if ((G.timers.awakening || 0) > 0) {
      toast('⚡ Mode Éveil déjà actif !');
    } else {
      toast(`⚡ Jauge d'Éveil : ${Math.floor(G.awakening || 0)}% (Ramassez des pièces !)`);
      snd(220, 110, 0.15, 'sawtooth', 0.06);
    }
  }
}

/* Boosts de départ Headstart */
$('hs-normal').onclick = () => {
  if (wallet < 100) {
    toast('🪙 100 pièces requises pour le Headstart !');
    return;
  }
  wallet -= 100; sv('sr_wallet', wallet);
  pendingHeadstart = { dist: 400, jet: false };
  play();
};

$('hs-mega').onclick = () => {
  if (wallet < 250) {
    toast('🪙 250 pièces requises pour le Mega Boost !');
    return;
  }
  wallet -= 250; sv('sr_wallet', wallet);
  pendingHeadstart = { dist: 1000, jet: true };
  play();
};

/* Boutons UI & Navigation */
$('play').onclick = $('again').onclick = play;

$('rev').onclick = () => {
  if (wallet >= 50 && !revived) {
    wallet -= 50;
    sv('sr_wallet', wallet);
    revived = 1;
    hide(ov);
    if (ov) ov.style.display = '';
    stopAmbientMenuBGM();
    startBGM();
    G.revive();
  }
};

$('home').onclick = $('quit').onclick = () => {
  stopBGM();
  G.reset();
  hide(ov); hide(ps); hide(shopModal); hide(missionsModal); hide(dailyModal); hide(mysteryModal); hide(settingsModal);
  if (ov) ov.style.display = '';
  show(menu);
  menuInfo();
  startAmbientMenuBGM();
};

$('resume').onclick = () => G.resume();
$('bp').onclick = () => { G.state === 'running' ? G.pause() : G.resume(); };

$('bm').onclick = e => {
  sfxMute = !sfxMute;
  sv('sr_sfx_mute', sfxMute);
  if (sfxGain && AC) sfxGain.gain.setValueAtTime(sfxMute ? 0 : sfxVol, AC.currentTime);
  e.currentTarget.textContent = sfxMute ? '🔇' : '🔊';
};
if (sfxMute) $('bm').textContent = '🔇';

$('bmusic').onclick = e => {
  bgmMute = !bgmMute;
  sv('sr_bgm_mute', bgmMute);
  if (bgmGain && AC) bgmGain.gain.setValueAtTime(bgmMute ? 0 : bgmVol, AC.currentTime);
  if (bgmAmbGain && AC) bgmAmbGain.gain.setValueAtTime(bgmMute ? 0 : (bgmVol * 0.45), AC.currentTime);
  e.currentTarget.textContent = bgmMute ? '🎵❌' : '🎵';
  if (!bgmMute) {
    if (G.state === 'running') startBGM();
    else startAmbientMenuBGM();
  } else {
    stopBGM();
    stopAmbientMenuBGM();
  }
};
if (bgmMute) $('bmusic').textContent = '🎵❌';

$('bh').onclick = tryBoard;
if ($('b-awakening')) $('b-awakening').onclick = tryAwakening;
if ($('awakening-card')) $('awakening-card').onclick = tryAwakening;
if ($('t-awk')) $('t-awk').onclick = tryAwakening;

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

$('open-daily').onclick = () => {
  renderDailyModal();
  show(dailyModal);
};
$('close-daily').onclick = () => hide(dailyModal);

$('open-settings').onclick = () => show(settingsModal);
$('close-settings').onclick = () => hide(settingsModal);

$('btouch').onclick = () => {
  touchControlsActive = !touchControlsActive;
  sv('sr_touch_ctrls', touchControlsActive);
  touchOverlay.classList.toggle('hide', !touchControlsActive);
  toast(touchControlsActive ? '🎮 Boutons tactiles activés' : '🎮 Mode Balayage pur');
};
if (touchControlsActive) touchOverlay.classList.remove('hide');

$('t-left').onclick = () => G.input('left');
$('t-right').onclick = () => G.input('right');
$('t-up').onclick = () => G.input('jump');
$('t-down').onclick = () => G.input('roll');

SubwayInput.keyboard(G);
SubwayInput.touch(G, cv);

addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    if (!menu.classList.contains('hide') || !ov.classList.contains('hide')) play();
  } else if (e.key.toLowerCase() === 'h') {
    tryBoard();
  } else if (e.key.toLowerCase() === 'e') {
    tryAwakening();
  }
});

cv.addEventListener('touchstart', e => {
  if (!e.touches.length) return;
  const n = Date.now();
  const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
  const dist = Math.hypot(tx - lastTapX, ty - lastTapY);
  if (n - lastTap < 290 && dist < 35) tryBoard();
  lastTap = n; lastTapX = tx; lastTapY = ty;
}, { passive: true });

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

  pollGamepad();
  G.update(dt);
  const st = G.getState();
  draw(st, dt);
  hud(st);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
menuInfo();

// Securité anti-blocage : si l'écran Game Over tarde ou est masqué par anomalie, un tap sur le canvas le débloque
cv.addEventListener('pointerup', () => {
  if (G.state === 'over' && ov && ov.classList.contains('hide')) {
    over({
      reason: G.lastReason || 'crash',
      score: Math.floor(G.score) + G.coins * G.cfg.coinScore,
      distance: Math.floor(G.player.z),
      coins: G.coins,
      stats: G.stats
    });
  }
});

// Ambiance audio déclenchée à la première interaction utilisateur (politique autoplay des navigateurs mobiles)
const startAmbientOnInteraction = () => {
  initAudio();
  if (!bgmMute && G.state !== 'running') startAmbientMenuBGM();
};
window.addEventListener('pointerdown', startAmbientOnInteraction, { once: true });

// Service Worker v6 avec Network-First pour éliminer le cache obsolète sur Chrome Mobile
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js?v=6.0')
    .then(reg => {
      if (reg.update) reg.update();
    })
    .catch(() => {});
}
