import { describe, it, expect } from 'vitest';

// Headless integration test of MatchManager + CueController + AI + rules + physics with a stubbed scene.
globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} };

const { MatchManager } = await import('../src/gameplay/MatchManager.js');
const { EventManager } = await import('../src/core/EventManager.js');
const { SettingsStore } = await import('../src/core/Settings.js');
const { StatsStore } = await import('../src/core/Stats.js');
const { createMemoryBackend, createRng } = await import('../src/utils/Helpers.js');

function makeMatch() {
  const settings = new SettingsStore(createMemoryBackend());
  settings.patch({ assistanceLevel: 5 });
  const stats = new StatsStore(createMemoryBackend());
  const events = new EventManager();
  const log = { messages: [], ended: null, shots: 0, sounds: 0 };
  events.on('message', (m) => log.messages.push(m.text));
  events.on('matchEnd', (r) => { log.ended = r; });
  events.on('shot', () => { log.shots++; });
  const canvas = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), setPointerCapture() {} };
  const poolScene = {
    camera: { matrixWorld: {} },
    cameraManager: { mode: 'free' },
    balls: { sync() {}, integrate() {}, setCuePlacementState() {} },
    cue: { setVisible() {}, place() {} },
    aimRenderer: { update() {}, hideAll() {}, updateRecommendation() {} },
    updateCamera() {},
  };
  const sound = { playEvent() { log.sounds++; }, playCue() {}, playUi() {}, unlock() {} };
  const match = new MatchManager({ poolScene, sceneManager: { canvas }, settings, sound, events, stats });
  return { match, log, stats, settings };
}

/** Plays the human side: take the recommended shot (or any shot) whenever it is a human's turn. */
function drive(match, maxFrames, onFrame) {
  const dt = 1 / 60;
  const rng = createRng(99);
  let idleFrames = 0;
  for (let f = 0; f < maxFrames && match.state !== 'gameOver'; f++) {
    match.update(dt);
    if (match.state === 'aiming' && match.isHumanTurn()) {
      idleFrames++;
      if (idleFrames > 3) { // let the assistant compute first
        const top = match.assistResult?.ranking?.[0];
        if (top) match.selectRanked(0);
        else { match.aim.rotate((rng() - 0.5) * 0.3); match.aim.setPower(0.9); } // e.g. the break
        match.fire();
        idleFrames = 0;
        onFrame?.();
      }
    }
  }
}

describe('MatchManager integration', () => {
  it('plays single-player matches against the AI through the full turn cycle', () => {
    let totalShots = 0, ended = 0;
    for (const seed of [3, 4, 5]) {
      const { match, log, stats } = makeMatch();
      match.start({ mode: 'single', difficulty: 'hard', seed });
      expect(match.state === 'aiming' || match.state === 'aiThinking').toBe(true);
      drive(match, 60 * 60 * 25);
      totalShots += log.shots;
      if (log.ended) {
        ended++;
        expect(['Computer (Hard)', 'Player 1']).toContain(log.ended.winnerName);
        expect(stats.data.gamesPlayed).toBe(1);
        expect(match.state).toBe('gameOver');
      }
    }
    expect(ended).toBe(3);
    expect(totalShots).toBeGreaterThan(8);
  });

  it('runs local multiplayer games with automatic turn switching', () => {
    const seen = new Set();
    for (const seed of [11, 12, 13]) {
      const { match, log, stats } = makeMatch();
      match.start({ mode: 'local', seed });
      drive(match, 60 * 60 * 25, () => seen.add(match.turn.current));
      expect(log.ended).not.toBeNull();
      expect(stats.data.localMatches).toBe(1);
    }
    expect(seen.has(0) && seen.has(1)).toBe(true);
  });

  it('does not advance while paused', () => {
    const { match } = makeMatch();
    match.start({ mode: 'local' });
    for (let i = 0; i < 10; i++) match.update(1 / 60);
    match.fire();
    for (let i = 0; i < 30; i++) match.update(1 / 60);
    match.paused = true;
    const snap = JSON.stringify(match.world.snapshot());
    const st = match.state;
    for (let i = 0; i < 120; i++) match.update(1 / 60);
    expect(JSON.stringify(match.world.snapshot())).toBe(snap);
    expect(match.state).toBe(st);
    match.paused = false;
    for (let i = 0; i < 60 * 20; i++) match.update(1 / 60);
    expect(match.state).not.toBe('striking');
  });

  for (const kind of ['free', 'aim', 'shot']) {
    it(`practice mode "${kind}" runs repeated shots without errors`, () => {
      const { match, log } = makeMatch();
      match.start({ mode: 'practice', practice: kind });
      drive(match, 60 * 60 * 6, null);
      expect(log.shots).toBeGreaterThan(5);
      const hud = match.getHudState();
      expect(hud.practice.kind).toBe(kind);
      expect(hud.players).toHaveLength(1);
      if (kind === 'shot') expect(match.practice.targetPocket).not.toBeNull();
    });
  }

  it('shot clock forces a foul when time runs out and the timer ignores pauses', () => {
    const { match, settings, log } = makeMatch();
    settings.patch({ shotClock: 30 });
    match.start({ mode: 'local', seed: 5 });
    expect(match.getHudState().shotClock).toBe(30);
    match.paused = true;
    for (let i = 0; i < 600; i++) match.update(1 / 60);
    expect(match.getHudState().elapsed).toBe(0); // paused: no time passes
    match.paused = false;
    const before = match.turn.current;
    for (let i = 0; i < 60 * 31; i++) match.update(1 / 60);
    expect(match.turn.current).not.toBe(before);
    expect(log.messages.some((m) => m.includes('Shot clock expired'))).toBe(true);
    expect(match.getHudState().elapsed).toBeGreaterThan(29);
  });

  it('warns once when 10 seconds remain on the shot clock', () => {
    const { match, settings } = makeMatch();
    settings.patch({ shotClock: 30 });
    let warnings = 0;
    match.events.on('clockWarning', () => warnings++);
    match.start({ mode: 'local', seed: 6 });
    for (let i = 0; i < 60 * 25; i++) match.update(1 / 60);
    expect(warnings).toBe(1);
  });

  it('emits practice shot events for the commentator', () => {
    const { match } = makeMatch();
    const got = [];
    match.events.on('practiceShot', (e) => got.push(e));
    match.start({ mode: 'practice', practice: 'shot', seed: 8 });
    shootOnce(match);
    expect(got).toHaveLength(1);
    expect(got[0].kind).toBe('shot');
  });

  it('shot clock is off in practice mode', () => {
    const { match, settings } = makeMatch();
    settings.patch({ shotClock: 30 });
    match.start({ mode: 'practice', practice: 'free' });
    expect(match.getHudState().shotClock).toBeNull();
  });

  /** Fires one shot and runs until the next turn is ready; returns the number of frames the shot took. */
  function shootOnce(match) {
    for (let i = 0; i < 30 && match.state !== 'aiming'; i++) match.update(1 / 60);
    match.aim.setPower(0.7);
    expect(match.fire()).toBe(true);
    let frames = 0;
    while (frames < 60 * 60 && (match.state === 'striking' || match.state === 'rolling')) { match.update(1 / 60); frames++; }
    return frames;
  }

  it('instant replay re-simulates the last shot exactly and returns to the table', async () => {
    const { PhysicsWorld } = await import('../src/physics/PhysicsWorld.js');
    const { applyCueStrike } = await import('../src/physics/CueImpact.js');
    const { match } = makeMatch();
    match.start({ mode: 'local', seed: 21 });
    expect(match.canReplay()).toBe(false); // nothing to replay yet
    shootOnce(match);
    expect(match.lastShot).not.toBeNull();
    expect(match.state).toBe('aiming');
    expect(match.startReplay()).toBe(true);
    expect(match.state).toBe('replay');
    expect(match.canHumanAct()).toBe(false);
    const rw = match.replay.world;
    let guard = 0;
    while (match.state === 'replay' && guard++ < 60 * 40) match.update(1 / 60);
    expect(match.state).toBe('aiming');
    expect(match.replay).toBeNull();
    // independent re-simulation of the stored shot gives identical end positions
    const ref = new PhysicsWorld();
    ref.restore(match.lastShot.snapshot);
    applyCueStrike(ref.getBall(0), match.lastShot.shot, ref.params);
    ref.runUntilSettled(60);
    for (const b of ref.balls) {
      const r = rw.getBall(b.id);
      expect(r.x).toBeCloseTo(b.x, 9);
      expect(r.y).toBeCloseTo(b.y, 9);
      expect(r.active).toBe(b.active);
    }
  });

  it('replay can be stopped early and is unavailable while paused', () => {
    const { match } = makeMatch();
    match.start({ mode: 'local', seed: 22 });
    shootOnce(match);
    match.paused = true;
    expect(match.canReplay()).toBe(false);
    match.paused = false;
    match.toggleReplay();
    expect(match.state).toBe('replay');
    match.update(1 / 60);
    match.toggleReplay();
    expect(match.state).toBe('aiming');
  });

  it('slow motion stretches a shot over more frames without changing the result', () => {
    const run = (slow) => {
      const { match } = makeMatch();
      match.start({ mode: 'local', seed: 23 });
      if (slow) match.toggleSlowMo();
      const frames = shootOnce(match);
      return { frames, pocketed: match.score.players[0].pocketed.length + match.score.players[1].pocketed.length, hud: match.getHudState().slowMo };
    };
    const fast = run(false), slow = run(true);
    expect(slow.hud).toBe(true);
    expect(slow.frames).toBeGreaterThan(fast.frames * 2);
    expect(slow.pocketed).toBe(fast.pocketed);
  });

  it('rejects cue placement behind/outside the kitchen and accepts a valid spot', () => {
    const { match } = makeMatch();
    match.start({ mode: 'local' });
    for (let i = 0; i < 5; i++) match.update(1 / 60);
    expect(match.tryPlaceCue(0.5, 0)).toBe(false); // beyond the head string on the opening break
    expect(match.tryPlaceCue(-0.9, 0.1)).toBe(true);
    expect(match.world.getBall(0).x).toBeCloseTo(-0.9, 6);
  });

  it('HUD state exposes alignment and a ranked list at Professional level', () => {
    const { match } = makeMatch();
    match.start({ mode: 'local' });
    match.rules.breakDone = true; // skip the break to get a layout with open shots
    match.rules.ballInHand = false;
    match.world.getBall(0).x = -0.5;
    for (let i = 0; i < 20; i++) match.update(1 / 60);
    const hud = match.getHudState();
    expect(hud.assistLevel).toBe(5);
    expect(hud.assist).not.toBeNull();
    expect(hud.assist.alignment).not.toBeNull();
  });
});
