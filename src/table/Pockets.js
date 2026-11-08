import * as THREE from 'three';
import { POCKETS } from './TableGeometry.js';

export const RAIL_TOP = 0.05;

/** Dark pocket mouths with leather rims and a short shaft so pocketed balls disappear convincingly. */
export function createPockets() {
  const group = new THREE.Group();
  group.name = 'pockets';
  const black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd2d7de, roughness: 0.18, metalness: 1 });
  for (const p of POCKETS) {
    const r = p.type === 'corner' ? 0.066 : 0.062;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), black);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(p.x, RAIL_TOP + 0.0006, -p.y);
    group.add(disc);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.35, 32, 1, true), black);
    shaft.position.set(p.x, RAIL_TOP - 0.175, -p.y);
    group.add(shaft);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0095, 16, 48), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(p.x, RAIL_TOP + 0.001, -p.y);
    rim.castShadow = true;
    group.add(rim);
  }
  return group;
}
