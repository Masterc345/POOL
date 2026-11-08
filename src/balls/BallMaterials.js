// Procedural ball textures (no external image files needed) and materials.
import * as THREE from 'three';
import { BALL_COLORS } from '../utils/Constants.js';

const cache = new Map();
let texScale = 1;

/** Low quality (phones) uses half-size ball textures to save GPU memory. */
export function setBallTextureQuality(q) { texScale = q === 'low' ? 0.5 : 1; }

function drawNumberDisc(ctx, cx, cy, r, text) {
  ctx.fillStyle = '#f7f4ea';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = `bold ${Math.round(r * 1.25)}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + r * 0.06);
}

/** Equirectangular texture (2:1): numbers sit on the equator at u = 0.25 and 0.75. */
export function createBallTexture(id) {
  if (cache.has(id)) return cache.get(id);
  const W = Math.round(1024 * texScale), H = Math.round(512 * texScale), k = texScale;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const color = BALL_COLORS[id];

  if (id === 0) {
    ctx.fillStyle = '#f6f3e8'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c63a3a';
    for (const [x, y] of [[W * 0.25, H * 0.5], [W * 0.75, H * 0.5]]) { ctx.beginPath(); ctx.arc(x, y, 12 * k, 0, Math.PI * 2); ctx.fill(); }
  } else if (id <= 8) {
    ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
    drawNumberDisc(ctx, W * 0.25, H * 0.5, 62 * k, String(id));
    drawNumberDisc(ctx, W * 0.75, H * 0.5, 62 * k, String(id));
  } else {
    ctx.fillStyle = '#f6f3e8'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color; ctx.fillRect(0, H * 0.26, W, H * 0.48);
    drawNumberDisc(ctx, W * 0.25, H * 0.5, 62 * k, String(id));
    drawNumberDisc(ctx, W * 0.75, H * 0.5, 62 * k, String(id));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(id, tex);
  return tex;
}

export function createBallMaterial(id) {
  return new THREE.MeshPhysicalMaterial({
    map: createBallTexture(id),
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.0,
  });
}

let shadowTex = null;
/** Soft radial blob used as a cheap contact shadow under each ball (works even with real shadows off). */
export function getContactShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export function disposeBallTextures() {
  shadowTex?.dispose(); shadowTex = null;
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
