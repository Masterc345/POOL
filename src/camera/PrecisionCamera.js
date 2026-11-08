import { BALL } from '../utils/Constants.js';

/** Close-up behind the cue ball looking along the aim line, keeping cue ball and target in view. */
export class PrecisionCamera {
  constructor() { this.back = 0.52; this.height = 0.2; }

  zoom(factor) { this.back = Math.min(1.2, Math.max(0.25, this.back * factor)); this.height = this.back * 0.4; }

  desired({ cue, aimAngle, focus }) {
    const dx = Math.cos(aimAngle), dy = Math.sin(aimAngle);
    const ahead = focus
      ? { x: (cue.x + focus.x) / 2, y: (cue.y + focus.y) / 2 }
      : { x: cue.x + dx * 0.7, y: cue.y + dy * 0.7 };
    return {
      pos: [cue.x - dx * this.back, this.height, -(cue.y - dy * this.back)],
      target: [ahead.x, BALL.RADIUS, -ahead.y],
      fov: 42,
      up: [0, 1, 0],
    };
  }
}
