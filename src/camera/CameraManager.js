// Three camera modes (free / overhead / precision) with smooth transitions between them.
import * as THREE from 'three';
import { FreeCamera } from './FreeCamera.js';
import { OverheadCamera } from './OverheadCamera.js';
import { PrecisionCamera } from './PrecisionCamera.js';

export const CAMERA_MODES = ['free', 'overhead', 'precision'];

export class CameraManager {
  constructor(camera, canvas, settings) {
    this.camera = camera;
    this.canvas = canvas;
    this.settings = settings;
    this.free = new FreeCamera();
    this.overhead = new OverheadCamera();
    this.precision = new PrecisionCamera();
    this.mode = 'free';
    this.watching = false; // true while balls roll and cameraFollowShot is on
    this.drag = null;
    this.pointers = new Map(); // active touch points for pinch / two-finger orbit
    this.lastPinch = null;
    this.shouldZoom = null; // (wheelEvent) => boolean, set by the match

    this._pos = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._fov = camera.fov;
    this._init = false;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setMode(mode) { if (CAMERA_MODES.includes(mode)) this.mode = mode; }
  cycle() { this.setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length]); }

  _onDown(e) {
    if (e.pointerType === 'touch') {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.lastPinch = this.pointers.size === 2 ? this._pinchState() : null;
      return;
    }
    if (e.button === 2 || e.button === 1) {
      this.drag = { x: e.clientX, y: e.clientY };
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
    }
  }

  _pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  _onMove(e) {
    if (e.pointerType === 'touch' && this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2 && this.lastPinch) {
        const cur = this._pinchState();
        const k = 0.005 * this.settings.get('cameraSensitivity');
        const f = this.lastPinch.dist / cur.dist;
        if (this.mode === 'precision') this.precision.zoom(f); else this.free.zoom(f);
        if (Math.abs(cur.mx - this.lastPinch.mx) + Math.abs(cur.my - this.lastPinch.my) > 0) {
          if (this.mode !== 'free') this.setMode('free');
          this.free.rotate(-(cur.mx - this.lastPinch.mx) * k, -(cur.my - this.lastPinch.my) * k);
        }
        this.lastPinch = cur;
      }
      return;
    }
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX; this.drag.y = e.clientY;
    const k = 0.005 * this.settings.get('cameraSensitivity');
    if (this.mode !== 'free') this.setMode('free'); // dragging always gives you the free camera
    this.free.rotate(-dx * k, -dy * k);
  }

  _onUp(e) {
    if (e.pointerType === 'touch') { this.pointers.delete(e.pointerId); this.lastPinch = null; return; }
    if (this.drag && (e.button === 2 || e.button === 1)) this.drag = null;
  }

  _onWheel(e) {
    if (this.shouldZoom && !this.shouldZoom(e)) return; // the mouse wheel is shot power while aiming
    e.preventDefault();
    const f = Math.exp(e.deltaY * 0.001 * this.settings.get('cameraSensitivity'));
    if (this.mode === 'precision') this.precision.zoom(f);
    else this.free.zoom(f);
  }

  /** ctx: { aspect, cue:{x,y}, aimAngle, focus?:{x,y}, shooting:boolean } */
  update(dt, ctx) {
    let mode = this.mode;
    if (mode === 'precision' && ctx.shooting && this.settings.get('cameraFollowShot')) mode = 'free';
    this.watching = mode !== this.mode;
    const d = (mode === 'overhead' ? this.overhead : mode === 'precision' ? this.precision : this.free).desired(ctx);

    const k = this._init ? 1 - Math.exp(-dt * 5.5) : 1;
    this._init = true;
    this._pos.lerp(new THREE.Vector3(...d.pos), k);
    this._target.lerp(new THREE.Vector3(...d.target), k);
    this._up.lerp(new THREE.Vector3(...d.up), k).normalize();
    this._fov += (d.fov - this._fov) * k;

    this.camera.position.copy(this._pos);
    this.camera.up.copy(this._up);
    this.camera.lookAt(this._target);
    if (Math.abs(this.camera.fov - this._fov) > 1e-3) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
  }
}
