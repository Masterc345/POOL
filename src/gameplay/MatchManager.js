// Orchestrates a match: physics stepping, turn flow, rules, AI, aiming assistance, cue animation
// and the hand-off to the 3D scene. UI talks to it only through methods and events.
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { applyCueStrike } from '../physics/CueImpact.js';
import { PHYSICS, TABLE, BALL, GROUPS } from '../utils/Constants.js';
import { RulesEngine } from './RulesEngine.js';
import { ScoreManager } from './ScoreManager.js';
import { TurnManager } from './TurnManager.js';
import { createLocalMatch } from '../multiplayer/LocalMultiplayer.js';
import { setupRack, placeCueBall, respotBall, validCuePlacement, defaultCuePlacement } from './TableState.js';
import { AimingSystem } from '../aiming/AimingSystem.js';
import { AssistanceManager } from '../aiming/AssistanceManager.js';
import { AIPlayer } from '../ai/AIPlayer.js';
import { getProfile } from '../ai/DifficultyManager.js';
import { rankShots } from '../ai/ShotEvaluator.js';
import { CueController } from '../cue/CueController.js';
import { CUE_ID, EIGHT_ID } from '../balls/Rack.js';
import { createRng, wrapAngle, clamp } from '../utils/Helpers.js';
import { insidePlayArea } from '../table/TableGeometry.js';

const MAX_STEPS_PER_FRAME = 14;

export class MatchManager {
  constructor({ poolScene, sceneManager, settings, sound, events, stats }) {
    this.scene = poolScene;
    this.sceneManager = sceneManager;
    this.settings = settings;
    this.sound = sound;
    this.events = events;
    this.stats = stats;

    this.world = new PhysicsWorld();
    this.aim = new AimingSystem();
    this.assist = new AssistanceManager();
    this.assistResult = null;
    this._assistDirty = true;
    this._assistVersion = -1;
    this._assistTimer = 0;

    this.state = 'idle';
    this.paused = false;
    this.config = null;
    this.rules = null;
    this.hover = null;
    this.message = null;
    this.accum = 0;
    this.shotEvents = [];
    this._eventCursor = 0;
    this.practice = null;
    this.timeScale = 1;
    this.lastShot = null;
    this.replay = null;
    this.elapsed = 0;
    this.clockLeft = 0;
    this.clockTotal = 0;
    // mouse wheel changes power while aiming; Ctrl + wheel zooms
    poolScene.cameraManager.shouldZoom = (e) => e.ctrlKey || !this.canHumanAct();

    this.controller = new CueController({
      canvas: sceneManager.canvas,
      camera: poolScene.camera,
      aim: this.aim,
      settings,
      getCue: () => { const c = this.world.getBall(CUE_ID); return c && c.active ? c : null; },
      getCameraMode: () => poolScene.cameraManager.mode,
      canAim: () => this.canHumanAct(),
      canPlace: () => this.canHumanAct() && this._ballInHand(),
      tryPlace: (x, y) => this.tryPlaceCue(x, y),
      onFire: () => this.fire(),
      onPreview: (x, y) => this._preview(x, y),
    });
  }

  // ------------------------------------------------------------------ setup
  /** config: { mode: 'single'|'local'|'practice', difficulty, practice: 'free'|'aim'|'shot', seed? (deterministic rack/AI for tests) } */
  start(config) {
    this.config = { ...config };
    const seed = Number.isInteger(config.seed) ? config.seed >>> 0 : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
    this.rng = createRng(seed);
    this.world = new PhysicsWorld();
    setupRack(this.world, seed);

    const s = this.settings;
    if (config.mode === 'single') {
      this.players = [
        { name: s.get('playerName'), type: 'human', color: '#4fc3f7' },
        { name: `Computer (${getProfile(config.difficulty).label})`, type: 'ai', difficulty: config.difficulty, color: '#ffb74d' },
      ];
    } else if (config.mode === 'local') {
      this.players = createLocalMatch(s.get('playerName'), s.get('player2Name'));
    } else {
      this.players = [{ name: s.get('playerName'), type: 'human', color: '#4fc3f7' }];
    }
    this.turn = new TurnManager(this.players);
    this.score = new ScoreManager(this.players.length);
    this.rules = config.mode === 'practice' ? null : new RulesEngine();
    this.ais = this.players.map((p, i) => (p.type === 'ai' ? new AIPlayer(p.difficulty, seed + i * 101) : null));
    this.practice = config.mode === 'practice' ? { kind: config.practice || 'free', shots: 0, pocketed: 0, streak: 0, best: 0, targetPocket: null } : null;

    this.aim.setSpin(0, 0);
    this.aim.setPower(0.5);
    this.assist.setLevel(s.get('assistanceLevel'));
    this.assist.showTrajectory = s.get('showTrajectory');
    this.paused = false;
    this.lastShot = null;
    this.replay = null;
    this.timeScale = 1;
    this.elapsed = 0;
    this.clockTotal = config.mode === 'practice' ? 0 : s.get('shotClock');
    this.message = null;
    this.shotEvents = [];
    this.scene.balls.setCuePlacementState('none');

    if (this.practice && this.practice.kind !== 'free') this._setupPracticeLayout();
    this._announce(this.rules ? 'Break! Place the cue ball behind the head string if you like.' : this._practiceIntro(), 'info');
    this.startTurn();
    this.events.emit('matchStart', { config: this.config, players: this.players });
  }

  restart() { if (this.config) this.start(this.config); }

  stop() {
    this.state = 'idle';
    this.scene.aimRenderer.hideAll();
    this.scene.cue.setVisible(false);
  }

  dispose() { this.controller.dispose(); }

  // ------------------------------------------------------------------ helpers
  get current() { return this.turn.currentPlayer; }
  _ballInHand() { return this.rules ? this.rules.ballInHand : true; }
  _kitchen() { return this.rules ? this.rules.ballInHandKitchen : false; }
  isHumanTurn() { return this.current && this.current.type === 'human'; }
  canHumanAct() { return this.state === 'aiming' && !this.paused && this.isHumanTurn() && !this.controller.busy; }

  legalIds() {
    if (this.rules) return this.rules.legalTargets();
    return this.world.balls.filter((b) => b.active && b.id !== CUE_ID).map((b) => b.id);
  }

  _announce(text, kind = 'info') {
    this.message = { text, kind, at: performance.now() };
    this.events.emit('message', this.message);
  }

  _practiceIntro() {
    const k = this.practice?.kind;
    if (k === 'aim') return 'Aiming practice: use the assistance and clear the table.';
    if (k === 'shot') return 'Shot practice: pocket the ball in the highlighted pocket.';
    return 'Free play: no rules, no pressure.';
  }

  // ------------------------------------------------------------------ turn flow
  startTurn() {
    if (this.rules && this.rules.winner !== null) { this._endMatch(); return; }
    this.turn.set(this.rules ? this.rules.current : 0);
    const cue = this.world.getBall(CUE_ID);
    if (!cue.active) {
      const d = defaultCuePlacement(this.world, this._kitchen());
      placeCueBall(this.world, d.x, d.y);
    }
    this._assistDirty = true;
    this.hover = null;
    this.scene.balls.setCuePlacementState('none');
    this.accum = 0;
    this.clockLeft = this.clockTotal;
    this._clockWarned = false;

    if (this.current.type === 'ai') {
      const ai = this.ais[this.turn.current];
      if (this._ballInHand()) {
        const pos = ai.choosePlacement(this.world, this.legalIds(), this._kitchen());
        placeCueBall(this.world, pos.x, pos.y);
      }
      this.state = 'aiThinking';
      this._aiTimer = ai.profile.thinkMs / 1000;
      this._aiShot = null;
      this.aim.setSpin(0, 0);
      this._pointAtNearestTarget();
    } else {
      this.state = 'aiming';
      this._pointAtNearestTarget();
      this.aim.targetId = null;
      this.aim.pocketId = null;
    }
    this.events.emit('turn', this.getHudState());
  }

  _pointAtNearestTarget() {
    const cue = this.world.getBall(CUE_ID);
    if (this.rules && !this.rules.breakDone) { this.aim.setAngle(Math.atan2(0 - cue.y, TABLE.FOOT_SPOT_X - cue.x)); return; }
    let best = null, bd = Infinity;
    for (const id of this.legalIds()) {
      const b = this.world.getBall(id);
      if (!b || !b.active) continue;
      const d = Math.hypot(b.x - cue.x, b.y - cue.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) this.aim.setAngle(Math.atan2(best.y - cue.y, best.x - cue.x));
  }

  tryPlaceCue(x, y) {
    if (!this.canHumanAct() || !this._ballInHand()) return false;
    if (!validCuePlacement(this.world, x, y, this._kitchen())) {
      this._announce(this._kitchen() ? 'Place the cue ball behind the head string, clear of other balls.' : 'The cue ball cannot go there.', 'foul');
      return false;
    }
    placeCueBall(this.world, x, y);
    this._assistDirty = true;
    this.hover = null;
    this.scene.balls.setCuePlacementState('none');
    return true;
  }

  _preview(x, y) {
    const valid = validCuePlacement(this.world, x, y, this._kitchen());
    this.hover = { x, y, valid };
    this.scene.balls.setCuePlacementState(valid ? 'valid' : 'invalid');
  }

  /** Human presses shoot. */
  fire() {
    if (!this.canHumanAct()) return false;
    this._beginStroke(this.aim.getShot(), this.aim.power);
    return true;
  }

  _beginStroke(shot, power) {
    this.state = 'striking';
    this.scene.balls.setCuePlacementState('none');
    this.controller.playStroke(power, () => this._strike(shot, power), () => {});
  }

  _strike(shot, power) {
    const cue = this.world.getBall(CUE_ID);
    this.lastShot = { snapshot: this.world.snapshot(), shot: { ...shot } }; // for instant replay
    this.world.clearEvents();
    applyCueStrike(cue, shot, this.world.params);
    this.sound.playCue(power);
    this.shotEvents = [];
    this._eventCursor = 0;
    this.accum = 0;
    this._rollTime = 0;
    this.state = 'rolling';
    this.events.emit('shot', { player: this.turn.current });
  }

  // ------------------------------------------------------------------ per-frame update
  update(dt) {
    if (!this.paused) this.controller.update(dt); // a paused game must not finish a cue stroke
    if (!this.paused) {
      if (this.state === 'aiThinking') this._updateAIThinking(dt);
      else if (this.state === 'aiAiming') this._updateAIAiming(dt);
      else if (this.state === 'rolling') this._updateRolling(dt);
      else if (this.state === 'replay') this._updateReplay(dt);
      if (this.state === 'aiming') this._updateAssistance(dt);
      if (this.state !== 'gameOver' && this.state !== 'idle') this.elapsed += dt;
      if (this.state === 'aiming' && this.clockTotal > 0 && this.isHumanTurn() && !this.controller.busy) {
        this.clockLeft -= dt;
        if (!this._clockWarned && this.clockTotal > 10 && this.clockLeft <= 10 && this.clockLeft > 0) {
          this._clockWarned = true;
          this.events.emit('clockWarning', { seconds: 10 });
        }
        if (this.clockLeft <= 0) this._shotClockExpired();
      }
    }
    this._syncScene(dt);
  }

  _updateAIThinking(dt) {
    this._aiTimer -= dt;
    if (this._aiTimer > 0) return;
    const idx = this.turn.current;
    const ai = this.ais[idx];
    const shot = ai.chooseShot({ world: this.world, legalIds: this.legalIds(), isBreak: !!this.rules && !this.rules.breakDone });
    this._aiShot = shot;
    this._aiAimT = 0;
    this._aiAimFrom = this.aim.angle;
    this.aim.setPower(shot.power);
    this.aim.setSpin(shot.a, shot.b);
    this.state = 'aiAiming';
  }

  _updateAIAiming(dt) {
    const dur = 0.9;
    this._aiAimT = Math.min(dur, this._aiAimT + dt);
    const k = this._aiAimT / dur;
    const ease = k * k * (3 - 2 * k);
    this.aim.setAngle(this._aiAimFrom + wrapAngle(this._aiShot.angle - this._aiAimFrom) * ease);
    if (this._aiAimT >= dur) {
      const shot = { dirX: Math.cos(this._aiShot.angle), dirY: Math.sin(this._aiShot.angle), speed: this._aiShot.speed, a: this._aiShot.a, b: this._aiShot.b };
      this._beginStroke(shot, this._aiShot.power);
    }
  }

  _updateRolling(dt) {
    this.accum += dt * this.timeScale;
    let steps = 0;
    const h = PHYSICS.TIMESTEP;
    while (this.accum >= h && steps < MAX_STEPS_PER_FRAME) {
      this.world.step(h);
      this.scene.balls.integrate(this.world, h);
      this.accum -= h;
      steps++;
      const evs = this.world.events;
      for (; this._eventCursor < evs.length; this._eventCursor++) this.sound.playEvent(evs[this._eventCursor]);
      this._rollTime += h;
      if (this.world.isSettled() || this._rollTime > 60) {
        if (!this.world.isSettled()) for (const b of this.world.balls) { b.vx = b.vy = b.wx = b.wy = b.wz = 0; }
        this._finishShot();
        return;
      }
    }
    if (this.accum > h * MAX_STEPS_PER_FRAME) this.accum = 0; // drop backlog instead of spiralling
  }

  // ------------------------------------------------------------------ replay + slow motion
  canReplay() { return !!this.lastShot && this.state === 'aiming' && !this.paused; }

  /** Instant replay of the last shot: re-simulates it from the stored table state (deterministic). */
  startReplay() {
    if (!this.canReplay()) return false;
    const w = new PhysicsWorld();
    w.restore(this.lastShot.snapshot);
    applyCueStrike(w.getBall(CUE_ID), this.lastShot.shot, w.params);
    this.replay = { world: w, accum: 0, hold: -1, cursor: 0 };
    this.state = 'replay';
    this.scene.aimRenderer.hideAll();
    this._announce('Instant replay - press R to stop', 'info');
    this.events.emit('replayStart', {});
    return true;
  }

  stopReplay() {
    if (this.state !== 'replay') return;
    this.replay = null;
    this.state = 'aiming';
    this._assistDirty = true;
  }

  toggleReplay() {
    if (this.state === 'replay') this.stopReplay();
    else this.startReplay();
  }

  toggleSlowMo() { this.timeScale = this.timeScale === 1 ? 0.35 : 1; }

  _updateReplay(dt) {
    const r = this.replay;
    const h = PHYSICS.TIMESTEP;
    if (r.hold >= 0) {
      r.hold -= dt;
      if (r.hold <= 0) this.stopReplay();
      return;
    }
    r.accum += dt * this.timeScale;
    let steps = 0;
    while (r.accum >= h && steps < MAX_STEPS_PER_FRAME) {
      r.world.step(h);
      this.scene.balls.integrate(r.world, h);
      r.accum -= h;
      steps++;
      for (; r.cursor < r.world.events.length; r.cursor++) this.sound.playEvent(r.world.events[r.cursor]);
      if (r.world.isSettled() || r.world.time - this.lastShot.snapshot.time > 60) { r.hold = 1.2; return; }
    }
    if (r.accum > h * MAX_STEPS_PER_FRAME) r.accum = 0;
  }

  // ------------------------------------------------------------------ shot resolution
  _finishShot() {
    const events = this.world.events.slice();
    const shooter = this.turn.current;
    const name = this.players[shooter].name;

    if (this.rules) {
      const out = this.rules.processShot(events);
      this.score.recordShot(shooter, out);
      for (const id of out.respot) respotBall(this.world, id);
      this.lastOutcome = out;
      this.events.emit('shotResult', out);

      if (out.assigned) {
        const g = out.assigned.group === GROUPS.SOLIDS ? 'solids' : 'stripes';
        this._announce(`${this.players[out.assigned.player].name} is ${g}`, 'good');
      }
      if (out.winner !== null) {
        this.state = 'gameOver';
        this._endMatch();
        return;
      }
      if (out.foul) {
        this.sound.playUi('foul');
        const next = this.players[out.nextPlayer].name;
        this._announce(`Foul: ${out.fouls.join('; ')}. ${next} has ball in hand.`, 'foul');
      } else if (out.continues) {
        this._announce(out.legalPots.length ? `${name} pocketed a ball and shoots again` : `${name} shoots again`, 'good');
      } else {
        this._announce(`${this.players[out.nextPlayer].name}'s turn`, 'info');
      }
    } else {
      this._finishPracticeShot(events);
    }
    this.startTurn();
  }

  _shotClockExpired() {
    const shooter = this.turn.current;
    const out = this.rules.processTimeout();
    this.score.players[shooter].fouls++;
    this.lastOutcome = out;
    this.events.emit('shotResult', out);
    this.sound.playUi('foul');
    this._announce(`Shot clock expired. ${this.players[out.nextPlayer].name} has ball in hand.`, 'foul');
    this.startTurn();
  }

  _endMatch() {
    this.state = 'gameOver';
    this.scene.cue.setVisible(false);
    this.scene.aimRenderer.hideAll();
    const winner = this.rules.winner;
    const summary = this.score.summary();
    summary.duration = Math.round(this.elapsed);
    const payload = { winner, winnerName: this.players[winner].name, reason: this.rules.gameOverReason, summary, players: this.players, mode: this.config.mode, difficulty: this.config.difficulty };
    this.sound.playUi('win');
    if (this.config.mode === 'single') this.stats.record(summary, { humanIndex: 0, vsAI: this.config.difficulty, humanWon: winner === 0 });
    else if (this.config.mode === 'local') this.stats.recordLocal();
    this.events.emit('matchEnd', payload);
  }

  // ------------------------------------------------------------------ practice
  _finishPracticeShot(events) {
    const p = this.practice;
    const pocketed = events.filter((e) => e.type === 'pocket').map((e) => e.id);
    const objs = pocketed.filter((id) => id !== CUE_ID);
    const scratch = pocketed.includes(CUE_ID);
    p.shots++;
    p.pocketed += objs.length;
    this.score.recordShot(0, { legalPots: objs, foul: scratch, continues: objs.length > 0 && !scratch });

    if (p.kind === 'shot') {
      const ok = objs.length > 0 && !scratch && (p.targetPocket === null || events.some((e) => e.type === 'pocket' && e.id === p.targetId && e.pocket === p.targetPocket));
      if (ok) { p.streak++; p.best = Math.max(p.best, p.streak); this._announce(`Pocketed! Streak ${p.streak}`, 'good'); }
      else { p.streak = 0; this._announce(scratch ? 'Scratch' : 'Missed - try again', 'foul'); }
      this.events.emit('practiceShot', { pocketed: objs, scratch, kind: p.kind, ok, streak: p.streak });
      this._setupPracticeLayout();
      return;
    }
    if (scratch) { this._announce('Scratch - cue ball returned', 'foul'); }
    else if (objs.length) { this._announce(`Pocketed ${objs.length} ball${objs.length > 1 ? 's' : ''}`, 'good'); }
    this.events.emit('practiceShot', { pocketed: objs, scratch, kind: p.kind, ok: objs.length > 0 && !scratch, streak: p.streak });
    if (!this.world.balls.some((b) => b.active && b.id !== CUE_ID)) this._setupPracticeLayout(true);
  }

  /** Called by the UI's "Reset" button in practice mode. */
  resetPractice() {
    if (!this.practice || this.state === 'rolling' || this.state === 'striking') return;
    this._setupPracticeLayout(true);
    this.startTurn();
  }

  _setupPracticeLayout() {
    const p = this.practice;
    const rng = this.rng;
    const w = this.world;
    const free = (x, y, clear = 0.075) => w.balls.every((b) => !b.active || Math.hypot(b.x - x, b.y - y) > clear);
    const rand = () => ({ x: rng.range(-1.1, 1.1), y: rng.range(-0.52, 0.52) });
    for (const b of w.balls) b.active = false;
    const place = (id, x, y) => {
      let b = w.getBall(id);
      if (!b) b = w.addBall(id, x, y);
      b.active = true; b.pocket = -1; b.x = x; b.y = y; b.vx = b.vy = b.wx = b.wy = b.wz = 0;
    };

    if (p.kind === 'free') { setupRack(w, (rng() * 1e9) >>> 0); return; }

    const cueP = rand();
    place(CUE_ID, cueP.x, cueP.y);
    const count = p.kind === 'aim' ? 6 : 1;
    const ids = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15].sort(() => rng() - 0.5).slice(0, count);

    for (const id of ids) {
      for (let k = 0; k < 200; k++) {
        const q = rand();
        if (free(q.x, q.y)) { place(id, q.x, q.y); break; }
      }
    }
    if (p.kind === 'shot') {
      // keep only layouts with a clean, pottable line so the exercise is fair
      for (let k = 0; k < 400; k++) {
        const c = rand(), t = rand();
        if (Math.hypot(c.x - t.x, c.y - t.y) < 0.25) continue;
        place(CUE_ID, c.x, c.y);
        place(ids[0], t.x, t.y);
        const r = rankShots(w.balls, ids);
        if (r.ranked.length && r.ranked[0].difficulty < 55) { p.targetPocket = r.ranked[0].pocketId; p.targetId = ids[0]; break; }
      }
    }
  }

  // ------------------------------------------------------------------ assistance + visuals
  setAssistLevel(level) {
    this.assist.setLevel(level);
    this.settings.set('assistanceLevel', this.assist.level);
    this._assistDirty = true;
  }

  setTrajectoryVisible(v) { this.assist.showTrajectory = v; }

  selectRanked(i) {
    const c = this.assistResult?.ranking?.[i];
    if (c && this.canHumanAct()) { this.aim.snapToShot(c); this._assistDirty = true; }
  }

  setPower(p) { if (this.canHumanAct()) this.aim.setPower(p); }
  setSpin(a, b) { if (this.canHumanAct()) this.aim.setSpin(a, b); }

  _updateAssistance(dt) {
    this._assistTimer -= dt;
    const changed = this.aim.version !== this._assistVersion || this._assistDirty;
    if (!changed || this._assistTimer > 0) return;
    this._assistTimer = 0.04;
    this._assistVersion = this.aim.version;
    this._assistDirty = false;
    const cue = this.world.getBall(CUE_ID);
    if (!cue || !cue.active) { this.assistResult = null; return; }
    try {
      this.assistResult = this.assist.compute(this.world, this.aim, this.legalIds());
    } catch (err) {
      console.error('[assist] failed', err);
      this.assistResult = null;
    }
  }

  _syncScene(dt) {
    const sc = this.scene;
    sc.balls.sync(this.state === 'replay' && this.replay ? this.replay.world : this.world, dt);
    const cue = this.world.getBall(CUE_ID);
    const showCue = cue && cue.active && ['aiming', 'aiThinking', 'aiAiming', 'striking'].includes(this.state);
    sc.cue.setVisible(!!showCue);
    if (showCue) {
      const idle = 0.012 + this.aim.power * 0.03;
      const gap = this.state === 'striking' ? 0.012 + this.controller.pull : idle;
      sc.cue.place(cue, this.aim.angle, Math.max(0.0005, gap), this.aim.a, this.aim.b);
    }
    const showAim = this.state === 'aiming' && this.isHumanTurn() && !this.paused;
    const vis = this.assist.showTrajectory && showAim;
    sc.aimRenderer.update(showAim ? this.assistResult : null, vis, dt);
    if (showAim) sc.aimRenderer.updateRecommendation(this.assistResult, this.world, this.assist.showTrajectory);

    const focus = this.assistResult?.ghost || null;
    sc.updateCamera(dt, {
      cue: cue && cue.active ? cue : { x: 0, y: 0 },
      aimAngle: this.aim.angle,
      focus,
      shooting: this.state === 'rolling' || this.state === 'striking' || this.state === 'replay',
    });
  }

  // ------------------------------------------------------------------ UI state
  getHudState() {
    const r = this.rules;
    const players = (this.players || []).map((p, i) => ({
      name: p.name, type: p.type, color: p.color,
      group: r ? r.groups[i] : null,
      pocketed: this.score ? [...this.score.players[i].pocketed] : [],
      score: this.score ? this.score.score(i) : 0,
      remaining: r && r.groups[i] ? r.remainingOwn(i).length : null,
    }));
    return {
      mode: this.config?.mode,
      practice: this.practice ? { ...this.practice } : null,
      state: this.state,
      elapsed: Math.floor(this.elapsed),
      shotClock: this.clockTotal > 0 && this.rules && this.isHumanTurn() && this.state === 'aiming' ? Math.max(0, Math.ceil(this.clockLeft)) : null,
      shotClockTotal: this.clockTotal,
      slowMo: this.timeScale < 1,
      fineAim: !!this.controller.fine,
      canReplay: this.canReplay(),
      replaying: this.state === 'replay',
      paused: this.paused,
      current: this.turn ? this.turn.current : 0,
      players,
      ballInHand: this._ballInHand(),
      power: this.aim.power,
      spin: { a: this.aim.a, b: this.aim.b },
      assistLevel: this.assist.level,
      showTrajectory: this.assist.showTrajectory,
      cameraMode: this.scene.cameraManager.mode,
      humanTurn: this.isHumanTurn(),
      canAct: this.canHumanAct(),
      message: this.message,
      assist: this.assistResult ? {
        alignment: this.assistResult.alignment,
        ranking: this.assistResult.ranking,
        unavailable: this.assistResult.unavailable,
        recommended: this.assistResult.recommended,
        predictedPocketed: this.assistResult.predictedPocketed,
        predictedScratch: this.assistResult.predictedScratch,
        level: this.assistResult.level,
      } : null,
    };
  }
}

export { BALL, EIGHT_ID, insidePlayArea, clamp };
