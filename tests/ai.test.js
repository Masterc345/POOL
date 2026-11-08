import { describe, it, expect } from 'vitest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { applyCueStrike } from '../src/physics/CueImpact.js';
import { RulesEngine } from '../src/gameplay/RulesEngine.js';
import { setupRack, placeCueBall, respotBall, validCuePlacement, defaultCuePlacement } from '../src/gameplay/TableState.js';
import { AIPlayer } from '../src/ai/AIPlayer.js';
import { CUE_ID } from '../src/balls/Rack.js';

/** Headless eight-ball match using only the production modules (physics + rules + AI). */
function playMatch(diffs, seed, maxTurns = 120) {
  const world = new PhysicsWorld();
  setupRack(world, seed);
  const rules = new RulesEngine();
  const ais = diffs.map((d, i) => new AIPlayer(d, seed * 17 + i));
  let turns = 0, fouls = 0, pots = 0;
  while (rules.winner === null && turns++ < maxTurns) {
    const ai = ais[rules.current];
    const isBreak = !rules.breakDone;
    const cue = world.getBall(CUE_ID);
    if (rules.ballInHand || !cue.active) {
      const pos = ai.choosePlacement(world, rules.legalTargets(), rules.ballInHandKitchen);
      if (!validCuePlacement(world, pos.x, pos.y, rules.ballInHandKitchen)) throw new Error('AI chose an invalid placement');
      placeCueBall(world, pos.x, pos.y);
    }
    const shot = ai.chooseShot({ world, legalIds: rules.legalTargets(), isBreak });
    world.clearEvents();
    applyCueStrike(world.getBall(CUE_ID), { dirX: Math.cos(shot.angle), dirY: Math.sin(shot.angle), speed: shot.speed, a: shot.a, b: shot.b });
    world.runUntilSettled(60);
    if (!world.isSettled()) throw new Error('simulation did not settle');
    const out = rules.processShot(world.events);
    for (const id of out.respot) respotBall(world, id);
    if (out.foul) fouls++;
    pots += out.legalPots.length;
    if (!world.getBall(CUE_ID).active && out.winner === null) {
      const d = defaultCuePlacement(world, false);
      placeCueBall(world, d.x, d.y);
    }
  }
  return { winner: rules.winner, turns, fouls, pots, rules };
}

describe('AI opponents play complete games with the real physics and rules', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    it(`${level} vs ${level} finishes or makes steady progress without errors`, () => {
      let totalPots = 0, finished = 0;
      for (let seed = 1; seed <= 3; seed++) {
        const r = playMatch([level, level], seed, 60);
        totalPots += r.pots;
        if (r.winner !== null) finished++;
      }
      expect(totalPots).toBeGreaterThan(8);
      if (level === 'hard') expect(finished).toBeGreaterThanOrEqual(2);
    });
  }

  it('hard AI pots more balls per shot than easy AI', () => {
    const potsPerTurn = (lvl) => {
      let p = 0, t = 0;
      for (let seed = 11; seed <= 14; seed++) { const r = playMatch([lvl, lvl], seed, 40); p += r.pots; t += r.turns; }
      return p / t;
    };
    expect(potsPerTurn('hard')).toBeGreaterThan(potsPerTurn('easy'));
  });

  it('AI placement is always legal (kitchen and open table)', () => {
    const world = new PhysicsWorld();
    setupRack(world, 5);
    const ai = new AIPlayer('hard', 1);
    for (const kitchen of [true, false]) {
      const p = ai.choosePlacement(world, [1, 2, 3], kitchen);
      expect(validCuePlacement(world, p.x, p.y, kitchen)).toBe(true);
    }
  });
});
