// What the commentator says. Pure functions (no speech, no DOM) so the script can be unit tested.
// Every method returns { text, priority: 'high' | 'normal' } or null when there is nothing to say.
import { GROUPS } from '../utils/Constants.js';

const pickFrom = (rng, memory, key, options) => {
  if (options.length === 1) return options[0];
  let i = Math.floor(rng() * options.length);
  if (memory[key] === i) i = (i + 1) % options.length; // never repeat the same line twice in a row
  memory[key] = i;
  return options[i];
};

export function createCommentary(rng = Math.random) {
  const memory = {};
  const pick = (key, options) => pickFrom(rng, memory, key, options);
  const line = (text, priority = 'normal') => ({ text, priority });

  const foulText = (fouls) => {
    const f = (fouls && fouls[0]) || '';
    if (f.includes('Shot clock')) return "Time's up! That's a foul.";
    if (f.includes('Scratch')) return pick('scratch', ['Scratch! The cue ball has gone down.', 'Oh no, the white ball is in the pocket. Foul.', "That's a scratch, and a foul."]);
    if (f.includes('No ball was hit')) return 'A complete miss. That is a foul.';
    if (f.includes('wrong ball') || f.includes('8-ball first')) return 'Wrong ball first. Foul.';
    if (f.includes('rail')) return 'No rail after contact. That is a foul.';
    if (f.includes('Illegal break')) return 'Illegal break. Foul.';
    return 'Foul.';
  };

  return {
    /** ctx: { mode, players:[{name}], difficulty } */
    matchStart(ctx) {
      const [a, b] = ctx.players;
      if (ctx.mode === 'practice') return line('Welcome to practice mode. Take your time and enjoy the table.');
      if (ctx.mode === 'single') return line(`Welcome to PoolMaster 3D! ${a.name} takes on the computer on ${ctx.difficulty} difficulty. The break is coming up.`);
      return line(`Welcome to PoolMaster 3D! ${a.name} versus ${b.name}. Let's play some pool.`);
    },

    /** out: RulesEngine outcome. ctx: { players, remaining(playerIndex), run(playerIndex) } */
    shotResult(out, ctx) {
      if (out.winner !== null && out.winner !== undefined) return null; // handled by matchEnd
      const name = ctx.players[out.player].name;
      const next = ctx.players[out.nextPlayer].name;

      if (out.foul) return line(`${foulText(out.fouls)} ${next} has ball in hand.`, 'high');

      if (out.legalPots.length) {
        let text;
        if (out.assigned) {
          const g = out.assigned.group === GROUPS.SOLIDS ? 'solids' : 'stripes';
          text = `Nicely done! ${name} will be shooting ${g}.`;
        } else if (out.legalPots.length > 1) {
          text = `${out.legalPots.length} balls down in one shot! Superb, ${name}.`;
        } else if (out.isBreak) {
          text = `A ball drops on the break! ${name} stays at the table.`;
        } else {
          const id = out.legalPots[0];
          text = pick('pot', [`${name} drops the ${id} ball.`, `Nice shot, ${name}!`, `The ${id} ball is down. Lovely.`, 'Beautifully played.', `${name} makes it look easy.`]);
        }
        const rem = ctx.remaining(out.player);
        if (rem === 0 && !out.assigned) text += ` ${name} is down to the eight ball.`;
        else if (ctx.run(out.player) >= 3) text += ` ${name} is on a roll with ${ctx.run(out.player)} in a row.`;
        return line(text);
      }

      if (out.isBreak) return line(`The break is done and the table is open. ${next} to shoot.`);
      return line(pick('miss', [`No luck for ${name}. ${next} steps up.`, `${name} misses. ${next} to the table.`, `Not this time. Over to ${next}.`]));
    },

    matchEnd(r) {
      const [a, b] = r.summary.players;
      return line(`${r.winnerName} wins the match, ${a.pocketed.length} balls to ${b.pocketed.length}! ${r.reason}.`, 'high');
    },

    practiceShot(e) {
      if (e.scratch) return line('Scratch. The cue ball is back on the table.');
      if (e.kind === 'shot') {
        if (!e.ok) return line(pick('pmiss', ['Not quite. Try again.', 'Just missed. Have another go.']));
        return line(e.streak >= 3 ? `Streak of ${e.streak}! You are in the zone.` : pick('pok', ['Pocketed!', 'That is the shot.', 'Well done.']));
      }
      if (e.pocketed.length) return line(pick('pp', ['Pocketed!', 'Nice one.']));
      return null;
    },

    replay() { return line('Let us take another look at that shot.'); },

    clockWarning(seconds = 10) { return line(`${seconds} seconds left on the shot clock.`, 'high'); },
  };
}
