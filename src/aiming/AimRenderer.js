// Draws aiming assistance in the 3D scene: cue line, ghost ball, predicted paths, pocket and
// recommendation highlights. Pure presentation: all numbers come from AssistanceManager.
import * as THREE from 'three';
import { BALL } from '../utils/Constants.js';
import { POCKETS } from '../table/TableGeometry.js';

const Y = 0.004;

/** Flat ribbon following a polyline on the cloth. */
class Ribbon {
  constructor(scene, color, opacity, width, maxPoints = 400) {
    this.width = width;
    this.max = maxPoints;
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxPoints * 2 * 3);
    const idx = [];
    for (let i = 0; i < maxPoints - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setPoints(pts, y = Y) {
    if (!pts || pts.length < 2) { this.mesh.visible = false; return; }
    // thin the polyline to the buffer size
    let p = pts;
    if (p.length > this.max) { const step = Math.ceil(p.length / this.max); p = p.filter((_, i) => i % step === 0 || i === p.length - 1).slice(0, this.max); }
    const n = p.length;
    const hw = this.width / 2;
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const nx = -dy * hw, ny = dx * hw; // normal in physics plane
      const o = i * 6;
      this.positions[o] = p[i].x + nx; this.positions[o + 1] = y; this.positions[o + 2] = -(p[i].y + ny);
      this.positions[o + 3] = p[i].x - nx; this.positions[o + 4] = y; this.positions[o + 5] = -(p[i].y - ny);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.mesh.visible = true;
  }

  hide() { this.mesh.visible = false; }

  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

const STATE_COLORS = { good: 0x4cd964, fair: 0xffd60a, poor: 0xff5a4f, blocked: 0xb0b0b0, wrong: 0xff5a4f, none: 0xffffff };

export class AimRenderer {
  constructor(scene) {
    this.scene = scene;
    this.cueLine = new Ribbon(scene, 0xffffff, 0.85, 0.0032);
    this.objectLine = new Ribbon(scene, 0xffe066, 0.9, 0.0034);
    this.cuePath = new Ribbon(scene, 0xffffff, 0.45, 0.0026);
    this.recLine = new Ribbon(scene, 0x4fd8ff, 0.85, 0.003, 4);
    this.others = Array.from({ length: 6 }, () => new Ribbon(scene, 0xcfd8dc, 0.35, 0.002));

    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
    this.ghost = new THREE.Mesh(new THREE.SphereGeometry(BALL.RADIUS, 24, 16), this.ghostMat);
    this.ghostRing = new THREE.Mesh(
      new THREE.RingGeometry(BALL.RADIUS * 0.96, BALL.RADIUS * 1.08, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    this.ghostRing.rotation.x = -Math.PI / 2;
    this.contactDot = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 16), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    this.contactDot.rotation.x = -Math.PI / 2;
    this.pocketRing = new THREE.Mesh(
      new THREE.RingGeometry(0.062, 0.078, 48),
      new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    this.pocketRing.rotation.x = -Math.PI / 2;
    this.recRing = new THREE.Mesh(
      new THREE.RingGeometry(BALL.RADIUS * 1.25, BALL.RADIUS * 1.55, 40),
      new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
    );
    this.recRing.rotation.x = -Math.PI / 2;
    this.recGhost = new THREE.Mesh(
      new THREE.RingGeometry(BALL.RADIUS * 0.9, BALL.RADIUS * 1.0, 32),
      new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    this.recGhost.rotation.x = -Math.PI / 2;
    this.parts = [this.ghost, this.ghostRing, this.contactDot, this.pocketRing, this.recRing, this.recGhost];
    for (const p of this.parts) { p.visible = false; p.renderOrder = 6; scene.add(p); }
    this.time = 0;
  }

  hideAll() {
    for (const r of [this.cueLine, this.objectLine, this.cuePath, this.recLine, ...this.others]) r.hide();
    for (const p of this.parts) p.visible = false;
  }

  /** result: AssistanceManager.compute(); visible: whether trajectory lines are shown */
  update(result, visible, dt = 0) {
    this.time += dt;
    this.hideAll();
    if (!result || !result.active || !visible) return;
    const R = BALL.RADIUS;
    const al = result.alignment;
    const color = al ? STATE_COLORS[al.state] ?? 0xffffff : 0xffffff;

    this.cueLine.mat.color.setHex(color);
    this.cueLine.setPoints(result.cueLine);

    if (result.ghost) {
      this.ghost.visible = this.ghostRing.visible = true;
      this.ghost.position.set(result.ghost.x, R, -result.ghost.y);
      this.ghostRing.position.set(result.ghost.x, Y + 0.0005, -result.ghost.y);
      this.ghostRing.material.color.setHex(color);
      const c = result.firstContact;
      if (c && c.type === 'ball') {
        this.contactDot.visible = true;
        this.contactDot.position.set(result.ghost.x + c.normal.x * R, Y + 0.001, -(result.ghost.y + c.normal.y * R));
      }
    }

    if (result.objectPath) this.objectLine.setPoints(result.objectPath);
    if (result.cuePath) this.cuePath.setPoints(result.cuePath);
    result.otherPaths.slice(0, this.others.length).forEach((o, i) => this.others[i].setPoints(o.path));

    const pocketId = result.pocketId;
    if (pocketId !== null && pocketId !== undefined && POCKETS[pocketId]) {
      const p = POCKETS[pocketId];
      this.pocketRing.visible = true;
      this.pocketRing.position.set(p.x, 0.052, -p.y);
      const likely = result.predictedPocketed.length > 0 && result.simPocketOfTarget === pocketId;
      this.pocketRing.material.color.setHex(likely ? 0x4cd964 : 0xffd60a);
    }
  }

  /** Needs live ball positions for the recommendation highlight. */
  updateRecommendation(result, world, visible) {
    if (!result || !visible || !result.recommended || result.level < 4) return;
    const rec = result.recommended;
    const t = world.getBall(rec.targetId);
    if (!t || !t.active) return;
    const p = POCKETS[rec.pocketId];
    this.recRing.visible = this.recGhost.visible = true;
    this.recRing.position.set(t.x, Y + 0.001, -t.y);
    this.recGhost.position.set(rec.ghost.x, Y + 0.001, -rec.ghost.y);
    this.recLine.setPoints([{ x: t.x, y: t.y }, { x: p.x, y: p.y }]);
  }

  dispose() {
    for (const r of [this.cueLine, this.objectLine, this.cuePath, this.recLine, ...this.others]) r.dispose(this.scene);
    for (const p of this.parts) { this.scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
  }
}
