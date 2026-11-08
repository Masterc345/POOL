import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { detectMobile, createMemoryBackend } from '../src/utils/Helpers.js';
import { SettingsStore } from '../src/core/Settings.js';

globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} };
const { CueController } = await import('../src/cue/CueController.js');
const { AimingSystem } = await import('../src/aiming/AimingSystem.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('mobile detection', () => {
  it('recognises phones, tablets and touch screens but not desktops', () => {
    expect(detectMobile({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true);
    expect(detectMobile({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe(true);
    expect(detectMobile({ coarse: true, width: 844, height: 390, ua: '' })).toBe(true);
    expect(detectMobile({ coarse: false, width: 1920, height: 1080, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe(false);
    expect(detectMobile({ coarse: true, width: 2560, height: 1440, ua: '' })).toBe(false); // touch monitor
  });

  it('settings know when it is a first run', async () => {
    const backend = createMemoryBackend();
    const a = new SettingsStore(backend);
    await a.load();
    expect(a.fresh).toBe(true);
    a.set('audioVolume', 0.2);
    await a.flush();
    const b = new SettingsStore(backend);
    await b.load();
    expect(b.fresh).toBe(false);
  });
});

describe('installable web app (PWA)', () => {
  it('has a valid manifest with icons that exist', () => {
    const m = JSON.parse(read('public/manifest.webmanifest'));
    expect(m.name).toBe('PoolMaster3D');
    expect(m.display_override).toContain('fullscreen');
    expect(m.orientation).toBe('landscape');
    expect(m.icons.length).toBeGreaterThanOrEqual(3);
    for (const i of m.icons) expect(existsSync(new URL(`../public/${i.src}`, import.meta.url))).toBe(true);
  });

  it('index.html is mobile ready', () => {
    const html = read('index.html');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('user-scalable=no');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('apple-mobile-web-app-capable');
  });

  it('service worker serves pages network-first and caches assets', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("addEventListener('fetch'");
    expect(sw).toContain("req.mode === 'navigate'");
    expect(sw).toContain('caches.open');
  });

  it('GitHub Pages workflow builds and deploys the web version', () => {
    const wf = read('.github/workflows/deploy-pages.yml');
    expect(wf).toContain('npm run build');
    expect(wf).toContain('upload-pages-artifact');
    expect(wf).toContain('deploy-pages');
  });

  it('registers the service worker only for http(s) pages, not the desktop app', () => {
    const main = read('src/main.js');
    expect(main).toContain("location.protocol.startsWith('http')");
    expect(main).toContain('!window.poolAPI');
  });
});

describe('touch controls', () => {
  function makeController() {
    const aim = new AimingSystem();
    const settings = { get: () => 1 };
    const canvas = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), setPointerCapture() {} };
    const c = new CueController({
      canvas, camera: { matrixWorld: { elements: new Array(16).fill(0) } }, aim, settings,
      getCue: () => ({ x: 0, y: 0 }), getCameraMode: () => 'free', canAim: () => true, canPlace: () => false,
      tryPlace() {}, onFire() {}, onPreview() {},
    });
    return { c, aim };
  }
  const ev = (id, x, y, extra = {}) => ({ pointerType: 'touch', pointerId: id, button: 0, clientX: x, clientY: y, shiftKey: false, ...extra });

  it('one finger starts an aim drag; a second finger cancels it (camera gesture)', () => {
    const { c } = makeController();
    c._down(ev(1, 10, 10));
    expect(c.drag).not.toBeNull();
    expect(c.drag.touch).toBe(true);
    c._down(ev(2, 50, 50));
    expect(c.drag).toBeNull();
    c._up(ev(2, 50, 50));
    c._up(ev(1, 10, 10));
    expect(c.touches.size).toBe(0);
  });

  it('touch dragging rotates the aim relatively, fine aim is slower', () => {
    const a = makeController();
    a.c._down(ev(1, 100, 100));
    const before = a.aim.angle;
    a.c._move(ev(1, 160, 100));
    a.c._move(ev(1, 220, 100));
    const coarse = Math.abs(a.aim.angle - before);
    expect(coarse).toBeGreaterThan(0.05);

    const b = makeController();
    b.c.fine = true;
    b.c._down(ev(1, 100, 100));
    const before2 = b.aim.angle;
    b.c._move(ev(1, 160, 100));
    b.c._move(ev(1, 220, 100));
    const fine = Math.abs(b.aim.angle - before2);
    expect(fine).toBeLessThan(coarse / 3);
  });
});
