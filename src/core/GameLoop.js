// requestAnimationFrame loop with a clamped frame time.
export class GameLoop {
  constructor(update) {
    this.update = update;
    this.running = false;
    this.last = 0;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    try { this.update(dt); } catch (err) { console.error('[loop] update failed', err); }
    this._raf = requestAnimationFrame(this._frame);
  }
}
