// Player input for aiming/shooting plus the cue strike animation (also used for AI shots).
import * as THREE from 'three';
import { clamp, wrapAngle } from '../utils/Helpers.js';
import { fromThreeXZ } from '../utils/Coords.js';

const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.0285); // ball-centre height
const _hit = new THREE.Vector3();
const _ndc = new THREE.Vector2();

export function pointerToTable(e, canvas, camera) {
  const r = canvas.getBoundingClientRect();
  _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  return _ray.ray.intersectPlane(_plane, _hit) ? fromThreeXZ(_hit.x, _hit.z) : null;
}

export class CueController {
  /**
   * @param deps { canvas, camera, aim, settings, getCue:()=>{x,y}|null, canAim:()=>bool,
   *               canPlace:()=>bool, tryPlace:(x,y)=>bool, onFire:()=>void, onPreview:(x,y)=>void }
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.drag = null;
    this.fine = false; // fine-aim toggle (HUD button) for touch screens
    this.touches = new Set();
    this.keys = new Set();
    this.anim = null; // { phase, t, pull, power, onStrike, done }
    this.pull = 0; // current extra pull-back (m) for display
    this._d = this._down.bind(this);
    this._m = this._move.bind(this);
    this._u = this._up.bind(this);
    this._kd = this._keyDown.bind(this);
    this._ku = this._keyUp.bind(this);
    this._w = this._wheel.bind(this);
    this.canvas.addEventListener('pointerdown', this._d);
    this.canvas.addEventListener('wheel', this._w, { passive: false });
    window.addEventListener('pointermove', this._m);
    window.addEventListener('pointerup', this._u);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
  }

  get busy() { return this.anim !== null; }

  _down(e) {
    if (e.pointerType === 'touch') {
      this.touches.add(e.pointerId);
      if (this.touches.size > 1) { this.drag = null; return; } // two fingers = camera gesture
    }
    if (e.button !== 0 || !this.canAim()) return;
    this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, touch: e.pointerType === 'touch' };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  _move(e) {
    if (this.canPlace() && !this.drag) {
      const p = pointerToTable(e, this.canvas, this.camera);
      if (p && this.onPreview) this.onPreview(p.x, p.y);
    }
    if (!this.drag || this.touches.size > 1) return;
    const dx = e.clientX - this.drag.x;
    this.drag.x = e.clientX; this.drag.y = e.clientY;
    if (!this.drag.moved && Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 4) this.drag.moved = true;
    if (!this.drag.moved) return;
    const cue = this.getCue();
    if (!cue) return;
    const mode = this.getCameraMode();
    if (mode === 'precision' || e.shiftKey || this.fine || this.drag.touch) {
      // relative rotation: dragging right turns the aim to the right as seen on screen
      const base = this.fine || e.shiftKey ? 0.0005 : this.drag.touch ? 0.0035 : 0.0018;
      const sens = this.settings.get('mouseSensitivity') * base;
      this.aim.rotate(dx * sens * this._screenSign());
    } else {
      const p = pointerToTable(e, this.canvas, this.camera);
      if (p) this.aim.aimAt(cue, p.x, p.y);
    }
  }

  /** +1 if moving the mouse to the right should increase the aim angle (counter-clockwise on the table). */
  _screenSign() {
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const rx = right.x, ry = -right.z; // physics coordinates
    const a = this.aim.direction;
    const cross = a.x * ry - a.y * rx;
    return cross >= 0 ? -1 : 1; // mouse right = clockwise when the camera's right is clockwise of the aim
  }

  _up(e) {
    if (e.pointerType === 'touch') this.touches.delete(e.pointerId);
    if (!this.drag || (e.button !== 0 && e.pointerType !== 'touch')) return;
    const wasClick = !this.drag.moved;
    this.drag = null;
    if (wasClick && this.canPlace()) {
      const p = pointerToTable(e, this.canvas, this.camera);
      if (p) this.tryPlace(p.x, p.y);
    }
  }

  /** Mouse wheel = shot power (Ctrl + wheel zooms the camera instead). */
  _wheel(e) {
    if (e.ctrlKey || !this.canAim()) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.01 : 0.04;
    this.aim.setPower(this.aim.power + (e.deltaY < 0 ? step : -step));
  }

  _keyDown(e) {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    this.keys.add(e.code);
    if (!this.canAim()) return;
    if (e.code === 'Space' && !e.repeat) { e.preventDefault(); this.onFire(); }
    else if (e.code === 'ArrowUp') this.aim.setPower(this.aim.power + 0.02);
    else if (e.code === 'ArrowDown') this.aim.setPower(this.aim.power - 0.02);
  }

  _keyUp(e) { this.keys.delete(e.code); }

  /** Continuous keyboard aiming. */
  update(dt) {
    if (this.canAim() && !this.busy) {
      const fine = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const rate = (fine ? 0.1 : 0.9) * this.settings.get('mouseSensitivity');
      if (this.keys.has('ArrowLeft')) this.aim.rotate(rate * dt);
      if (this.keys.has('ArrowRight')) this.aim.rotate(-rate * dt);
    }
    this._animate(dt);
  }

  /**
   * Play the cue stroke. onStrike() is called at the instant the tip reaches the ball.
   * Resolves visual state through this.pull / this.anim.
   */
  playStroke(power, onStrike, onDone) {
    this.anim = { phase: 'back', t: 0, power: clamp(power, 0.05, 1), onStrike, onDone, struck: false };
  }

  _animate(dt) {
    const a = this.anim;
    if (!a) return;
    const maxPull = 0.06 + a.power * 0.2;
    a.t += dt;
    if (a.phase === 'back') {
      const d = 0.45;
      const k = Math.min(1, a.t / d);
      this.pull = maxPull * (1 - Math.pow(1 - k, 2));
      if (k >= 1) { a.phase = 'hold'; a.t = 0; }
    } else if (a.phase === 'hold') {
      if (a.t >= 0.12) { a.phase = 'thrust'; a.t = 0; }
    } else if (a.phase === 'thrust') {
      const d = 0.2 - 0.12 * a.power;
      const k = Math.min(1, a.t / d);
      this.pull = maxPull * (1 - k * k) - 0.0;
      if (k >= 1 || this.pull <= 0) {
        this.pull = 0;
        if (!a.struck) { a.struck = true; a.onStrike?.(); }
        a.phase = 'follow'; a.t = 0;
      }
    } else if (a.phase === 'follow') {
      this.pull = -0.05 * Math.min(1, a.t / 0.1);
      if (a.t >= 0.25) { this.anim = null; this.pull = 0; a.onDone?.(); }
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._d);
    this.canvas.removeEventListener('wheel', this._w);
    window.removeEventListener('pointermove', this._m);
    window.removeEventListener('pointerup', this._u);
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
  }
}

export { wrapAngle };
