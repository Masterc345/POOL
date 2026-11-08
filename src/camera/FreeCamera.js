import { clamp } from '../utils/Helpers.js';

/** Orbit camera around the table centre: right-drag rotates, wheel zooms. */
export class FreeCamera {
  constructor() {
    this.azimuth = 0; // 0 = player at the bottom long rail
    this.polar = 0.95; // radians from vertical
    this.distance = 2.7;
  }

  rotate(dAz, dPolar) {
    this.azimuth += dAz;
    this.polar = clamp(this.polar + dPolar, 0.12, 1.5);
  }

  zoom(factor) { this.distance = clamp(this.distance * factor, 0.9, 5.5); }

  desired() {
    const r = this.distance;
    const sp = Math.sin(this.polar);
    return {
      pos: [Math.sin(this.azimuth) * sp * r, Math.cos(this.polar) * r, Math.cos(this.azimuth) * sp * r],
      target: [0, 0, 0],
      fov: 45,
      up: [0, 1, 0],
    };
  }
}
