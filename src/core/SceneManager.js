// Owns the WebGL renderer and canvas, handles resizing and quality, renders the active scene.
import * as THREE from 'three';

const QUALITY = {
  low: { pixelRatio: 1, shadows: false },
  medium: { pixelRatio: 1.25, shadows: true },
  high: { pixelRatio: 2, shadows: true },
  ultra: { pixelRatio: 3, shadows: true },
};

export class SceneManager {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.get('graphicsQuality') !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'viewport';
    container.appendChild(this.canvas);
    this.active = null;
    this._resize = this.resize.bind(this);
    window.addEventListener('resize', this._resize);
    this.applyQuality();
    this.resize();
  }

  applyQuality() {
    const q = QUALITY[this.settings.get('graphicsQuality')] || QUALITY.high;
    this.renderer.toneMappingExposure = this.settings.get('brightness');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.active?.resize?.(w, h);
  }

  setActive(scene) { this.active = scene; this.resize(); }

  render() { if (this.active) this.renderer.render(this.active.scene, this.active.camera); }

  dispose() {
    window.removeEventListener('resize', this._resize);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
