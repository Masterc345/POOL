export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const toDeg = (r) => (r * 180) / Math.PI;
export const toRad = (d) => (d * Math.PI) / 180;

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Smallest distance from point p to segment a-b (all {x,y}). */
export function distPointSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** Deterministic PRNG (mulberry32). */
export function createRng(seed = Date.now() >>> 0) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  next.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return next;
}

/** Pure mobile heuristic (testable): coarse pointer on a small screen, or a phone/tablet user agent. */
export function detectMobile({ coarse = false, width = 1920, height = 1080, ua = '' } = {}) {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return !!coarse && Math.min(width, height) <= 900;
}

export function isMobile() {
  if (typeof window === 'undefined') return false;
  return detectMobile({
    coarse: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
    width: window.innerWidth, height: window.innerHeight,
    ua: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
  });
}

/** Storage backend: Electron file store through the preload bridge, else localStorage, else memory. */
export function createStorageBackend() {
  const api = typeof window !== 'undefined' ? window.poolAPI : undefined;
  if (api && api.isElectron) {
    return {
      kind: 'electron',
      read: async (name) => api.readStorage(name),
      write: async (name, text) => api.writeStorage(name, text),
    };
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('__pm3d_probe', '1');
      localStorage.removeItem('__pm3d_probe');
      return {
        kind: 'localStorage',
        read: async (name) => localStorage.getItem(`pm3d:${name}`),
        write: async (name, text) => { localStorage.setItem(`pm3d:${name}`, text); return true; },
      };
    }
  } catch { /* fall through */ }
  return createMemoryBackend();
}

export function createMemoryBackend() {
  const mem = new Map();
  return {
    kind: 'memory',
    read: async (name) => (mem.has(name) ? mem.get(name) : null),
    write: async (name, text) => { mem.set(name, text); return true; },
  };
}
