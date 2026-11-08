import * as THREE from 'three';
import { TABLE } from '../utils/Constants.js';
import { WALL_SEGMENTS } from './TableGeometry.js';

// cross-section (d = distance away from the table, y = height)
function cushionProfile() {
  const s = new THREE.Shape();
  s.moveTo(-0.008, 0);
  s.lineTo(0, 0.0357);
  s.lineTo(0.012, 0.048);
  s.lineTo(TABLE.CUSHION_WIDTH, 0.048);
  s.lineTo(TABLE.CUSHION_WIDTH, 0);
  s.closePath();
  return s;
}

/** One rubber cushion per physics wall segment, so what you see is exactly what the balls hit. */
export function createCushions(material) {
  const group = new THREE.Group();
  group.name = 'cushions';
  const shape = cushionProfile();
  for (const seg of WALL_SEGMENTS) {
    const len = seg.hi - seg.lo;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    // outward direction (away from the table) in three.js coordinates
    const ex = seg.axis === 'x' ? new THREE.Vector3(-seg.inward, 0, 0) : new THREE.Vector3(0, 0, seg.inward);
    const ey = new THREE.Vector3(0, 1, 0);
    const ez = new THREE.Vector3().crossVectors(ex, ey); // along-wall direction
    const p = (along) => (seg.axis === 'x'
      ? new THREE.Vector3(seg.value, 0, -along)
      : new THREE.Vector3(along, 0, -seg.value));
    const a = p(seg.lo), b = p(seg.hi);
    const start = b.clone().sub(a).dot(ez) > 0 ? a : b;
    const m = new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(start);
    geo.applyMatrix4(m);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
