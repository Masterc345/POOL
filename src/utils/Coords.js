// Physics (x along table, y across, z up) -> three.js (x, y up, z towards viewer): X = x, Y = height, Z = -y
export const toThree = (x, y, h = 0) => [x, h, -y];
export const fromThreeXZ = (x, z) => ({ x, y: -z });
