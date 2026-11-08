import { describe, it, expect } from 'vitest';
import { RulesEngine } from '../src/gameplay/RulesEngine.js';
import { ScoreManager } from '../src/gameplay/ScoreManager.js';

const hit = (a, b) => ({ type: 'ballHit', a, b });
const rail = (id) => ({ type: 'cushion', id });
const pot = (id) => ({ type: 'pocket', id, pocket: 0 });

function afterBreak() {
  const r = new RulesEngine();
  r.processShot([hit(0, 1), rail(2), rail(3), rail(4), rail(5), rail(0)]);
  return r;
}

describe('RulesEngine', () => {
  it('starts with an open table, ball in hand behind the head string', () => {
    const r = new RulesEngine();
    expect(r.ballInHandKitchen).toBe(true);
    expect(r.legalTargets()).toHaveLength(14);
    expect(r.legalTargets()).not.toContain(8);
  });

  it('legal break without a pot passes the turn without a foul and keeps the table open', () => {
    const r = new RulesEngine();
    const o = r.processShot([hit(0, 1), rail(2), rail(3), rail(4), rail(5)]);
    expect(o.foul).toBe(false);
    expect(o.nextPlayer).toBe(1);
    expect(r.groups).toEqual([null, null]);
  });

  it('a break pot lets the breaker continue', () => {
    const r = new RulesEngine();
    const o = r.processShot([hit(0, 1), pot(5), rail(2)]);
    expect(o.foul).toBe(false);
    expect(o.continues).toBe(true);
  });

  it('illegal break (fewer than 4 rails, no pot) is a foul with ball in hand', () => {
    const r = new RulesEngine();
    const o = r.processShot([hit(0, 1), rail(2)]);
    expect(o.foul).toBe(true);
    expect(o.ballInHand).toBe(true);
    expect(o.nextPlayer).toBe(1);
  });

  it('8-ball on the break is re-spotted, not a loss', () => {
    const r = new RulesEngine();
    const o = r.processShot([hit(0, 1), pot(8), rail(2), rail(3), rail(4), rail(5)]);
    expect(o.winner).toBeNull();
    expect(o.respot).toEqual([8]);
    expect(r.onTable.has(8)).toBe(true);
  });

  it('assigns groups on the first legal pot after the break', () => {
    const r = afterBreak(); // player 1 to shoot
    const o = r.processShot([hit(0, 10), pot(10)]);
    expect(o.assigned.group).toBe('stripes');
    expect(r.groups[1]).toBe('stripes');
    expect(r.groups[0]).toBe('solids');
    expect(o.continues).toBe(true);
  });

  it('first contact with the wrong group is a foul', () => {
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]); // player 1 = stripes
    const o = r.processShot([hit(0, 3), rail(0), pot(11)]);
    expect(o.foul).toBe(true);
    expect(o.fouls.join()).toContain('wrong ball');
    expect(o.nextPlayer).toBe(0);
    expect(o.ballInHand).toBe(true);
  });

  it('scratch is a foul even when a ball is pocketed', () => {
    const r = afterBreak();
    const o = r.processShot([hit(0, 10), pot(10), pot(0)]);
    expect(o.foul).toBe(true);
    expect(o.fouls.join()).toContain('Scratch');
    expect(o.nextPlayer).toBe(0);
  });

  it('no rail after contact (without a pot) is a foul', () => {
    const r = afterBreak();
    const o = r.processShot([hit(0, 10)]);
    expect(o.foul).toBe(true);
  });

  it('pocketing only the opponent ball ends the turn without a foul', () => {
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]); // p1 stripes; still p1
    const o = r.processShot([hit(0, 9), pot(2), rail(0)]);
    expect(o.foul).toBe(false);
    expect(o.legalPots).toEqual([]);
    expect(o.nextPlayer).toBe(0);
  });

  it('missing the cue ball entirely is a foul', () => {
    const r = afterBreak();
    const o = r.processShot([rail(0)]);
    expect(o.foul).toBe(true);
  });

  it('must hit the 8-ball first once the group is cleared', () => {
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]);
    for (const id of [9, 10, 11, 12, 13, 14, 15]) r.onTable.delete(id);
    expect(r.legalTargets()).toEqual([8]);
    const o = r.processShot([hit(0, 3), rail(0)]);
    expect(o.foul).toBe(true);
  });

  it('wins by legally pocketing the 8-ball after clearing the group', () => {
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]);
    for (const id of [9, 10, 11, 12, 13, 14, 15]) r.onTable.delete(id);
    const o = r.processShot([hit(0, 8), pot(8), rail(0)]);
    expect(o.winner).toBe(1);
    expect(r.winner).toBe(1);
  });

  it('loses by pocketing the 8-ball early', () => {
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]);
    const o = r.processShot([hit(0, 9), pot(8), rail(0)]);
    expect(o.winner).toBe(0);
  });

  it('loses by scratching while pocketing the 8-ball', () => {
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]);
    for (const id of [9, 10, 11, 12, 13, 14, 15]) r.onTable.delete(id);
    const o = r.processShot([hit(0, 8), pot(8), pot(0)]);
    expect(o.winner).toBe(0);
  });
});

describe('shot clock', () => {
  it('a timeout is a foul that gives the opponent ball in hand', () => {
    const r = afterBreak(); // player 1 to shoot
    const o = r.processTimeout();
    expect(o.foul).toBe(true);
    expect(o.fouls[0]).toContain('Shot clock');
    expect(o.nextPlayer).toBe(0);
    expect(r.current).toBe(0);
    expect(r.ballInHand).toBe(true);
  });
});

describe('ScoreManager', () => {
  it('tracks pots, fouls and runs', () => {
    const s = new ScoreManager(2);
    s.recordShot(0, { legalPots: [1], foul: false, continues: true });
    s.recordShot(0, { legalPots: [2, 3], foul: false, continues: true });
    s.recordShot(0, { legalPots: [], foul: true, continues: false });
    expect(s.score(0)).toBe(3);
    expect(s.players[0].fouls).toBe(1);
    expect(s.players[0].longestRun).toBe(3);
  });
});
