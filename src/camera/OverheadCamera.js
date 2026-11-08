import { TABLE } from '../utils/Constants.js';

/** Straight top-down view with the whole table visible; long side horizontal. */
export class OverheadCamera {
  constructor() { this.fov = 38; }

  desired({ aspect }) {
    const halfW = (TABLE.LENGTH / 2 + 0.3);
    const halfH = (TABLE.WIDTH / 2 + 0.3);
    const t = Math.tan((this.fov * Math.PI) / 360);
    const h = Math.max(halfH / t, halfW / (t * Math.max(aspect, 0.3))) * 1.02;
    return { pos: [0, h, 0.0001], target: [0, 0, 0], fov: this.fov, up: [0, 0, -1] };
  }
}
