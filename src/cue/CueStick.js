import * as THREE from 'three';
import { BALL } from '../utils/Constants.js';

const LENGTH = 1.45;

export class CueStick {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'cue';
    this.pivot = new THREE.Group(); // tilts the butt slightly upwards
    this.group.add(this.pivot);

    const shaft = new THREE.CylinderGeometry(0.0145, 0.0058, LENGTH, 20, 1);
    shaft.rotateZ(-Math.PI / 2); // axis along +X, tip (small radius) at -X
    shaft.translate(LENGTH / 2, 0, 0); // tip at the origin, butt at +X
    this.wood = new THREE.MeshStandardMaterial({ color: 0xead2a6, roughness: 0.3 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.3, metalness: 0.4 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, roughness: 0.2, metalness: 1 });
    const body = new THREE.Mesh(shaft, this.wood);
    body.castShadow = true;
    this.pivot.add(body);

    const wrapGeo = new THREE.CylinderGeometry(0.0165, 0.0155, 0.42, 20);
    wrapGeo.rotateZ(-Math.PI / 2);
    wrapGeo.translate(LENGTH * 0.62, 0, 0);
    this.pivot.add(new THREE.Mesh(wrapGeo, this.dark));
    for (const f of [0.40, 0.84]) {
      const ringGeo = new THREE.CylinderGeometry(0.0172, 0.0172, 0.008, 20);
      ringGeo.rotateZ(-Math.PI / 2);
      ringGeo.translate(LENGTH * f, 0, 0);
      this.pivot.add(new THREE.Mesh(ringGeo, this.metal));
    }

    const tipGeo = new THREE.CylinderGeometry(0.0058, 0.0058, 0.012, 16);
    tipGeo.rotateZ(-Math.PI / 2);
    tipGeo.translate(0.004, 0, 0);
    this.tipMat = new THREE.MeshStandardMaterial({ color: 0x3a8fd6, roughness: 0.8 });
    this.pivot.add(new THREE.Mesh(tipGeo, this.tipMat));

    this.pivot.rotation.z = 0.05;
    scene.add(this.group);
    this.group.visible = false;
  }

  /**
   * @param cue {x,y} cue ball position, angle aim angle, gap distance between tip and ball surface,
   * a/b tip offset (-1..1) so the tip touches the ball where it will strike
   */
  place(cue, angle, gap, a = 0, b = 0) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const R = BALL.RADIUS;
    const off = 0.5 * R; // matches PHYSICS.MAX_OFFSET_RATIO * R
    const rightX = dy, rightY = -dx; // right of the shot direction (physics)
    const dist = R + gap;
    const sx = cue.x - dx * dist + rightX * a * off;
    const sy = cue.y - dy * dist + rightY * a * off;
    this.group.position.set(sx, R + b * off, -sy);
    // local +X (butt) must point opposite to the shot direction: three dir = (dx, 0, -dy)
    this.group.rotation.set(0, Math.atan2(-dy, -dx), 0);
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    this.wood.dispose(); this.dark.dispose(); this.metal.dispose(); this.tipMat.dispose();
  }
}
