// Application shell: boot, screens, input shortcuts, settings application and the main loop.
import { EventManager } from './EventManager.js';
import { GameLoop } from './GameLoop.js';
import { SceneManager } from './SceneManager.js';
import { SettingsStore } from './Settings.js';
import { StatsStore } from './Stats.js';
import { PoolScene } from '../scene/PoolScene.js';
import { SoundManager } from '../audio/SoundManager.js';
import { Commentator } from '../audio/Commentator.js';
import { createCommentary } from '../audio/CommentaryScript.js';
import { MatchManager } from '../gameplay/MatchManager.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { setupRack } from '../gameplay/TableState.js';
import { MainMenu } from '../ui/MainMenu.js';
import { GameHUD } from '../ui/GameHUD.js';
import { SettingsMenu } from '../ui/SettingsMenu.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { ResultsScreen } from '../ui/ResultsScreen.js';
import { CAMERA_MODES } from '../camera/CameraManager.js';
import { h } from '../ui/dom.js';
import { isMobile } from '../utils/Helpers.js';

export class Game {
  constructor(root) {
    this.root = root;
    this.events = new EventManager();
    this.settings = new SettingsStore();
    this.stats = new StatsStore();
    this.screen = 'menu'; // 'menu' | 'playing'
  }

  async init() {
    await Promise.all([this.settings.load(), this.stats.load()]);
    this.mobile = isMobile();
    if (this.mobile && this.settings.fresh) {
      // first launch on a phone/tablet: light settings so it runs smoothly
      this.settings.patch({ graphicsQuality: 'low', showCrowd: false, showHints: false });
    }

    this.viewport = h('div', { class: 'viewport' });
    this.ui = h('div', { class: 'ui' });
    this.root.append(this.viewport, h('div', { class: 'vignette' }), this.ui, h('div', { class: 'rotate-hint' }, 'Rotate your phone to landscape for the best view'));
    document.documentElement.classList.toggle('mobile', this.mobile);

    try {
      this.sceneManager = new SceneManager(this.viewport, this.settings);
    } catch (err) {
      this._fatal('Your graphics driver does not support WebGL, which PoolMaster3D needs.', err);
      return;
    }
    this.poolScene = new PoolScene(this.sceneManager, this.settings);
    this.sceneManager.setActive(this.poolScene);
    this.sound = new SoundManager(this.settings);
    this.commentator = new Commentator(this.settings, this.events);
    this.script = createCommentary();

    // background scene for the menu
    this.menuWorld = setupRack(new PhysicsWorld(), 7);
    this.menuAngle = 0;

    this.match = new MatchManager({
      poolScene: this.poolScene, sceneManager: this.sceneManager, settings: this.settings,
      sound: this.sound, events: this.events, stats: this.stats,
    });

    this._buildUi();
    this._bindEvents();
    this.applySettings(null);
    this.poolScene.applyLook();
    this.showMenu();
    this.loop = new GameLoop((dt) => this.frame(dt));
    this.loop.start();
  }

  _fatal(message, err) {
    console.error(err);
    this.root.append(h('div', { class: 'fatal' }, h('h1', {}, 'PoolMaster3D cannot start'), h('p', {}, message), h('p', { class: 'note' }, String(err && err.message ? err.message : err))));
  }

  _buildUi() {
    this.menu = new MainMenu(this.ui, {
      settings: this.settings, stats: this.stats, sound: this.sound,
      cb: {
        onStart: (config) => { this.sound.unlock(); this.startMatch(config); },
        onSettings: () => { this.sound.unlock(); this.settingsMenu.open(); },
        onExit: () => this.exit(),
      },
    });
    this.settingsMenu = new SettingsMenu(this.ui, { settings: this.settings, commentator: this.commentator, onClose: () => {} });
    this.hud = new GameHUD(this.ui, {
      onPause: () => this.togglePause(),
      onFire: () => this.match.fire(),
      onPower: (p) => this.match.setPower(p),
      onSpin: (a, b) => this.match.setSpin(a, b),
      onCamera: (m) => this.poolScene.cameraManager.setMode(m),
      onAssist: (l) => this.match.setAssistLevel(l),
      onSelectRank: (i) => this.match.selectRanked(i),
      onReset: () => this.match.resetPractice(),
      onReplay: () => this.match.toggleReplay(),
      onSlowMo: () => this.match.toggleSlowMo(),
      onFine: () => { this.match.controller.fine = !this.match.controller.fine; },
      onTrajectory: () => { const v = !this.match.assist.showTrajectory; this.match.setTrajectoryVisible(v); this.settings.set('showTrajectory', v); },
    });
    this.pauseMenu = new PauseMenu(this.ui, {
      onResume: () => this.togglePause(false),
      onRestart: () => { this.pauseMenu.show(false); this.match.restart(); },
      onSettings: () => this.settingsMenu.open(),
      onQuit: () => { this.pauseMenu.show(false); this.showMenu(); },
    });
    this.results = new ResultsScreen(this.ui, {
      onRematch: () => { this.results.show(false); this.match.restart(); },
      onMenu: () => { this.results.show(false); this.showMenu(); },
    });
  }

  _bindEvents() {
    this.events.on('matchEnd', (r) => {
      this.results.render(r);
      this.results.show(true);
      this.poolScene.audience.react('celebrate');
      this.poolScene.referee.signal('win');
      this.sound.playCrowd('win');
    });
    this.events.on('shotResult', (o) => { this._reactToShot(o); this.commentator.say(this.script.shotResult(o, this._commentaryContext())); });
    this.events.on('matchStart', (m) => this.commentator.say(this.script.matchStart({ mode: m.config.mode, players: m.players, difficulty: m.config.difficulty })));
    this.events.on('matchEnd', (r) => this.commentator.say(this.script.matchEnd(r)));
    this.events.on('practiceShot', (e) => this.commentator.say(this.script.practiceShot(e)));
    this.events.on('replayStart', () => this.commentator.say(this.script.replay()));
    this.events.on('clockWarning', (e) => this.commentator.say(this.script.clockWarning(e.seconds)));
    this.events.on('commentary', (c) => this.hud.setCaption(c.text));
    this.settings.onChange((v, changed) => this.applySettings(changed));
    window.addEventListener('keydown', (e) => this._onKey(e));
    // Chromium suspends audio until the first gesture
    // iOS/Android only allow audio after a touch gesture, so try on every first interaction
    for (const type of ['pointerdown', 'touchend', 'click']) window.addEventListener(type, () => this.sound.unlock(), { passive: true });
    window.addEventListener('beforeunload', () => { this.settings.flush(); this.stats.flush(); });
  }

  _commentaryContext() {
    const m = this.match;
    return {
      players: m.players,
      remaining: (p) => (m.rules && m.rules.groups[p] ? m.rules.remainingOwn(p).length : null),
      run: (p) => m.score.players[p].run,
    };
  }

  /** Referee and crowd react to the result of a shot. */
  _reactToShot(o) {
    const { audience, referee } = this.poolScene;
    if (o.foul) {
      referee.signal('foul');
      audience.react('groan', 0.7);
      this.sound.playWhistle();
      this.sound.playCrowd('groan');
    } else if (o.legalPots && o.legalPots.length) {
      referee.signal('good');
      audience.react('cheer', Math.min(1, 0.45 + 0.25 * o.legalPots.length));
      this.sound.playCrowd('cheer');
    }
  }

  _onKey(e) {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'Escape') {
      if (this.settingsMenu.isOpen) this.settingsMenu.close();
      else if (this.screen === 'playing' && this.match.state !== 'gameOver') this.togglePause();
      return;
    }
    if (this.screen !== 'playing') return;
    const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (idx >= 0) this.poolScene.cameraManager.setMode(CAMERA_MODES[idx]);
    else if (e.code === 'KeyC') this.poolScene.cameraManager.cycle();
    else if (e.code === 'KeyP') this.togglePause();
    else if (e.code === 'KeyR') this.match.toggleReplay();
    else if (e.code === 'KeyT') this.match.toggleSlowMo();
  }

  applySettings(changed) {
    const has = (k) => !changed || changed.includes(k);
    if (has('clothColor') || has('showCrowd') || has('showReferee')) this.poolScene.applyLook();
    if (has('graphicsQuality') || has('brightness')) { this.sceneManager.applyQuality(); this.poolScene.applyQuality(); }
    if (has('audioVolume') || has('musicVolume')) this.sound.applySettings();
    if (has('resolution') || has('fullscreen')) this.applyWindowMode();
    if (has('assistanceLevel')) this.match.assist.setLevel(this.settings.get('assistanceLevel'));
    if (has('showTrajectory')) this.match.assist.showTrajectory = this.settings.get('showTrajectory');
  }

  applyWindowMode() {
    const fullscreen = this.settings.get('fullscreen');
    const res = this.settings.get('resolution');
    const api = window.poolAPI;
    if (api && api.isElectron) {
      let width, height;
      if (res !== 'auto') [width, height] = res.split('x').map(Number);
      api.applyWindow({ fullscreen, width, height });
    } else if (fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (!fullscreen && document.fullscreenElement) {
      document.exitFullscreen?.();
    }
  }

  // ---------------------------------------------------------------- screens
  showMenu() {
    this.screen = 'menu';
    this.commentator.stop();
    this.match.stop();
    this.hud.show(false);
    this.results.show(false);
    this.pauseMenu.show(false);
    this.menu.show(true);
  }

  startMatch(config) {
    this.screen = 'playing';
    this.menu.show(false);
    this.results.show(false);
    this.hud.show(true);
    this.hud.cache = {};
    this.poolScene.cameraManager.setMode('free');
    this.match.start(config);
  }

  togglePause(force) {
    if (this.screen !== 'playing') return;
    const pause = force === undefined ? !this.match.paused : force;
    this.match.paused = pause;
    if (pause) this.commentator.stop();
    this.pauseMenu.show(pause);
  }

  exit() {
    this.settings.flush();
    this.stats.flush();
    if (window.poolAPI && window.poolAPI.quit) window.poolAPI.quit();
    else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) window.Capacitor.Plugins.App.exitApp();
    else window.close();
  }

  /** Android hardware Back button. */
  handleBack() {
    if (this.settingsMenu.isOpen) { this.settingsMenu.close(); return; }
    if (!this.results.el.classList.contains('hidden')) { this.results.show(false); this.showMenu(); return; }
    if (this.screen === 'playing') { this.togglePause(); return; }
    if (!this.menu.atRoot) { this.menu.showMain(); return; }
    this.exit();
  }

  // ---------------------------------------------------------------- loop
  frame(dt) {
    if (this.screen === 'playing') {
      this.match.update(dt);
      this.hud.update(this.match.getHudState(), this.settings);
    } else {
      this._menuBackground(dt);
    }
    this.sceneManager.render();
  }

  _menuBackground(dt) {
    const pc = this.poolScene;
    pc.balls.sync(this.menuWorld, dt);
    pc.cue.setVisible(false);
    pc.aimRenderer.hideAll();
    pc.cameraManager.free.azimuth += dt * 0.08;
    pc.cameraManager.free.polar = 0.85;
    pc.cameraManager.free.distance = 2.9;
    pc.updateCamera(dt, { cue: { x: 0, y: 0 }, aimAngle: 0, focus: null, shooting: false });
  }
}
