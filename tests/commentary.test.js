import { describe, it, expect } from 'vitest';
import { createCommentary } from '../src/audio/CommentaryScript.js';
import { RulesEngine } from '../src/gameplay/RulesEngine.js';
import { createRng } from '../src/utils/Helpers.js';

const players = [{ name: 'Alex' }, { name: 'Sam' }];
const ctx = { players, remaining: () => 5, run: () => 1 };
const hit = (a, b) => ({ type: 'ballHit', a, b });
const rail = (id) => ({ type: 'cushion', id });
const pot = (id) => ({ type: 'pocket', id, pocket: 0 });

function afterBreak() {
  const r = new RulesEngine();
  r.processShot([hit(0, 1), rail(2), rail(3), rail(4), rail(5)]);
  return r;
}

describe('commentary script', () => {
  const c = () => createCommentary(createRng(5));

  it('welcomes players for every mode', () => {
    expect(c().matchStart({ mode: 'single', players, difficulty: 'hard' }).text).toContain('Alex');
    expect(c().matchStart({ mode: 'single', players, difficulty: 'hard' }).text).toContain('hard');
    expect(c().matchStart({ mode: 'local', players }).text).toContain('Sam');
    expect(c().matchStart({ mode: 'practice', players: [players[0]] }).text).toContain('practice');
  });

  it('announces a scratch foul with the reason and who gets ball in hand', () => {
    const r = afterBreak();
    const out = r.processShot([hit(0, 10), pot(10), pot(0)]);
    const line = c().shotResult(out, ctx);
    expect(line.priority).toBe('high');
    expect(line.text.toLowerCase()).toMatch(/scratch|pocket/);
    expect(line.text).toContain('Alex has ball in hand'); // player 1 (Sam) fouled, Alex is next
  });

  it('announces group assignment on the first legal pot', () => {
    const r = afterBreak();
    const out = r.processShot([hit(0, 10), pot(10)]);
    expect(c().shotResult(out, ctx).text).toContain('Sam will be shooting stripes');
  });

  it('mentions the eight ball when a player clears their group', () => {
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]);
    const out = r.processShot([hit(0, 11), pot(11), rail(1)]);
    const line = c().shotResult(out, { ...ctx, remaining: () => 0 });
    expect(line.text).toContain('eight ball');
  });

  it('comments on multi-pots, misses and long runs', () => {
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]);
    const multi = r.processShot([hit(0, 11), pot(11), pot(12), rail(1)]);
    expect(c().shotResult(multi, ctx).text).toContain('2 balls down');
    const miss = r.processShot([hit(0, 13), rail(1)]);
    expect(c().shotResult(miss, ctx).text).toMatch(/Sam|Alex/);
    const r2 = afterBreak();
    r2.processShot([hit(0, 10), pot(10)]);
    const run = r2.processShot([hit(0, 11), pot(11), rail(1)]);
    expect(c().shotResult(run, { ...ctx, run: () => 4 }).text).toContain('4 in a row');
  });

  it('leaves the match result to the end-of-match line', () => {
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]);
    const out = r.processShot([hit(0, 9), pot(8), rail(0)]); // 8-ball too early: loss
    expect(out.winner).toBe(0);
    expect(c().shotResult(out, ctx)).toBeNull();
    const end = c().matchEnd({ winnerName: 'Alex', reason: 'Pocketed the 8-ball legally', summary: { players: [{ pocketed: [1, 2, 3] }, { pocketed: [9] }] } });
    expect(end.text).toContain('Alex wins');
    expect(end.text).toContain('3 balls to 1');
    expect(end.priority).toBe('high');
  });

  it('never repeats the same variable line twice in a row', () => {
    const script = createCommentary(() => 0.0); // worst case: always picks option 0
    const r = afterBreak();
    r.processShot([hit(0, 10), pot(10)]);
    const a = script.shotResult(r.processShot([hit(0, 11), pot(11), rail(1)]), ctx).text;
    const b = script.shotResult(r.processShot([hit(0, 12), pot(12), rail(1)]), ctx).text;
    expect(a.replace(/\d+ ball/, 'N ball')).not.toBe(b.replace(/\d+ ball/, 'N ball'));
  });

  it('has lines for practice shots, replay and the shot clock', () => {
    const s = c();
    expect(s.practiceShot({ scratch: true, pocketed: [], kind: 'free' }).text).toContain('Scratch');
    expect(s.practiceShot({ scratch: false, pocketed: [], kind: 'free' })).toBeNull();
    expect(s.practiceShot({ scratch: false, pocketed: [3], kind: 'shot', ok: true, streak: 4 }).text).toContain('Streak of 4');
    expect(s.replay().text).toContain('another look');
    expect(s.clockWarning(10).text).toContain('10 seconds');
  });
});
