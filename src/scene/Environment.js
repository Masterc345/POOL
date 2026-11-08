import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TABLE } from '../utils/Constants.js';

/** Room around the table: floor, walls, lamp and a generated reflection environment. */
export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.group = new THREE.Group();
    const floorY = -(TABLE.LEG_HEIGHT + 0.02);

    const floorMat = new THREE.MeshStandardMaterial({ map: this._floorTexture(), roughness: 0.42, metalness: 0.15 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.receiveShadow = true;
    this.group.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.9, side: THREE.BackSide });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 14), wallMat);
    walls.position.y = floorY + 3;
    this.group.add(walls);

    // pendant lamp (hidden whenever the camera is above it)
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.35, metalness: 0.7 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff3d8 });
    this.lamp = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.34), lampMat);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.02, 0.28), glowMat);
    glow.position.y = -0.045;
    this.lamp.add(shade, glow);
    this.lamp.position.set(0, 2.35, 0);
    this.group.add(this.lamp);
    this.materials = [floorMat, wallMat, lampMat, glowMat];

    scene.add(this.group);
    // warm LED strips along the base of the walls
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x8a6a3c });
    this.materials.push(ledMat);
    const ledY = floorY + 0.06;
    for (const [w, d, x, z] of [[13.9, 0.04, 0, -6.93], [13.9, 0.04, 0, 6.93], [0.04, 13.9, -6.93, 0], [0.04, 13.9, 6.93, 0]]) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), ledMat);
      led.position.set(x, ledY, z);
      this.group.add(led);
    }
    scene.background = new THREE.Color(0x060809);
    scene.fog = new THREE.Fog(0x060809, 6, 14);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.2;
    pmrem.dispose();
  }

  _floorTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1b1d20'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '210,215,225' : '0,0,0'},${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 6);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    this.floorTex = t;
    return t;
  }

  update(camera) { this.lamp.visible = camera.position.y < 1.9; }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    for (const m of this.materials) m.dispose();
    this.envTexture?.dispose();
    this.floorTex?.dispose();
  }
}
