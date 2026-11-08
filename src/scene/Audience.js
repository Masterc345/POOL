// Procedural crowd: instanced low-poly spectators on stepped risers behind and beside the table.
// They sway gently, jump when somebody pots a ball, slump on fouls and celebrate when a match ends.
import * as THREE from 'three';
import { TABLE } from '../utils/Constants.js';
import { createRng } from '../utils/Helpers.js';

const CLOTHES = [0x2b3a55, 0x6b2d3a, 0x2f5d46, 0x4a4a4a, 0x8a6d3b, 0x3b2f5d, 0x1f1f24, 0x5d3b2f, 0x7a7a85, 0x2d5b7a, 0x8c3b2a, 0x3d6b6b];
const SKIN = [0xf1c9a5, 0xe0ac82, 0xc68a62, 0x9b6a47, 0x6f4a32, 0xffdcb8];

export class Audience {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'audience';
    const rng = createRng(2024);
    const floorY = -(TABLE.LEG_HEIGHT + 0.02);
    const seats = [];
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x1a1613, roughness: 0.9 });
    this.platformMat = platformMat;
    const platforms = [];

    // three rows behind the far rail
    for (let row = 0; row < 3; row++) {
      const top = floorY + 0.32 * (row + 1);
      const z = -3.5 - row * 0.8;
      platforms.push({ w: 10.4, d: 0.8, x: 0, z, top });
      for (let i = 0; i < 18; i++) seats.push({ x: -4.7 + i * 0.55 + (rng() - 0.5) * 0.12, y: top, z: z + (rng() - 0.5) * 0.15 });
    }
    // two rows on each short side
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        const top = floorY + 0.32 * (row + 1);
        const x = side * (3.6 + row * 0.8);
        platforms.push({ w: 0.8, d: 5.4, x, z: -0.2, top });
        for (let i = 0; i < 10; i++) seats.push({ x: x + (rng() - 0.5) * 0.15, y: top, z: -2.8 + i * 0.55 + (rng() - 0.5) * 0.12 });
      }
    }
    for (const p of platforms) {
      const h = p.top - floorY;
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, h, p.d), platformMat);
      m.position.set(p.x, floorY + h / 2, p.z);
      m.receiveShadow = true;
      this.group.add(m);
    }

    this.count = seats.length;
    this.seats = seats.map((s) => ({
      ...s,
      phase: rng() * Math.PI * 2,
      speed: 0.8 + rng() * 0.8,
      jump: 0.6 + rng() * 0.8,
      yaw: Math.atan2(-s.x, -s.z),
    }));

    const bodyGeo = new THREE.CapsuleGeometry(0.19, 0.42, 4, 10);
    const headGeo = new THREE.SphereGeometry(0.125, 16, 12);
    this.bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.headMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    this.bodies = new THREE.InstancedMesh(bodyGeo, this.bodyMat, this.count);
    this.heads = new THREE.InstancedMesh(headGeo, this.headMat, this.count);
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      this.bodies.setColorAt(i, c.setHex(CLOTHES[Math.floor(rng() * CLOTHES.length)]));
      this.heads.setColorAt(i, c.setHex(SKIN[Math.floor(rng() * SKIN.length)]));
    }
    this.bodies.instanceColor.needsUpdate = true;
    this.heads.instanceColor.needsUpdate = true;
    this.bodies.frustumCulled = this.heads.frustumCulled = false;
    this.group.add(this.bodies, this.heads);

    // soft warm lights so the crowd is visible but clearly darker than the table
    this.lights = [
      new THREE.PointLight(0xffd9a8, 9, 10, 2),
      new THREE.PointLight(0xffd9a8, 5, 8, 2),
      new THREE.PointLight(0xffd9a8, 5, 8, 2),
    ];
    this.lights[0].position.set(0, 1.6, -3.2);
    this.lights[1].position.set(-3.2, 1.4, -0.2);
    this.lights[2].position.set(3.2, 1.4, -0.2);
    this.lights.forEach((l) => this.group.add(l));

    this.excite = 0;
    this.groan = 0;
    this.holdUntil = 0;
    this.time = 0;
    this._dummy = new THREE.Object3D();
    this._dummy.rotation.order = 'YXZ';
    scene.add(this.group);
    this.update(0);
  }

  /** kind: 'cheer' | 'groan' | 'celebrate' */
  react(kind, strength = 0.7) {
    if (kind === 'cheer') this.excite = Math.max(this.excite, strength);
    else if (kind === 'groan') this.groan = Math.max(this.groan, strength);
    else if (kind === 'celebrate') { this.excite = 1; this.holdUntil = this.time + 6; }
  }

  setVisible(v) { this.group.visible = v; }

  update(dt) {
    this.time += dt;
    if (this.time > this.holdUntil) this.excite = Math.max(0, this.excite - dt * 0.45);
    this.groan = Math.max(0, this.groan - dt * 0.7);
    const d = this._dummy;
    const t = this.time;
    for (let i = 0; i < this.count; i++) {
      const s = this.seats[i];
      const idle = Math.sin(t * s.speed + s.phase) * 0.006;
      const hop = this.excite > 0.02 ? Math.abs(Math.sin(t * 8 * s.speed + s.phase)) * 0.16 * this.excite * s.jump : 0;
      const lift = idle + hop;
      const lean = this.groan * 0.28 + Math.sin(t * 0.7 + s.phase) * 0.015;
      d.position.set(s.x, s.y + 0.5 + lift, s.z);
      d.rotation.set(lean, s.yaw, Math.sin(t * 6 * s.speed + s.phase) * 0.06 * this.excite);
      d.scale.set(1, 1 - this.groan * 0.05, 1);
      d.updateMatrix();
      this.bodies.setMatrixAt(i, d.matrix);
      d.position.set(s.x + Math.sin(s.yaw) * lean * 0.5, s.y + 1.0 + lift - this.groan * 0.06, s.z + Math.cos(s.yaw) * lean * 0.5);
      d.rotation.set(0, s.yaw, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      this.heads.setMatrixAt(i, d.matrix);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    this.bodies.dispose(); this.heads.dispose();
    this.bodyMat.dispose(); this.headMat.dispose(); this.platformMat.dispose();
  }
}
