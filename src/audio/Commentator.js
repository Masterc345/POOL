// Speaks commentary lines with the system voices (Web Speech API, works offline with installed
// Windows voices) and always publishes the text as an on-screen caption.
export class Commentator {
  constructor(settings, events) {
    this.settings = settings;
    this.events = events;
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voice = null;
    this.muted = false;
    if (this.synth && this.synth.addEventListener) this.synth.addEventListener('voiceschanged', () => { this.voice = null; });
  }

  get available() { return !!this.synth; }

  /** English voices installed on this computer. */
  voices() {
    if (!this.synth) return [];
    return this.synth.getVoices().filter((v) => /^en/i.test(v.lang));
  }

  _chooseVoice() {
    if (!this.synth) return null;
    const all = this.synth.getVoices();
    if (!all.length) return null;
    const wanted = this.settings.get('commentatorVoice');
    if (wanted) {
      const v = all.find((x) => x.name === wanted);
      if (v) return v;
    }
    const en = all.filter((v) => /^en/i.test(v.lang));
    return en.find((v) => /natural|online/i.test(v.name)) || en.find((v) => /en-(gb|us)/i.test(v.lang)) || en[0] || all[0];
  }

  /** line: { text, priority } or null */
  say(line) {
    if (!line || !this.settings.get('commentary') || this.muted) return;
    this.events.emit('commentary', { text: line.text });
    this._speak(line.text, line.priority === 'high');
  }

  _speak(text, interrupt) {
    if (!this.synth) return;
    try {
      if (this.synth.speaking || this.synth.pending) {
        if (!interrupt) return; // skip low-priority lines instead of building a backlog
        this.synth.cancel();
      }
      const u = new SpeechSynthesisUtterance(text);
      if (!this.voice) this.voice = this._chooseVoice();
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; }
      u.rate = 1.02;
      u.pitch = 0.95;
      u.volume = Math.min(1, Math.max(0, this.settings.get('audioVolume')));
      this.synth.speak(u);
    } catch (err) {
      console.warn('[commentator] speech failed', err);
    }
  }

  /** Used by the settings screen. */
  test() { this.voice = null; this._speak('Welcome to PoolMaster 3D. This is how your commentator sounds.', true); }

  stop() { try { this.synth?.cancel(); } catch { /* ignore */ } }
}
