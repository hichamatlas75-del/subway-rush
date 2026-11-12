/*!
 * Subway Rush — engine.js
 * Moteur de runner 3 voies (style Subway Surfers). Logique pure : aucun DOM, aucun rendu.
 *
 * Usage :
 *   const game = new SubwayEngine({ seed: 42 });
 *   game.on('coin', e => playSound('coin'));
 *   game.on('gameOver', e => showResults(e));
 *   game.start();
 *   function loop(t){ game.update(dtSeconds); render(game.getState()); requestAnimationFrame(loop); }
 *   SubwayInput.keyboard(game); SubwayInput.touch(game, canvas);
 *
 * Repère monde : z = avance (mètres), x = latéral (voie * laneWidth), y = hauteur.
 * Voies : -1 (gauche), 0 (centre), 1 (droite).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { const m = factory(); root.SubwayEngine = m.SubwayEngine; root.SubwayInput = m.SubwayInput; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Config                                                             */
  /* ------------------------------------------------------------------ */
  const DEFAULTS = {
    seed: null,
    fixedStep: 1 / 60,
    laneWidth: 2.5,
    laneSwitchSpeed: 24,        // m/s latéral
    // vitesse
    baseSpeed: 14, maxSpeed: 34, speedGain: 0.0045,   // +m/s par mètre parcouru
    // physique
    gravity: 42, terminalVelocity: 40,
    jumpVelocity: 14.5, sneakersJumpVelocity: 19,
    fastFallVelocity: 32,
    stepTolerance: 0.45,        // marche max franchissable (rampe, toit de train)
    coyoteTime: 0.1, inputBuffer: 0.18, rollBufferAfterFall: 0.6,
    // joueur
    playerHalfWidth: 0.3, playerHalfDepth: 0.35,
    standHeight: 1.7, rollHeight: 0.7, rollDuration: 0.65,
    // collisions / vie
    chaserDuration: 4, stumbleDuration: 0.8, stumbleInvuln: 1.4,
    stumbleSpeedFactor: 0.55, shieldInvuln: 2, jetpackEndInvuln: 1.6, reviveInvuln: 3,
    // powerups (secondes)
    magnetDuration: 10, sneakersDuration: 12, multiplierDuration: 15,
    jetpackDuration: 6, hoverboardDuration: 30,
    magnetRadius: 7, magnetPull: 28, jetpackHeight: 6,
    // génération
    startGrace: 40, spawnAhead: 140, despawnBehind: 25,
    difficultyDistance: 4000, powerupChance: 0.07,
    coinScore: 1
  };

  const LANES = [-1, 0, 1];
  const POWERUPS = ['magnet', 'sneakers', 'multiplier', 'jetpack', 'hoverboard'];
  const OB = {
    train: { height: 3.2, length: 14 },
    ramp:  { height: 3.2, length: 8 },
    low:   { height: 0.9, length: 0.8 },
    high:  { bottom: 1.1, top: 2.6, length: 0.8 }
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Engine                                                             */
  /* ------------------------------------------------------------------ */
  class SubwayEngine {
    constructor(opts = {}) {
      this.cfg = Object.assign({}, DEFAULTS, opts);
      this._listeners = {};
      this.reset(this.cfg.seed);
    }

    /* ---------- cycle de vie ---------- */
    reset(seed) {
      const s = seed != null ? seed : (Date.now() & 0x7fffffff);
      const c = this.cfg;
      this.seed = s;
      this.rng = mulberry32(s);
      this.state = 'ready';            // ready | running | paused | over
      this.time = 0;
      this.accumulator = 0;
      this.speed = c.baseSpeed;
      this.speedMul = 1;
      this.score = 0;
      this.coins = 0;
      this.player = {
        lane: 0, prevLane: 0, x: 0, y: 0, z: 0, prevZ: 0, vy: 0,
        grounded: true, coyote: 0, rolling: false, rollT: 0,
        height: c.standHeight, state: 'run'
      };
      this.timers = { invuln: 0, chaser: 0, stumble: 0, awakening: 0 };
      this.powerups = { magnet: 0, sneakers: 0, multiplier: 0, jetpack: 0, hoverboard: 0 };
      this.obstacles = [];
      this.collectibles = [];
      this._id = 1;
      this.nextSpawnZ = c.startGrace;
      this.inputQ = [];
      this.jumpBuf = 0;
      this.rollBuf = 0;
      this.baseMultiplier = this.cfg.baseMultiplier || 1;
      this.mysteryBoxes = 0;
      this.lastMilestone = 0;
      this.awakening = 0; // Jauge d'Éveil Anime 0-100
      this.stats = { jumps: 0, rolls: 0, stumbles: 0, powerups: 0, laneChanges: 0 };
      this._generate();
      this._seedStartCoins();
      return this;
    }

    setBaseMultiplier(m) {
      this.baseMultiplier = Math.max(1, m || 1);
      return this;
    }

    setPowerupDuration(kind, dur) {
      const key = kind + 'Duration';
      if (this.cfg[key] != null) this.cfg[key] = Math.max(2, dur);
      return this;
    }

    addAwakening(amt = 5) {
      if (this.timers.awakening > 0) return;
      this.awakening = Math.min(100, (this.awakening || 0) + amt);
      if (this.awakening >= 100) this._emit('awakeningReady', {});
    }

    activateAwakening() {
      if (this.state !== 'running' || this.awakening < 100 || this.timers.awakening > 0) return false;
      this.awakening = 0;
      this.timers.awakening = 8.0;
      this.timers.invuln = Math.max(this.timers.invuln, 8.5);
      this.speedMul = 1.35;
      this.powerups.magnet = Math.max(this.powerups.magnet, 8.0);
      this.powerups.multiplier = Math.max(this.powerups.multiplier, 8.0);
      this._emit('awakeningStart', { duration: 8.0 });
      return true;
    }

    headstart(dist = 400, jet = false) {
      if (this.state !== 'running') return;
      const p = this.player;
      this.timers.invuln = Math.max(this.timers.invuln, (dist / this.speed) + 2);
      this.obstacles = this.obstacles.filter(o => o.z < p.z || o.z > p.z + dist + 25);
      if (jet) {
        this.activatePowerup('jetpack');
      } else {
        this.speedMul = 1.7;
        for (let z = p.z + 10; z < p.z + dist; z += 3.5) {
          this._addCoin(p.lane * this.cfg.laneWidth, 0.8, z);
        }
      }
      this._emit('headstart', { distance: dist, jet });
      return this;
    }

    start() { if (this.state === 'ready') { this.state = 'running'; this._emit('start', {}); } return this; }
    pause() { if (this.state === 'running') { this.state = 'paused'; this._emit('pause', {}); } }
    resume() { if (this.state === 'paused') { this.state = 'running'; this._emit('resume', {}); } }
    restart(seed) { this.reset(seed); this.start(); }

    revive() {
      if (this.state !== 'over') return false;
      const p = this.player;
      this.obstacles = this.obstacles.filter(o => o.z + o.length < p.z - 5 || o.z > p.z + 45);
      p.y = 0; p.vy = 0;
      p.lane = p.prevLane = clamp(Math.round(p.x / this.cfg.laneWidth), -1, 1);
      p.x = p.lane * this.cfg.laneWidth;
      this.timers.chaser = 0; this.timers.stumble = 0;
      this.timers.invuln = this.cfg.reviveInvuln;
      this.speedMul = 0.8;
      this.state = 'running';
      this._emit('revive', {});
      return true;
    }

    /* ---------- événements ---------- */
    on(evt, fn) {
      (this._listeners[evt] = this._listeners[evt] || []).push(fn);
      return () => this.off(evt, fn);
    }
    off(evt, fn) {
      const l = this._listeners[evt]; if (!l) return;
      const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
    }
    _emit(evt, data) {
      const l = this._listeners[evt]; if (!l) return;
      for (const fn of l.slice()) { try { fn(data); } catch (e) { console.error('[SubwayEngine] listener', evt, e); } }
    }

    /* ---------- entrées ---------- */
    input(action) {
      if (this.state !== 'running') return;
      if (this.inputQ.length < 8) this.inputQ.push(action);
    }

    /* ---------- boucle ---------- */
    update(dt) {
      if (this.state !== 'running') return 0;
      if (!(dt > 0)) return this.accumulator / this.cfg.fixedStep;
      this.accumulator += Math.min(dt, 0.1);
      const step = this.cfg.fixedStep;
      let n = 0;
      while (this.accumulator >= step && n++ < 6) {
        this._step(step);
        this.accumulator -= step;
        if (this.state !== 'running') { this.accumulator = 0; break; }
      }
      return this.accumulator / step; // alpha d'interpolation pour le renderer
    }

    _step(dt) {
      const c = this.cfg, p = this.player, T = this.timers;
      this.time += dt;
      p.prevZ = p.z;

      this._consumeInput();
      this._tickTimers(dt);

      // vitesse
      const target = Math.min(c.maxSpeed, c.baseSpeed + p.z * c.speedGain);
      this.speed += (target - this.speed) * Math.min(1, dt * 2);
      if (T.stumble <= 0) this.speedMul = Math.min(1, this.speedMul + dt * 0.5);
      const dz = this.speed * this.speedMul * dt;
      p.z += dz;
      const mult = (this.powerups.multiplier > 0 ? 2 : 1) * (this.baseMultiplier || 1);
      this.score += dz * mult;

      const currentMilestone = Math.floor(p.z / 500);
      if (currentMilestone > this.lastMilestone) {
        this.lastMilestone = currentMilestone;
        this._emit('milestone', { distance: currentMilestone * 500 });
      }

      // latéral
      const tx = p.lane * c.laneWidth, d = tx - p.x, m = c.laneSwitchSpeed * dt;
      p.x = Math.abs(d) <= m ? tx : p.x + Math.sign(d) * m;

      // roulade
      if (p.rolling) { p.rollT -= dt; if (p.rollT <= 0) p.rolling = false; }
      p.height = p.rolling ? c.rollHeight : c.standHeight;

      this._vertical(dt);
      this._collisions();
      if (this.state !== 'running') return;
      this._collect(dt);
      this._generate();
      this._cleanup();
      this._updatePlayerState();
    }

    _tickTimers(dt) {
      const T = this.timers, P = this.powerups;
      T.invuln = Math.max(0, T.invuln - dt);
      T.chaser = Math.max(0, T.chaser - dt);
      T.stumble = Math.max(0, T.stumble - dt);
      if (T.awakening > 0) {
        T.awakening = Math.max(0, T.awakening - dt);
        if (T.awakening === 0) this._emit('awakeningEnd', {});
      }
      for (const k of POWERUPS) {
        if (P[k] > 0) {
          P[k] = Math.max(0, P[k] - dt);
          if (P[k] === 0) {
            if (k === 'jetpack') T.invuln = Math.max(T.invuln, this.cfg.jetpackEndInvuln);
            this._emit('powerupEnd', { kind: k });
          }
        }
      }
      this.jumpBuf = Math.max(0, this.jumpBuf - dt);
      this.rollBuf = Math.max(0, this.rollBuf - dt);
    }

    /* ---------- entrées -> actions ---------- */
    _consumeInput() {
      const p = this.player;
      while (this.inputQ.length) {
        const a = this.inputQ.shift();
        if (a === 'left' || a === 'right') this._changeLane(a === 'left' ? -1 : 1);
        else if (a === 'jump') this.jumpBuf = this.cfg.inputBuffer;
        else if (a === 'roll') this._roll();
        else if (a === 'awakening') this.activateAwakening();
      }
      if (this.powerups.jetpack > 0) { this.jumpBuf = 0; this.rollBuf = 0; return; }
      if (this.jumpBuf > 0 && (p.grounded || p.coyote > 0)) { this.jumpBuf = 0; this._jump(); }
      if (this.rollBuf > 0 && p.grounded) { this.rollBuf = 0; this._startRoll(); }
    }

    _changeLane(dir) {
      const p = this.player, nl = clamp(p.lane + dir, -1, 1);
      if (nl === p.lane) return;
      p.prevLane = p.lane; p.lane = nl;
      this.stats.laneChanges++;
      this.addAwakening(1);
      this._emit('laneChange', { lane: nl, dir });
    }

    _jump() {
      const p = this.player, c = this.cfg;
      p.vy = this.powerups.sneakers > 0 ? c.sneakersJumpVelocity : c.jumpVelocity;
      p.grounded = false; p.coyote = 0; p.rolling = false; p.rollT = 0;
      this.stats.jumps++;
      this.addAwakening(2);
      this._emit('jump', { sneakers: this.powerups.sneakers > 0 });
    }

    _roll() {
      const p = this.player;
      if (this.powerups.jetpack > 0) return;
      if (p.grounded) this._startRoll();
      else { p.vy = -this.cfg.fastFallVelocity; this.rollBuf = this.cfg.rollBufferAfterFall; }
    }
    _startRoll() {
      const p = this.player;
      p.rolling = true; p.rollT = this.cfg.rollDuration;
      this.stats.rolls++;
      this.addAwakening(2);
      this._emit('roll', {});
    }

    /* ---------- physique verticale ---------- */
    _overlap(ob, p) {
      const c = this.cfg;
      return ob.z <= p.z + c.playerHalfDepth && ob.z + ob.length >= p.z - c.playerHalfDepth &&
             Math.abs(ob.x - p.x) < ob.halfWidth + c.playerHalfWidth;
    }
    _surface(ob, zFront) {
      if (ob.type === 'train' || ob.type === 'low') return ob.height;
      if (ob.type === 'ramp') return ob.height * clamp((zFront - ob.z) / ob.length, 0, 1);
      return 0;
    }

    _vertical(dt) {
      const p = this.player, c = this.cfg;
      if (this.powerups.jetpack > 0) {
        p.y += (c.jetpackHeight - p.y) * Math.min(1, dt * 5);
        p.vy = 0; p.grounded = false; p.coyote = 0;
        return;
      }
      const prevY = p.y, wasGrounded = p.grounded;
      p.vy = Math.max(-c.terminalVelocity, p.vy - c.gravity * dt);
      p.y += p.vy * dt;

      let support = 0;
      for (const ob of this.obstacles) {
        if (ob.ghost || ob.type === 'high' || !this._overlap(ob, p)) continue;
        const s = this._surface(ob, p.z + c.playerHalfDepth);
        if (s <= prevY + c.stepTolerance && s > support) support = s;
      }
      if (p.y <= support && p.vy <= 0) {
        p.y = support; p.vy = 0; p.grounded = true;
        if (!wasGrounded) this._emit('land', { onTrain: support > 0.5 });
      } else p.grounded = false;
      p.coyote = p.grounded ? c.coyoteTime : Math.max(0, p.coyote - dt);
    }

    /* ---------- collisions ---------- */
    _collisions() {
      const p = this.player, c = this.cfg;
      if (this.powerups.jetpack > 0) return;
      for (const ob of this.obstacles) {
        if (ob.ghost) continue;

        // Frôlement héroïque (Near-Miss) : esquive au millimètre d'un obstacle ou train
        if (!ob.nearMissed && p.prevZ <= ob.z + 0.3 && p.z > ob.z + 0.3) {
          const dx = Math.abs(p.x - ob.x);
          const colDist = ob.halfWidth + c.playerHalfWidth;
          if (dx >= colDist && dx <= colDist + 1.25 && p.y < (ob.height || 2.5)) {
            ob.nearMissed = true;
            this.score += 200 * (this.powerups.multiplier > 0 ? 2 : 1);
            this.addAwakening(6);
            this._emit('nearMiss', { obstacle: ob, x: p.x, y: p.y, z: p.z });
          }
        }

        if (!this._overlap(ob, p)) continue;
        if (ob.type === 'high') {
          if (p.y < ob.top && p.y + p.height > ob.bottom) this._hit(ob, 'frontal', 0);
          continue;
        }
        const surf = this._surface(ob, p.z + c.playerHalfDepth);
        if (p.y >= surf - c.stepTolerance) continue;               // franchi / debout dessus
        const wasBehind = p.prevZ + c.playerHalfDepth <= ob.z + 0.1;
        this._hit(ob, wasBehind ? 'frontal' : 'side', surf);
        if (this.state !== 'running') return;
      }
    }

    _hit(ob, kind, surf) {
      const p = this.player, T = this.timers, c = this.cfg;
      if (T.awakening > 0) {
        ob.ghost = true;
        this._emit('obstacleSmash', { obstacle: ob, kind });
        return;
      }
      if (kind === 'side') {
        // Repousser le joueur pour éviter l'encastrement latéral et assigner la voie sûre
        const dir = Math.sign(p.x - ob.x) || (p.prevLane < p.lane ? -1 : 1);
        p.x = ob.x + dir * (ob.halfWidth + c.playerHalfWidth + 0.05);
        p.lane = p.prevLane = clamp(Math.round(p.x / c.laneWidth), -1, 1);
      }
      if (T.invuln > 0) {
        if (kind === 'frontal' && ob.type !== 'high') { p.y = Math.max(p.y, surf); p.vy = 0; }
        return;
      }
      if (this.powerups.hoverboard > 0) {
        this.powerups.hoverboard = 0;
        T.invuln = c.shieldInvuln;
        if (kind === 'frontal') ob.ghost = true;
        this._emit('shieldBreak', { obstacle: ob, kind });
        return;
      }
      const fatal = (ob.type === 'train' && kind === 'frontal') || T.chaser > 0;
      if (fatal) return this._gameOver(ob.type === 'train' && T.chaser <= 0 ? 'crash' : 'caught', ob);
      T.chaser = c.chaserDuration;
      T.stumble = c.stumbleDuration;
      T.invuln = c.stumbleInvuln;
      this.speedMul = c.stumbleSpeedFactor;
      if (kind === 'frontal') ob.ghost = true;
      this.stats.stumbles++;
      this._emit('stumble', { obstacle: ob, kind });
    }

    _gameOver(reason, ob) {
      if (this.state === 'over') return;
      this.state = 'over';
      this.player.state = 'dead';
      this._emit('gameOver', Object.assign({
        reason, obstacle: ob || null, score: Math.floor(this.score) + this.coins * this.cfg.coinScore,
        distance: Math.floor(this.player.z), coins: this.coins, time: this.time
      }, { stats: Object.assign({}, this.stats) }));
    }

    /* ---------- collectibles ---------- */
    _collect(dt) {
      const p = this.player, c = this.cfg, magnet = this.powerups.magnet > 0;
      const cy = p.y + p.height / 2;
      const pullSpeed = Math.max(c.magnetPull, this.speed * 1.6 + 10);
      for (const it of this.collectibles) {
        if (it.taken) continue;
        if (magnet && it.type === 'coin') {
          const dzm = it.z - p.z;
          // Cône d'attraction magnétique : aspire les pièces à l'avant (jusqu'à 22m) et sur les voies adjacentes
          if (dzm > -2 && dzm < 22 && Math.abs(it.x - p.x) < c.laneWidth * 2.5) {
            const dx = p.x - it.x, dy = cy - it.y, dzz = (p.z + 0.4) - it.z;
            const len = Math.hypot(dx, dy, dzz) || 1, mv = Math.min(len, pullSpeed * dt);
            it.x += (dx / len) * mv;
            it.y += (dy / len) * mv;
            it.z += (dzz / len) * mv;
            if (Math.hypot(it.x - p.x, it.y - cy, it.z - p.z) < 2.0 || Math.abs(dzm) < 1.3) {
              it.taken = true;
              this.coins++;
              this.addAwakening(3);
              this._emit('coin', { x: it.x, y: it.y, z: it.z, total: this.coins });
              continue;
            }
          }
        }
        if (Math.abs(it.z - p.z) < 1.25 && Math.abs(it.x - p.x) < 1.05 && Math.abs(it.y - cy) < 1.4) {
          it.taken = true;
          if (it.type === 'coin') {
            this.coins++;
            this.addAwakening(3);
            this._emit('coin', { x: it.x, y: it.y, z: it.z, total: this.coins });
          } else if (it.type === 'mystery_box') {
            this.mysteryBoxes = (this.mysteryBoxes || 0) + 1;
            this._emit('mysteryBox', { x: it.x, y: it.y, z: it.z, total: this.mysteryBoxes });
          } else this.activatePowerup(it.kind);
        }
      }
    }

    activatePowerup(kind) {
      const c = this.cfg, P = this.powerups;
      const dur = { magnet: c.magnetDuration, sneakers: c.sneakersDuration, multiplier: c.multiplierDuration,
                    jetpack: c.jetpackDuration, hoverboard: c.hoverboardDuration }[kind];
      if (!dur) return false;
      P[kind] = dur;
      this.stats.powerups++;
      if (kind === 'jetpack') { this.player.rolling = false; this._spawnJetpackCoins(); }
      this._emit('powerup', { kind, duration: dur });
      return true;
    }

    _spawnJetpackCoins() {
      const p = this.player, c = this.cfg;
      const end = p.z + this.cfg.jetpackDuration * this.speed * 0.95;
      let i = 0;
      for (let z = p.z + 10; z < end && i < 220; z += 2.2, i++) {
        this._addCoin(Math.sin(i * 0.3) * c.laneWidth, c.jetpackHeight + 0.85, z);
      }
    }

    _seedStartCoins() {
      for (let i = 0; i < 6; i++) this._addCoin(0, 0.8, 12 + i * 2.2);
    }

    /* ---------- génération procédurale ---------- */
    _addObstacle(type, lane, z, length) {
      const def = OB[type], lw = this.cfg.laneWidth;
      const ob = {
        id: this._id++, type, lane, x: lane * lw, z,
        length: length != null ? length : def.length,
        height: def.height || def.top, bottom: def.bottom || 0, top: def.top || def.height,
        halfWidth: lw / 2 - 0.1, variant: Math.floor(this.rng() * 4), ghost: false
      };
      this.obstacles.push(ob);
      return ob;
    }
    _addCoin(x, y, z) { this.collectibles.push({ id: this._id++, type: 'coin', x, y, z, taken: false }); }
    _addPowerup(kind, lane, z) {
      this.collectibles.push({ id: this._id++, type: 'powerup', kind, x: lane * this.cfg.laneWidth, y: 1.1, z, taken: false });
    }
    _coinLine(lane, z, n, y = 0.8, sp = 2.2) { for (let i = 0; i < n; i++) this._addCoin(lane * this.cfg.laneWidth, y, z + i * sp); }
    _coinArc(lane, z, n, peak = 1.6, sp = 1.4) {
      for (let i = 0; i < n; i++) this._addCoin(lane * this.cfg.laneWidth, 0.8 + Math.sin(i / Math.max(1, n - 1) * Math.PI) * peak, z + i * sp);
    }

    _pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
    _shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    _subset(min, max) { return this._shuffle(LANES).slice(0, min + Math.floor(this.rng() * (max - min + 1))); }

    _patterns() {
      const self = this, r = () => this.rng();
      return [
        { w: 3, min: 0, build(z0, d) {                       // pièces seules
            const n = 1 + Math.floor(r() * 2);
            for (let i = 0; i < n; i++) self._coinLine(self._pick(LANES), z0 + i * 3, 8);
            return 20; } },
        { w: 4, min: 0, build(z0, d) {                       // barrières basses (sauter)
            const rows = 1 + Math.floor(r() * (1 + d * 3)); let z = z0;
            for (let i = 0; i < rows; i++, z += 11) {
              const ls = self._subset(1, d > 0.4 ? 3 : 2);
              ls.forEach(l => self._addObstacle('low', l, z));
              self._coinArc(ls[0], z - 3, 6);
            }
            return z - z0; } },
        { w: 3, min: 0.05, build(z0, d) {                    // barrières hautes (rouler)
            const rows = 1 + Math.floor(r() * (1 + d * 2)); let z = z0;
            for (let i = 0; i < rows; i++, z += 11) {
              const ls = self._subset(1, 3);
              ls.forEach(l => self._addObstacle('high', l, z));
              self._coinLine(ls[0], z - 2, 4, 0.7, 1.3);
            }
            return z - z0; } },
        { w: 3, min: 0.15, build(z0, d) {                    // rangée mixte
            const rows = 2 + Math.floor(r() * 2); let z = z0;
            for (let i = 0; i < rows; i++, z += 12) {
              const types = self._shuffle(LANES).map(l => [l, self._pick([null, 'low', 'high'])]);
              if (types.every(t => !t[1])) types[0][1] = 'low';
              types.forEach(([l, t]) => t && self._addObstacle(t, l, z));
            }
            return z - z0; } },
        { w: 3, min: 0, build(z0, d) {                       // train simple (+ rampe)
            const lane = self._pick(LANES), ramp = r() < 0.55, len = self._pick([12, 16, 22]); let z = z0;
            if (ramp) { self._addObstacle('ramp', lane, z); z += OB.ramp.length; }
            self._addObstacle('train', lane, z, len);
            if (ramp) self._coinLine(lane, z + 1, Math.floor(len / 2.4), 4.0, 2.4);
            else self._coinLine(self._pick(LANES.filter(l => l !== lane)), z, Math.floor(len / 2.2));
            return z + len - z0 + 4; } },
        { w: 2, min: 0.2, build(z0, d) {                     // deux trains, une voie libre
            const free = self._pick(LANES), others = LANES.filter(l => l !== free); let end = 0;
            others.forEach(l => {
              const off = r() < 0.5 ? 0 : 6, len = self._pick([14, 18, 22]);
              self._addObstacle('train', l, z0 + off, len); end = Math.max(end, off + len);
            });
            self._coinLine(free, z0, Math.floor(end / 2.2));
            if (r() < d * 0.6) self._addObstacle('low', free, z0 + end / 2);
            return end + 4; } },
        { w: 2, min: 0.15, build(z0, d) {                    // slalom de trains
            const n = 3 + Math.floor(d * 2); let z = z0, prev = self._pick(LANES);
            for (let i = 0; i < n; i++) {
              self._addObstacle('train', prev, z, 12);
              self._coinLine(self._pick(LANES.filter(l => l !== prev)), z, 5);
              z += 14; prev = self._pick(LANES.filter(l => l !== prev));
            }
            return z - z0; } },
        { w: 1.5, min: 0.1, build(z0, d) {                   // long toit à parcourir
            const lane = self._pick(LANES), len = 32;
            self._addObstacle('ramp', lane, z0);
            self._addObstacle('train', lane, z0 + OB.ramp.length, len);
            self._coinLine(lane, z0 + OB.ramp.length + 1, 13, 4.0, 2.4);
            LANES.filter(l => l !== lane).forEach((l, i) => { self._addObstacle('low', l, z0 + 14 + i * 8); });
            return OB.ramp.length + len + 4; } },
        { w: 2, min: 0, build(z0, d) {                       // vague de pièces
            for (let i = 0; i < 14; i++) self._addCoin(Math.sin(i * 0.5) * self.cfg.laneWidth, 0.8, z0 + i * 2.2);
            return 32; } }
      ];
    }

    _generate() {
      const c = this.cfg, p = this.player;
      if (!this._pats) this._pats = this._patterns();
      while (this.nextSpawnZ < p.z + c.spawnAhead) {
        const d = clamp(this.nextSpawnZ / c.difficultyDistance, 0, 1);
        const pool = this._pats.filter(x => d >= x.min);
        let tot = 0; pool.forEach(x => tot += x.w);
        let roll = this.rng() * tot, pat = pool[0];
        for (const x of pool) { roll -= x.w; if (roll <= 0) { pat = x; break; } }
        const len = pat.build(this.nextSpawnZ, d);
        const gap = lerp(14, 7, d) + this.rng() * 4;
        if (this.nextSpawnZ > 100 && this.rng() < c.powerupChance) {
          const w = [['magnet', 3], ['sneakers', 3], ['multiplier', 3], ['hoverboard', 2], ['jetpack', 1.5]];
          let t = 0; w.forEach(x => t += x[1]); let q = this.rng() * t, kind = w[0][0];
          for (const [k, wt] of w) { q -= wt; if (q <= 0) { kind = k; break; } }
          this._addPowerup(kind, this._pick(LANES), this.nextSpawnZ + len + gap / 2);
        } else if (this.nextSpawnZ > 150 && this.rng() < 0.08) {
          this.collectibles.push({ id: this._id++, type: 'mystery_box', x: this._pick(LANES) * this.cfg.laneWidth, y: 1.15, z: this.nextSpawnZ + len + gap / 2, taken: false });
        }
        this.nextSpawnZ += len + gap;
      }
    }

    _cleanup() {
      const limit = this.player.z - this.cfg.despawnBehind;
      if (this.obstacles.length) this.obstacles = this.obstacles.filter(o => o.z + o.length > limit);
      if (this.collectibles.length) this.collectibles = this.collectibles.filter(o => !o.taken && o.z > limit);
    }

    _updatePlayerState() {
      const p = this.player;
      p.state = this.powerups.jetpack > 0 ? 'jetpack'
        : this.timers.stumble > 0 ? 'stumble'
        : !p.grounded ? (p.vy > 0 ? 'jump' : 'fall')
        : p.rolling ? 'roll' : 'run';
    }

    /* ---------- lecture pour le renderer ---------- */
    getState() {
      const p = this.player, c = this.cfg;
      return {
        status: this.state, time: this.time, alpha: this.accumulator / c.fixedStep,
        speed: this.speed * this.speedMul, distance: Math.floor(p.z), coins: this.coins,
        mysteryBoxes: this.mysteryBoxes || 0,
        score: Math.floor(this.score) + this.coins * c.coinScore,
        multiplier: (this.powerups.multiplier > 0 ? 2 : 1) * (this.baseMultiplier || 1),
        baseMultiplier: this.baseMultiplier || 1,
        awakening: this.awakening || 0,
        awakeningActive: (this.timers.awakening || 0) > 0,
        awakeningTimer: this.timers.awakening || 0,
        player: { x: p.x, y: p.y, z: p.z, lane: p.lane, height: p.height, state: p.state,
                  rolling: p.rolling, grounded: p.grounded },
        invulnerable: this.timers.invuln > 0,
        chaser: { active: this.timers.chaser > 0, remaining: this.timers.chaser, gap: this.timers.chaser > 0 ? 3 : 14 },
        powerups: Object.assign({}, this.powerups),
        obstacles: this.obstacles,        // lecture seule
        collectibles: this.collectibles,  // lecture seule
        laneWidth: c.laneWidth
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers d'entrée (optionnels, navigateur)                          */
  /* ------------------------------------------------------------------ */
  const SubwayInput = {
    keyboard(engine, target) {
      target = target || (typeof window !== 'undefined' ? window : null);
      if (!target) return () => {};
      const map = {
        ArrowLeft: 'left', a: 'left', q: 'left', ArrowRight: 'right', d: 'right',
        ArrowUp: 'jump', w: 'jump', z: 'jump', ' ': 'jump', ArrowDown: 'roll', s: 'roll',
        e: 'awakening', E: 'awakening'
      };
      const fn = e => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, a = map[k];
        if (a) { e.preventDefault(); engine.input(a); }
        else if (k === 'p' || k === 'Escape') engine.state === 'paused' ? engine.resume() : engine.pause();
      };
      target.addEventListener('keydown', fn);
      return () => target.removeEventListener('keydown', fn);
    },
    touch(engine, el, threshold = 26) {
      let sx = 0, sy = 0, handled = false;
      const ts = e => {
        if (!e.touches.length) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        handled = false;
      };
      const tm = e => {
        if (handled || !e.touches.length) return;
        const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= threshold) {
          if (Math.abs(dx) > Math.abs(dy)) engine.input(dx < 0 ? 'left' : 'right');
          else engine.input(dy < 0 ? 'jump' : 'roll');
          handled = true;
        }
      };
      const te = e => {
        if (handled || !e.changedTouches.length) return;
        const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= threshold) {
          if (Math.abs(dx) > Math.abs(dy)) engine.input(dx < 0 ? 'left' : 'right');
          else engine.input(dy < 0 ? 'jump' : 'roll');
          handled = true;
        }
      };
      el.addEventListener('touchstart', ts, { passive: true });
      el.addEventListener('touchmove', tm, { passive: true });
      el.addEventListener('touchend', te, { passive: true });
      return () => {
        el.removeEventListener('touchstart', ts);
        el.removeEventListener('touchmove', tm);
        el.removeEventListener('touchend', te);
      };
    }
  };

  return { SubwayEngine, SubwayInput };
});
