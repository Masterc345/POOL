// Procedural audio (Web Audio): no sound files are needed, so the installed game is fully offline.
export class SoundManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicNodes = [];
    this.lastHit = 0;
  }

  /** Must be called from a user gesture (browsers/Chromium suspend audio until then). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
      this.applySettings();
      this._startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applySettings() {
    if (!this.ctx) return;
    this.master.gain.value = this.settings.get('audioVolume');
    this.musicGain.gain.value = this.settings.get('musicVolume') * 0.6;
  }

  _noise(duration) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  _tone({ freq, freqEnd, dur, type = 'sine', gain = 0.3, noise = 0, noiseFreq = 3000 }) {
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.connect(this.master);
    if (freq) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      o.connect(g); o.start(t); o.stop(t + dur + 0.02);
    }
    if (noise > 0) {
      const src = c.createBufferSource();
      src.buffer = this._noise(dur);
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = noiseFreq; f.Q.value = 0.8;
      const ng = c.createGain(); ng.gain.value = noise;
      src.connect(f); f.connect(ng); ng.connect(g); src.start(t);
    }
  }

  /** Collision sound triggers from physics events. */
  playEvent(e) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (e.type === 'ballHit') {
      if (now - this.lastHit < 12) return;
      this.lastHit = now;
      const v = Math.min(1, e.speed / 4);
      this._tone({ freq: 2600 + Math.random() * 500, freqEnd: 1500, dur: 0.07, gain: 0.05 + 0.4 * v, noise: 0.3 * v, noiseFreq: 4200 });
    } else if (e.type === 'cushion') {
      const v = Math.min(1, e.speed / 4);
      this._tone({ freq: 160, freqEnd: 90, dur: 0.12, type: 'triangle', gain: 0.06 + 0.35 * v, noise: 0.2 * v, noiseFreq: 900 });
    } else if (e.type === 'pocket') {
      this._tone({ freq: 220, freqEnd: 70, dur: 0.35, type: 'sine', gain: 0.3, noise: 0.25, noiseFreq: 500 });
    }
  }

  playCue(power) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this._tone({ freq: 1200, freqEnd: 700, dur: 0.05, gain: 0.1 + 0.3 * power, noise: 0.4, noiseFreq: 2500 });
  }

  /** Referee whistle. */
  playWhistle() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 2850;
    const lfo = c.createOscillator(); lfo.frequency.value = 34;
    const lg = c.createGain(); lg.gain.value = 260;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
    g.gain.setValueAtTime(0.09, t + 0.38);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + 0.55); lfo.stop(t + 0.55);
  }

  _applause(dur, gain, delay = 0) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    const clapLen = Math.floor(c.sampleRate * 0.012);
    const claps = Math.floor(dur * 160);
    for (let n = 0; n < claps; n++) {
      const pos = Math.floor(Math.random() * (len - clapLen));
      const env = Math.sin((pos / len) * Math.PI); // swells and fades
      const amp = (0.4 + Math.random() * 0.6) * env;
      for (let i = 0; i < clapLen; i++) d[pos + i] += (Math.random() * 2 - 1) * amp * (1 - i / clapLen);
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(c.currentTime + delay);
  }

  /** kind: 'cheer' | 'win' | 'groan' */
  playCrowd(kind) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (kind === 'cheer') this._applause(1.8, 0.22);
    else if (kind === 'win') { this._applause(5, 0.35); this._applause(3.5, 0.2, 0.6); }
    else if (kind === 'groan') {
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.9);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 1.2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 1.05);
    }
  }

  playUi(kind = 'click') {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (kind === 'click') this._tone({ freq: 700, freqEnd: 500, dur: 0.05, type: 'triangle', gain: 0.08 });
    else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone({ freq: f, dur: 0.25, type: 'triangle', gain: 0.15 }), i * 130));
    else if (kind === 'foul') this._tone({ freq: 180, freqEnd: 120, dur: 0.25, type: 'sawtooth', gain: 0.08 });
  }

  /**
   * Soothing generative music: a warm, slowly evolving pad (Cmaj7 - Am7 - Fmaj7 - Gsus) with soft
   * pentatonic bell notes, all through a long reverb. Generated live, so no audio files are needed.
   */
  _startMusic() {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * 3.8);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const reverb = c.createConvolver();
    reverb.buffer = ir;
    const wet = c.createGain(); wet.gain.value = 0.75;
    const dry = c.createGain(); dry.gain.value = 0.55;
    reverb.connect(wet); wet.connect(this.musicGain);
    const bus = c.createGain();
    bus.connect(dry); dry.connect(this.musicGain); bus.connect(reverb);
    const warm = c.createBiquadFilter();
    warm.type = 'lowpass'; warm.frequency.value = 1100; warm.Q.value = 0.3;
    warm.connect(bus);

    const chords = [
      [130.81, 196.0, 261.63, 329.63, 493.88], // Cmaj7
      [110.0, 164.81, 220.0, 261.63, 392.0], //   Am7
      [87.31, 130.81, 220.0, 261.63, 329.63], //  Fmaj7
      [98.0, 146.83, 196.0, 293.66, 392.0], //    Gsus
    ];
    const bells = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C major pentatonic
    let chord = 0;
    const playChord = () => {
      if (!this.ctx) return;
      const t = c.currentTime;
      for (const f of chords[chord % chords.length]) {
        for (const [type, det, vol] of [['sine', 1, 0.22], ['triangle', 1.003, 0.07]]) {
          const o = c.createOscillator(); o.type = type; o.frequency.value = f * det;
          const g = c.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(vol, t + 4);
          g.gain.linearRampToValueAtTime(vol * 0.8, t + 8);
          g.gain.linearRampToValueAtTime(0, t + 12.5);
          o.connect(g); g.connect(warm);
          o.start(t); o.stop(t + 13);
        }
      }
      chord++;
    };
    const playBell = () => {
      if (!this.ctx) return;
      const t = c.currentTime;
      const f = bells[Math.floor(Math.random() * bells.length)];
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
      const g = c.createGain(), g2 = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 3.2);
      g2.gain.value = 0.15;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(bus);
      o.start(t); o2.start(t); o.stop(t + 3.4); o2.stop(t + 3.4);
    };
    playChord();
    this._musicTimer = setInterval(playChord, 9000);
    const scheduleBell = () => {
      this._bellTimer = setTimeout(() => { if (Math.random() < 0.8) playBell(); scheduleBell(); }, 2500 + Math.random() * 3500);
    };
    scheduleBell();
  }

  dispose() { clearInterval(this._musicTimer); clearTimeout(this._bellTimer); this.ctx?.close(); this.ctx = null; }
}
