import '../styles/main.css';
import { Game } from './core/Game.js';

const root = document.getElementById('app');
const game = new Game(root);
window.__poolmaster = game; // handy for debugging in development builds

game.init().catch((err) => {
  console.error(err);
  const box = document.createElement('div');
  box.className = 'fatal';
  box.innerHTML = '<h1>PoolMaster3D cannot start</h1><p>An unexpected error occurred while loading the game.</p>';
  const pre = document.createElement('pre');
  pre.textContent = String(err && err.stack ? err.stack : err);
  box.append(pre);
  root.append(box);
});

// Web/phone version: register the service worker (not in the Electron desktop app, which loads from file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.poolAPI && !window.Capacitor) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[pwa] service worker not registered', err));
  });
}

// Android app (Capacitor): the hardware Back button pauses / goes back instead of closing the game
if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
  import('@capacitor/app')
    .then(({ App }) => App.addListener('backButton', () => game.handleBack()))
    .catch((err) => console.warn('[android] back button handler not installed', err));
}
