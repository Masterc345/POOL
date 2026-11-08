// AI skill profiles. Difficulty changes shot selection (how good a candidate is picked),
// planning effort (physics verification) and execution accuracy (aim / power noise).
export const DIFFICULTY = {
  easy: {
    label: 'Easy', aimSigmaDeg: 2.4, powerSigma: 0.14, pool: 99, verify: false, maxTrials: 0,
    placementSamples: 0, thinkMs: 900, avoidObstructed: false, breakPower: 0.7,
  },
  medium: {
    label: 'Medium', aimSigmaDeg: 0.9, powerSigma: 0.07, pool: 3, verify: true, maxTrials: 16,
    placementSamples: 10, thinkMs: 1100, avoidObstructed: true, breakPower: 0.85,
  },
  hard: {
    label: 'Hard', aimSigmaDeg: 0.2, powerSigma: 0.025, pool: 5, verify: true, maxTrials: 48,
    placementSamples: 36, thinkMs: 1300, avoidObstructed: true, breakPower: 0.97,
  },
};

export const getProfile = (name) => DIFFICULTY[name] || DIFFICULTY.medium;
