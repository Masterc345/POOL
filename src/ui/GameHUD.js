import { h, clear, show } from './dom.js';
import { ASSIST_LEVELS, BALL_COLORS, GROUPS } from '../utils/Constants.js';
import { POCKETS } from '../table/TableGeometry.js';
import { CAMERA_MODES } from '../camera/CameraManager.js';

function ballIcon(id, small = false) {
  const stripe = id >= 9;
  const c = BALL_COLORS[id];
  return h('span', {
    class: `ball-icon ${small ? 'small' : ''}`,
    style: { background: stripe ? `linear-gradient(#f4f1e6 0 28%, ${c} 28% 72%, #f4f1e6 72%)` : c },
  }, h('i', {}, id));
}

export class GameHUD {
  /** cb: onPause, onFire, onPower(p), onSpin(a,b), onCamera(mode), onAssist(level), onSelectRank(i), onReset, onTrajectory(v) */
  constructor(root, cb) {
    this.cb = cb;
    this.cache = {};
    this.el = h('div', { class: 'hud hidden' });

    this.cards = [0, 1].map(() => ({
      root: h('div', { class: 'player-card' }),
      name: h('div', { class: 'pname' }),
      group: h('div', { class: 'pgroup' }),
      balls: h('div', { class: 'pballs' }),
      score: h('div', { class: 'pscore' }),
    }));
    this.cards.forEach((c) => c.root.append(h('div', { class: 'ptop' }, c.name, c.score), c.group, c.balls));
    this.topBar = h('div', { class: 'top-bar' }, this.cards[0].root, this.cards[1].root);
    this.practiceBar = h('div', { class: 'practice-bar hidden' });
    this.pauseBtn = h('button', { class: 'icon-btn pause', title: 'Pause (Esc)', onclick: () => cb.onPause() }, '\u2759\u2759');
    this.toast = h('div', { class: 'toast hidden' });
    this.timer = h('div', { class: 'timer' });
    this.caption = h('div', { class: 'caption hidden' });

    // power
    this.powerFill = h('div', { class: 'power-fill' });
    this.powerLabel = h('div', { class: 'power-label' }, '50%');
    this.powerBar = h('div', { class: 'power-bar', title: 'Shot power (mouse wheel or Up/Down keys)' }, this.powerFill);
    this._dragBar(this.powerBar, (fx, fy) => cb.onPower(1 - fy));
    this.shootBtn = h('button', { class: 'btn primary shoot', onclick: () => cb.onFire() }, 'SHOOT');
    this.powerBox = h('div', { class: 'power-box' }, h('div', { class: 'label' }, 'POWER'), this.powerBar, this.powerLabel, this.shootBtn);

    // spin
    this.spinDot = h('div', { class: 'spin-dot' });
    this.spinDisc = h('div', { class: 'spin-disc', title: 'Cue ball spin: drag to set tip position, double-click to centre' }, h('div', { class: 'spin-h' }), h('div', { class: 'spin-v' }), this.spinDot);
    this._dragBar(this.spinDisc, (fx, fy) => cb.onSpin((fx - 0.5) * 2, -(fy - 0.5) * 2));
    this.spinDisc.addEventListener('dblclick', () => cb.onSpin(0, 0));
    this.spinLabel = h('div', { class: 'spin-label' }, 'Centre');
    this.spinBox = h('div', { class: 'spin-box' }, h('div', { class: 'label' }, 'SPIN'), this.spinDisc, this.spinLabel);

    // camera + assistance
    this.camBtns = CAMERA_MODES.map((m, i) => h('button', { class: 'seg', title: `Key ${i + 1}`, onclick: () => cb.onCamera(m) }, `${i + 1} ${m[0].toUpperCase() + m.slice(1)}`));
    this.assistBtns = ASSIST_LEVELS.map((l, i) => h('button', { class: 'seg', onclick: () => cb.onAssist(i + 1) }, l));
    this.trajBtn = h('button', { class: 'seg', title: 'Show or hide trajectory lines', onclick: () => cb.onTrajectory() }, 'Lines');
    this.bottomBar = h('div', { class: 'bottom-bar' },
      h('div', { class: 'group' }, h('div', { class: 'label' }, 'CAMERA (C)'), h('div', { class: 'segmented' }, ...this.camBtns)),
      h('div', { class: 'group' }, h('div', { class: 'label' }, 'AIMING ASSISTANCE'), h('div', { class: 'segmented' }, ...this.assistBtns, this.trajBtn)));

    // right panel
    this.alignBox = h('div', { class: 'panel align hidden' });
    this.rankBox = h('div', { class: 'panel rank hidden' });
    this.rightCol = h('div', { class: 'right-col' }, this.alignBox, this.rankBox);

    this.hint = h('div', { class: 'hint' }, 'Drag to aim \u00b7 Shift = fine \u00b7 Mouse wheel = power \u00b7 Space shoot \u00b7 Right-drag / Ctrl+wheel camera \u00b7 1-3 cameras');
    this.resetBtn = h('button', { class: 'btn small hidden', onclick: () => cb.onReset() }, 'Reset table');
    this.replayBtn = h('button', { class: 'btn small', title: 'Instant replay of the last shot (R)', onclick: () => cb.onReplay() }, '\u27F2 Replay (R)');
    this.slowBtn = h('button', { class: 'btn small', title: 'Slow motion (T)', onclick: () => cb.onSlowMo() }, '\u{1F40C} Slow-mo (T)');
    this.fineBtn = h('button', { class: 'btn small', title: 'Fine aim: slower, more precise turning', onclick: () => { cb.onFine(); } }, '\u25CE Fine aim');
    this.tools = h('div', { class: 'tools' }, this.fineBtn, this.replayBtn, this.slowBtn, this.resetBtn);
    this.assistToggle = h('button', { class: 'icon-btn assist-toggle', title: 'Show or hide the aiming assistant panels', onclick: () => this.rightCol.classList.toggle('open') }, 'i');
    this.leftCol = h('div', { class: 'left-col' }, this.powerBox, this.spinBox);

    this.el.append(this.topBar, this.practiceBar, this.pauseBtn, this.timer, this.caption, this.toast, this.leftCol, this.rightCol, this.bottomBar, this.hint, this.tools, this.assistToggle);
    root.append(this.el);
  }

  _dragBar(el, fn) {
    let down = false;
    const handle = (e) => {
      const r = el.getBoundingClientRect();
      fn(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    };
    el.addEventListener('pointerdown', (e) => { down = true; el.setPointerCapture(e.pointerId); handle(e); });
    el.addEventListener('pointermove', (e) => { if (down) handle(e); });
    el.addEventListener('pointerup', () => { down = false; });
  }

  show(on = true) { show(this.el, on); }

  /** Commentator caption (shown for a few seconds). */
  setCaption(text) {
    this.caption.textContent = `\u{1F399} ${text}`;
    show(this.caption, true);
    this._captionUntil = performance.now() + Math.max(3500, text.length * 70);
  }

  _set(key, value, apply) {
    const s = typeof value === 'object' ? JSON.stringify(value) : value;
    if (this.cache[key] === s) return;
    this.cache[key] = s;
    apply(value);
  }

  update(st, settings) {
    // players
    st.players.forEach((p, i) => {
      const c = this.cards[i];
      if (!c) return;
      this._set(`p${i}`, { n: p.name, g: p.group, b: p.pocketed, s: p.score, cur: st.current === i, rem: p.remaining, t: p.type }, () => {
        c.root.classList.toggle('active', st.current === i);
        c.root.style.setProperty('--pc', p.color || '#fff');
        c.name.textContent = p.name + (st.current === i ? ' \u25C0' : '');
        c.score.textContent = String(p.score);
        c.group.textContent = st.mode === 'practice' ? 'Practice' : p.group ? (p.group === GROUPS.SOLIDS ? 'Solids (1-7)' : 'Stripes (9-15)') + (p.remaining === 0 ? ' - shoot the 8!' : '') : 'Table open';
        clear(c.balls).append(...p.pocketed.map((id) => ballIcon(id, true)));
      });
    });
    this.cards[1].root.classList.toggle('hidden', st.players.length < 2);

    // practice bar
    const pr = st.practice;
    this._set('practice', pr || {}, () => {
      show(this.practiceBar, !!pr);
      show(this.resetBtn, !!pr);
      if (pr) {
        const extra = pr.kind === 'shot' ? ` \u00b7 Streak ${pr.streak} (best ${pr.best})` : '';
        this.practiceBar.textContent = `Shots ${pr.shots} \u00b7 Pocketed ${pr.pocketed}${extra}`;
      }
    });

    if (this._captionUntil && performance.now() > this._captionUntil) { show(this.caption, false); this._captionUntil = 0; }

    // match timer + shot clock
    const mm = String(Math.floor(st.elapsed / 60)).padStart(2, '0'), ss = String(st.elapsed % 60).padStart(2, '0');
    this._set('timer', { t: `${mm}:${ss}`, c: st.shotClock }, () => {
      this.timer.textContent = `\u23F1 ${mm}:${ss}` + (st.shotClock !== null ? `   \u00b7   Shot clock ${st.shotClock}s` : '');
      this.timer.classList.toggle('urgent', st.shotClock !== null && st.shotClock <= 10);
    });

    // message
    const m = st.message;
    if (m) {
      this._set('msg', m.at, () => {
        this.toast.textContent = m.text;
        this.toast.className = `toast ${m.kind}`;
        this._toastUntil = performance.now() + (m.kind === 'foul' ? 5500 : 3500);
      });
      show(this.toast, performance.now() < (this._toastUntil || 0));
    }

    // state-dependent bits
    const active = st.humanTurn && st.state === 'aiming';
    this._set('active', { a: active, bih: st.ballInHand, st: st.state }, () => {
      this.leftCol.classList.toggle('disabled', !active);
      this.shootBtn.disabled = !active;
      this.shootBtn.textContent = st.state === 'rolling' ? '...' : st.state === 'striking' ? '...' : st.humanTurn ? 'SHOOT' : 'WAIT';
    });
    this._set('power', Math.round(st.power * 100), (v) => { this.powerFill.style.height = `${v}%`; this.powerLabel.textContent = `${v}%`; });
    this._set('spin', { a: +st.spin.a.toFixed(2), b: +st.spin.b.toFixed(2) }, ({ a, b }) => {
      this.spinDot.style.left = `${50 + a * 42}%`;
      this.spinDot.style.top = `${50 - b * 42}%`;
      const parts = [];
      if (Math.abs(b) > 0.12) parts.push(b > 0 ? 'Top' : 'Back');
      if (Math.abs(a) > 0.12) parts.push(a > 0 ? 'Right' : 'Left');
      this.spinLabel.textContent = parts.length ? parts.join(' + ') : 'Centre';
    });
    this._set('cam', st.cameraMode, (m2) => CAMERA_MODES.forEach((c, i) => this.camBtns[i].classList.toggle('on', c === m2)));
    this._set('assistLevel', st.assistLevel, (l) => this.assistBtns.forEach((b, i) => b.classList.toggle('on', i + 1 === l)));
    this._set('traj', st.showTrajectory, (v) => this.trajBtn.classList.toggle('on', v));
    this._set('fine', !!st.fineAim, (v) => { this.fineBtn.classList.toggle('on', v); this.fineBtn.textContent = v ? '\u25CE Fine aim: ON' : '\u25CE Fine aim'; });
    this._set('tools', { r: st.canReplay, p: st.replaying, s: st.slowMo }, () => {
      this.replayBtn.disabled = !st.canReplay && !st.replaying;
      this.replayBtn.textContent = st.replaying ? '\u25A0 Stop replay (R)' : '\u27F2 Replay (R)';
      this.slowBtn.textContent = st.slowMo ? '\u25B6 Normal speed (T)' : '\u{1F40C} Slow-mo (T)';
    });
    this._set('hint', settings.get('showHints'), (v) => show(this.hint, v));
    this._set('bih', st.ballInHand && st.humanTurn && st.state === 'aiming', (v) => {
      if (v) this.hint.textContent = 'Ball in hand: click the table to place the cue ball, then drag to aim';
      else this.hint.textContent = 'Drag to aim \u00b7 Shift = fine \u00b7 Mouse wheel = power \u00b7 Space shoot \u00b7 Right-drag / Ctrl+wheel camera \u00b7 1-3 cameras';
    });

    this._renderAssist(st);
  }

  _renderAssist(st) {
    const a = st.assist;
    const showAlign = !!(a && a.alignment && st.humanTurn && st.state === 'aiming');
    this._set('align', showAlign ? { al: a.alignment && { s: a.alignment.state, m: a.alignment.message, c: a.alignment.checks, d: a.alignment.difficulty && Math.round(a.alignment.difficulty), l: a.alignment.difficultyLabel }, pp: a.predictedPocketed, sc: a.predictedScratch } : null, () => {
      show(this.alignBox, showAlign);
      if (!showAlign) return;
      const al = a.alignment;
      const sym = (ok) => (ok === null ? '\u2013' : ok ? '\u2714' : '\u2716');
      clear(this.alignBox).append(
        h('div', { class: `title state-${al.state}` }, 'Alignment'),
        h('div', { class: 'msg' }, al.message),
        ...al.checks.map((c) => h('div', { class: `chk ${c.ok === null ? 'na' : c.ok ? 'ok' : 'bad'}` }, h('b', {}, sym(c.ok)), ' ', c.label)),
        al.difficulty !== null ? h('div', { class: 'diff' }, h('span', {}, `Shot difficulty: ${al.difficultyLabel}`), h('div', { class: 'bar' }, h('i', { style: { width: `${Math.round(al.difficulty)}%` } }))) : null,
        a.predictedPocketed.length ? h('div', { class: 'pred' }, `Predicted: ${a.predictedPocketed.filter((id) => id !== 0).map((id) => `#${id}`).join(', ') || 'no pot'}${a.predictedScratch ? ' \u26A0 scratch' : ''}`) : null
      );
    });

    const showRank = !!(a && a.ranking && a.ranking.length && st.humanTurn && st.state === 'aiming');
    const key = showRank ? a.ranking.map((r) => `${r.targetId}:${r.pocketId}:${Math.round(r.difficulty)}`).join('|') + (a.unavailable || []).map((u) => u.targetId).join(',') + (a.alignment?.targetId ?? '') : '';
    this._set('rank', key, () => {
      show(this.rankBox, showRank);
      if (!showRank) return;
      clear(this.rankBox).append(
        h('div', { class: 'title' }, 'Best shots'),
        ...a.ranking.map((r, i) => h('button', { class: `rank-item ${i === 0 ? 'best' : ''} ${a.alignment?.targetId === r.targetId ? 'sel' : ''}`, onclick: () => this.cb.onSelectRank(i), title: 'Click to aim at this shot' },
          h('span', { class: 'rk' }, i === 0 ? '\u2605' : `#${i + 1}`), ballIcon(r.targetId, true),
          h('span', { class: 'rt' }, `\u2192 ${POCKETS[r.pocketId].name}`),
          h('span', { class: `rd d-${r.label.replace(' ', '').toLowerCase()}` }, `${r.label} ${Math.round(r.difficulty)}%`))),
        ...(a.unavailable || []).map((u) => h('div', { class: 'rank-item muted' }, ballIcon(u.targetId, true), h('span', { class: 'rt' }, `No shot: ${u.reason}`)))
      );
    });
  }
}
