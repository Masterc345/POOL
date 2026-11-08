// Holds the current shot setup (aim direction, spin, power) and converts it to a physics shot.
import { clamp, wrapAngle } from '../utils/Helpers.js';
import { powerToCueSpeed } from '../cue/ShotPower.js';

export class AimingSystem {
  constructor() {
    this.angle = 0; // radians, physics coordinates (x along the table, y across)
    this.a = 0; // side offset -1..1 (right +)
    this.b = 0; // vertical offset -1..1 (top +)
    this.power = 0.5;
    this.targetId = null;
    this.pocketId = null;
    this.version = 0;
  }

  _touch() { this.version++; }

  setAngle(angle) { this.angle = wrapAngle(angle); this._touch(); }
  rotate(delta) { this.setAngle(this.angle + delta); }
  setPower(p) { this.power = clamp(p, 0, 1); this._touch(); }

  setSpin(a, b) {
    const m = Math.hypot(a, b);
    if (m > 1) { a /= m; b /= m; }
    this.a = a; this.b = b;
    this._touch();
  }

  aimAt(from, x, y) { this.setAngle(Math.atan2(y - from.y, x - from.x)); }

  /** Aim at a ranked candidate; uses the physics-verified plan (angle, power, spin) when available. */
  snapToShot(c) {
    const plan = c.plan;
    this.angle = wrapAngle(plan ? plan.angle : c.aimAngle);
    if (plan) { this.power = plan.power; this.a = plan.a; this.b = plan.b; }
    this.targetId = c.targetId;
    this.pocketId = c.pocketId;
    this._touch();
  }

  get direction() { return { x: Math.cos(this.angle), y: Math.sin(this.angle) }; }

  getShot() {
    return { dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), speed: powerToCueSpeed(this.power), a: this.a, b: this.b };
  }
}
