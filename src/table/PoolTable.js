import * as THREE from 'three';
import { TABLE, CLOTHS } from '../utils/Constants.js';
import { createCushions } from './Cushions.js';
import { createPockets, RAIL_TOP } from './Pockets.js';

function canvasTexture(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const clothTexture = (base = CLOTHS.green.base) => canvasTexture(256, (ctx, s) => {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.045)';
  for (let i = 0; i < s; i += 2) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke(); }
}, [18, 9]);

const clothBump = () => canvasTexture(256, (ctx, s) => {
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    const v = 90 + Math.floor(Math.random() * 90);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
  }
}, [18, 9]);

const woodTexture = () => canvasTexture(512, (ctx, s) => {
  ctx.fillStyle = '#21160f'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 180; i++) {
    ctx.strokeStyle = `rgba(${70 + Math.random() * 40},${45 + Math.random() * 25},${28},${0.04 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.6;
    const y = Math.random() * s;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * 10, s * 0.7, y + (Math.random() - 0.5) * 10, s, y + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
}, [4, 1]);

export class PoolTable {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'pool-table';
    this.disposables = [];
    const L = TABLE.LENGTH, W = TABLE.WIDTH, CW = TABLE.CUSHION_WIDTH, RW = TABLE.RAIL_WIDTH;

    const cloth = new THREE.MeshPhysicalMaterial({ map: clothTexture(), bumpMap: clothBump(), bumpScale: 0.5, roughness: 0.97, metalness: 0, sheen: 0.55, sheenRoughness: 0.9, sheenColor: new THREE.Color(0x5f9f7f) });
    const clothCushion = new THREE.MeshStandardMaterial({ color: CLOTHS.green.cushion, roughness: 0.92 });
    const wood = new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: 0.38, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.22 });
    const skirt = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.55, metalness: 0.2 });
    this.chrome = new THREE.MeshStandardMaterial({ color: 0xcdd2da, metalness: 1, roughness: 0.2 });
    this.disposables.push(cloth, clothCushion, wood, skirt, this.chrome);
    this.clothMat = cloth;
    this.cushionMat = clothCushion;

    // playing surface (extends under the cushions)
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(L + CW * 2, W + CW * 2), cloth);
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    this.group.add(felt);

    // wooden rails around the cushions
    const outerL = L + (CW + RW) * 2, outerW = W + (CW + RW) * 2;
    const railH = 0.14;
    const railY = RAIL_TOP - railH / 2;
    const longRail = new THREE.BoxGeometry(outerL, railH, RW);
    const shortRail = new THREE.BoxGeometry(RW, railH, W + CW * 2);
    const add = (geo, x, z) => {
      const m = new THREE.Mesh(geo, wood);
      m.position.set(x, railY, z);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    };
    add(longRail, 0, W / 2 + CW + RW / 2);
    add(longRail, 0, -(W / 2 + CW + RW / 2));
    add(shortRail, L / 2 + CW + RW / 2, 0);
    add(shortRail, -(L / 2 + CW + RW / 2), 0);

    // body under the playing surface
    const body = new THREE.Mesh(new THREE.BoxGeometry(outerL - 0.04, 0.2, outerW - 0.04), skirt);
    body.position.set(0, -0.12, 0);
    body.castShadow = true;
    this.group.add(body);

    // slim square legs with chrome feet
    const legGeo = new THREE.BoxGeometry(0.15, TABLE.LEG_HEIGHT, 0.15);
    const footGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.03, 20);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (outerL / 2 - 0.17), z = sz * (outerW / 2 - 0.17);
      const leg = new THREE.Mesh(legGeo, skirt);
      leg.position.set(x, -0.22 - TABLE.LEG_HEIGHT / 2 + 0.2, z);
      leg.castShadow = true;
      const foot = new THREE.Mesh(footGeo, this.chrome);
      foot.position.set(x, -(TABLE.LEG_HEIGHT + 0.005), z);
      this.group.add(leg, foot);
    }

    // chrome inlay around the inner and outer edge of the rails
    const trim = (len, depth, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.004, depth), this.chrome);
      m.position.set(x, RAIL_TOP + 0.002, z);
      this.group.add(m);
    };
    const inL = L + CW * 2, inW = W + CW * 2;
    for (const sgn of [-1, 1]) {
      trim(inL, 0.008, 0, sgn * (inW / 2 + 0.004));
      trim(inW, 0.008, sgn * (inL / 2 + 0.004), 0);
      trim(outerL, 0.006, 0, sgn * (outerW / 2 - 0.003));
      trim(outerW, 0.006, sgn * (outerL / 2 - 0.003), 0);
    }

    this.group.add(createCushions(clothCushion));
    this.group.add(createPockets());
    this._addMarkings(L, W, CW, RW);
  }

  /** Change the cloth colour (green, blue, red, burgundy, grey). */
  setCloth(name) {
    const c = CLOTHS[name] || CLOTHS.green;
    this.clothMat.map?.dispose();
    this.clothMat.map = clothTexture(c.base);
    this.clothMat.needsUpdate = true;
    this.cushionMat.color.setHex(c.cushion);
  }

  _addMarkings(L, W, CW, RW) {
    const dia = new THREE.MeshPhysicalMaterial({ color: 0xece8dc, roughness: 0.2, metalness: 0.1, iridescence: 0.6 });
    this.disposables.push(dia);
    const dg = new THREE.CircleGeometry(0.011, 16);
    const place = (x, z) => {
      const m = new THREE.Mesh(dg, dia);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, RAIL_TOP + 0.0008, z);
      this.group.add(m);
    };
    const edge = W / 2 + CW + RW / 2;
    for (const i of [1, 2, 3, 5, 6, 7]) for (const s of [-1, 1]) place((i - 4) * (L / 8), s * edge);
    for (const i of [1, 2, 3]) for (const s of [-1, 1]) place(s * (L / 2 + CW + RW / 2), (i - 2) * (W / 4));

    // foot spot and head string
    const mark = new THREE.MeshBasicMaterial({ color: 0x083a21 });
    this.disposables.push(mark);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 16), mark);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(TABLE.FOOT_SPOT_X, 0.0006, 0);
    this.group.add(spot);
    const head = new THREE.Mesh(new THREE.PlaneGeometry(0.002, W), mark);
    head.rotation.x = -Math.PI / 2;
    head.position.set(TABLE.HEAD_STRING_X, 0.0006, 0);
    this.group.add(head);
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.disposables) { m.map?.dispose(); m.bumpMap?.dispose(); m.dispose(); }
  }
}
