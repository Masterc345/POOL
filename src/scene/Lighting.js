import * as THREE from 'three';

export class Lighting {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.hemi = new THREE.HemisphereLight(0xaec4dc, 0x0a0806, 0.16);
    this.group.add(this.hemi);

    this.spots = [];
    for (const x of [-0.65, 0.65]) {
      const s = new THREE.SpotLight(0xffe2b8, 26, 6, 0.78, 0.92, 2);
      s.position.set(x, 2.1, 0);
      s.target.position.set(x, 0, 0);
      s.castShadow = true;
      s.shadow.bias = -0.0004;
      s.shadow.normalBias = 0.01;
      s.shadow.radius = 6;
      s.shadow.blurSamples = 16;
      this.group.add(s, s.target);
      this.spots.push(s);
    }
    scene.add(this.group);
  }

  applyQuality(q) {
    const size = { low: 0, medium: 1024, high: 2048, ultra: 4096 }[q] ?? 2048;
    for (const s of this.spots) {
      s.castShadow = size > 0;
      if (size > 0 && s.shadow.mapSize.x !== size) {
        s.shadow.mapSize.set(size, size);
        s.shadow.map?.dispose();
        s.shadow.map = null;
      }
    }
  }

  dispose() { this.scene.remove(this.group); for (const s of this.spots) s.shadow.map?.dispose(); }
}
