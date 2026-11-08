// A referee who stands beside the table, watches the cue ball, and signals fouls, good shots and the winner.
import * as THREE from 'three';
import { TABLE } from '../utils/Constants.js';

const mat = (color, rough = 0.7) => new THREE.MeshStandardMaterial({ color, roughness: rough });

export class Referee {
  constructor(scene, position = { x: -0.7, z: -1.28 }) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'referee';
    this.group.position.set(position.x, -(TABLE.LEG_HEIGHT + 0.02), position.z);
    this.mats = [];
    const m = (c, r) => { const x = mat(c, r); this.mats.push(x); return x; };
    const add = (geo, material, x, y, z, parent = this.group) => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const black = m(0x101012), white = m(0xf2f2ee), skin = m(0xe0ac82, 0.6), hair = m(0x2a1a10), red = m(0xb3202a);
    add(new THREE.CylinderGeometry(0.06, 0.055, 0.86, 12), black, -0.09, 0.43, 0);
    add(new THREE.CylinderGeometry(0.06, 0.055, 0.86, 12), black, 0.09, 0.43, 0);
    add(new THREE.BoxGeometry(0.15, 0.06, 0.26), black, -0.09, 0.03, 0.04);
    add(new THREE.BoxGeometry(0.15, 0.06, 0.26), black, 0.09, 0.03, 0.04);
    add(new THREE.BoxGeometry(0.4, 0.56, 0.22), white, 0, 1.14, 0);
    add(new THREE.BoxGeometry(0.405, 0.36, 0.232), black, 0, 1.06, 0); // vest
    add(new THREE.BoxGeometry(0.07, 0.04, 0.02), red, -0.04, 1.43, 0.12); // bow tie
    add(new THREE.BoxGeometry(0.07, 0.04, 0.02), red, 0.04, 1.43, 0.12);

    this.head = new THREE.Group();
    this.head.position.set(0, 1.5, 0);
    add(new THREE.SphereGeometry(0.115, 20, 16), skin, 0, 0.1, 0, this.head);
    add(new THREE.SphereGeometry(0.122, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), hair, 0, 0.115, -0.006, this.head);
    this.group.add(this.head);

    const armGeo = new THREE.CylinderGeometry(0.04, 0.036, 0.56, 10);
    armGeo.translate(0, -0.28, 0);
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.23, 1.38, 0);
      add(armGeo, white, 0, 0, 0, pivot);
      add(new THREE.SphereGeometry(0.045, 10, 8), skin, 0, -0.58, 0, pivot);
      this.group.add(pivot);
      return { pivot, side, z: side * 0.1, x: 0 };
    });

    this.light = new THREE.PointLight(0xffe2b8, 4, 4, 2);
    this.light.position.set(0, 1.5, 0.8);
    this.group.add(this.light);

    this.yaw = 0;
    this.headYaw = 0;
    this.targets = [{ z: -0.1, x: 0 }, { z: 0.1, x: 0 }]; // [left, right]
    this.signalUntil = 0;
    this.time = 0;
    scene.add(this.group);
    this.faceTable();
  }

  faceTable() {
    this.group.rotation.y = Math.atan2(-this.group.position.x, -this.group.position.z);
  }

  /** kind: 'foul' | 'good' | 'win' */
  signal(kind) {
    const [L, R] = this.targets;
    if (kind === 'foul') { R.z = Math.PI * 0.97; R.x = 0; this.signalUntil = this.time + 3.2; }
    else if (kind === 'good') { R.x = -Math.PI / 2; R.z = 0.15; this.signalUntil = this.time + 1.8; }
    else if (kind === 'win') { R.z = Math.PI * 0.95; L.z = -Math.PI * 0.95; R.x = L.x = 0; this.signalUntil = this.time + 5; }
  }

  setVisible(v) { this.group.visible = v; }

  /** target: cue ball {x, y} in physics coordinates (or null) */
  update(dt, target) {
    this.time += dt;
    if (this.time > this.signalUntil) {
      this.targets[0] = { z: -0.1 - Math.sin(this.time * 0.8) * 0.02, x: 0 };
      this.targets[1] = { z: 0.1 + Math.sin(this.time * 0.8 + 1) * 0.02, x: 0 };
    }
    const k = 1 - Math.exp(-dt * 6);
    this.arms.forEach((a, i) => {
      a.z += (this.targets[i].z - a.z) * k;
      a.x += (this.targets[i].x - a.x) * k;
      a.pivot.rotation.set(a.x, 0, a.z);
    });
    if (target) {
      const dx = target.x - this.group.position.x;
      const dz = -target.y - this.group.position.z;
      const want = Math.atan2(dx, dz) - this.group.rotation.y;
      const wrapped = Math.atan2(Math.sin(want), Math.cos(want));
      const clamped = Math.max(-1.1, Math.min(1.1, wrapped));
      this.headYaw += (clamped - this.headYaw) * (1 - Math.exp(-dt * 7));
      this.head.rotation.y = this.headYaw;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    for (const x of this.mats) x.dispose();
  }
}
