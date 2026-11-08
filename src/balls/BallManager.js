// Visual balls. Reads PhysicsWorld state each frame; owns the pocket drop animation.
import * as THREE from 'three';
import { BALL } from '../utils/Constants.js';
import { POCKETS } from '../table/TableGeometry.js';
import { Ball } from './Ball.js';

export class BallManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'balls';
    scene.add(this.group);
    this.geometry = new THREE.SphereGeometry(BALL.RADIUS, 64, 48);
    this.balls = new Map();
    for (let id = 0; id < BALL.COUNT; id++) {
      const b = new Ball(id, this.geometry);
      this.balls.set(id, b);
      this.group.add(b.mesh, b.shadow);
    }
  }

  get(id) { return this.balls.get(id); }

  /** Called after every fixed physics step. */
  integrate(world, dt) {
    for (const s of world.balls) {
      if (!s.active) continue;
      this.balls.get(s.id)?.integrate(s.wx, s.wy, s.wz, dt);
    }
  }

  /** Called every rendered frame. */
  sync(world, dt) {
    for (const s of world.balls) {
      const b = this.balls.get(s.id);
      if (!b) continue;
      if (s.active) {
        if (b.fall) { b.fall = null; }
        b.mesh.visible = true;
        b.shadow.visible = true;
        b.setPosition(s.x, s.y);
        b.wasActive = true;
      } else if (b.wasActive) {
        // just pocketed: slide to the pocket centre and drop
        b.wasActive = false;
        b.shadow.visible = false;
        const p = POCKETS[s.pocket] || POCKETS[0];
        b.fall = { t: 0, from: b.mesh.position.clone(), to: new THREE.Vector3(p.x * 0.985, -0.22, -p.y * 0.985) };
      }
      if (b.fall) {
        b.fall.t += dt;
        const k = Math.min(1, b.fall.t / 0.45);
        b.mesh.position.lerpVectors(b.fall.from, b.fall.to, k * k);
        if (k >= 1) { b.mesh.visible = false; b.fall = null; }
      }
    }
  }

  /** Tint the cue ball while the player is placing it (red = illegal position). */
  setCuePlacementState(state) {
    const m = this.balls.get(0).material;
    if (state === 'invalid') { m.emissive.setHex(0x661111); m.emissiveIntensity = 0.8; }
    else if (state === 'valid') { m.emissive.setHex(0x113322); m.emissiveIntensity = 0.5; }
    else { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
  }

  dispose() {
    this.geometry.dispose();
    for (const b of this.balls.values()) { b.material.dispose(); b.shadow.geometry.dispose(); b.shadow.material.dispose(); }
    this.scene.remove(this.group);
  }
}
