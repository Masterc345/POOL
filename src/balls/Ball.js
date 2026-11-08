import * as THREE from 'three';
import { BALL } from '../utils/Constants.js';
import { createBallMaterial, getContactShadowTexture } from './BallMaterials.js';

const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();

export class Ball {
  constructor(id, geometry) {
    this.id = id;
    this.material = createBallMaterial(id);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.name = `ball-${id}`;
    // random initial orientation so numbers are not all facing the same way
    this.mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(BALL.DIAMETER * 2.1, BALL.DIAMETER * 2.1),
      new THREE.MeshBasicMaterial({ map: getContactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.8 })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    this.fall = null; // pocket drop animation
    this.wasActive = true;
  }

  setPosition(x, y, h = BALL.RADIUS) {
    this.mesh.position.set(x, h, -y);
    this.shadow.position.set(x + 0.004, 0.0009, -y - 0.004);
  }

  /** Rotate by the physics angular velocity (physics axes -> three axes: (wx, wz, -wy)). */
  integrate(wx, wy, wz, dt) {
    const ox = wx, oy = wz, oz = -wy;
    const mag = Math.hypot(ox, oy, oz);
    if (mag < 1e-6) return;
    _axis.set(ox / mag, oy / mag, oz / mag);
    _q.setFromAxisAngle(_axis, mag * dt);
    this.mesh.quaternion.premultiply(_q);
  }
}
