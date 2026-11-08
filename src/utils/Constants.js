// Single source of truth for dimensions and physical parameters.
// Both the live game and the aiming predictor import PHYSICS from here, so predictions
// are computed with exactly the same parameters as real gameplay.
export const APP = { NAME: 'PoolMaster3D', VERSION: '1.0.0' };

const R = 0.028575; // 57.15 mm ball (2 1/4")
const M = 0.17; // kg

export const BALL = {
  RADIUS: R,
  DIAMETER: R * 2,
  MASS: M,
  INERTIA: 0.4 * M * R * R, // solid sphere
  COUNT: 16,
};

// Playing surface between cushion noses of a 9 ft table (2.54 m x 1.27 m).
// Physics coordinates: x along the long axis, y along the short axis, origin at table centre.
export const TABLE = {
  LENGTH: 2.54,
  WIDTH: 1.27,
  HALF_L: 1.27,
  HALF_W: 0.635,
  CORNER_GAP: 0.082, // cushion starts this far from a corner (corner pocket mouth ~116 mm)
  SIDE_GAP: 0.065, // half width of the side-pocket mouth (130 mm)
  HEAD_STRING_X: -0.635,
  FOOT_SPOT_X: 0.635,
  // visual only
  RAIL_WIDTH: 0.11,
  CUSHION_WIDTH: 0.05,
  SURFACE_Y: 0.0, // three.js height of the cloth
  LEG_HEIGHT: 0.75,
};

export const PHYSICS = {
  TIMESTEP: 1 / 120,
  GRAVITY: 9.81,
  MU_SLIDE: 0.2, // cloth sliding friction
  ROLL_RESISTANCE: 0.010, // rolling resistance coefficient
  get ROLL_DECEL() { return this.ROLL_RESISTANCE * this.GRAVITY; },
  SPIN_Z_DECEL: 9.0, // rad/s^2, decay of side spin (english) about the vertical axis
  RESTITUTION_BALL: 0.95,
  MU_BALL: 0.05, // ball-ball friction (throw / spin transfer)
  MU_CUSHION: 0.2, // cushion friction
  SLIP_EPS: 1e-3, // m/s, below this contact-point slip counts as rolling
  REST_SPEED: 0.004, // m/s
  REST_SPIN: 0.1, // rad/s
  CUSHION_MIN_BOUNCE: 0.03, // m/s impact speed below which the ball does not bounce
  CUE_MASS: 0.54,
  MAX_CUE_SPEED: 6.6, // m/s -> about 10 m/s ball speed for a centre-ball strike
  MAX_OFFSET_RATIO: 0.5, // maximum tip offset from centre as a fraction of ball radius
  MAX_EVENTS_PER_STEP: 64,
  OUT_MARGIN: 0.04, // centre this far beyond a cushion line counts as pocketed
};

export const GROUPS = { SOLIDS: 'solids', STRIPES: 'stripes' };

export const BALL_COLORS = {
  1: '#f5c400', 2: '#0d3f9a', 3: '#cc1230', 4: '#4a1d7a', 5: '#f2681c', 6: '#056b3f', 7: '#6a1d2b', 8: '#0a0a0c',
  9: '#f5c400', 10: '#0d3f9a', 11: '#cc1230', 12: '#4a1d7a', 13: '#f2681c', 14: '#056b3f', 15: '#6a1d2b',
};

export const ASSIST_LEVELS = ['Off', 'Basic', 'Intermediate', 'Advanced', 'Professional'];
export const AI_DIFFICULTIES = ['easy', 'medium', 'hard'];
/** Deep, matte tournament cloth colours (kept dark on purpose: the table must never look bright). */
export const CLOTHS = {
  green: { base: '#0a4a2b', cushion: 0x083d24 },
  blue: { base: '#12396b', cushion: 0x0e2f58 },
  red: { base: '#6e1a22', cushion: 0x58151b },
  burgundy: { base: '#451126', cushion: 0x370d1e },
  grey: { base: '#353c45', cushion: 0x2b3138 },
  black: { base: '#16191d', cushion: 0x111316 },
};
export const CLOTH_COLORS = Object.keys(CLOTHS);
export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'];
