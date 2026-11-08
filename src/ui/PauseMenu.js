import { h, show } from './dom.js';

export class PauseMenu {
  constructor(root, { onResume, onRestart, onSettings, onQuit }) {
    this.el = h('div', { class: 'screen overlay hidden' },
      h('div', { class: 'card narrow' },
        h('h2', { class: 'panel-title' }, 'Paused'),
        h('button', { class: 'btn primary', onclick: onResume }, 'Resume'),
        h('button', { class: 'btn', onclick: onRestart }, 'Restart match'),
        h('button', { class: 'btn', onclick: onSettings }, 'Settings'),
        h('button', { class: 'btn danger', onclick: onQuit }, 'Quit to main menu')));
    root.append(this.el);
  }

  show(on = true) { show(this.el, on); }
  get isOpen() { return !this.el.classList.contains('hidden'); }
}
