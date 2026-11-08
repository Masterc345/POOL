// Composes the 3D pool room: table, balls, lights, cue, aim overlay and camera.
import * as THREE from 'three';
import { Environment } from './Environment.js';
import { Lighting } from './Lighting.js';
import { PoolTable } from '../table/PoolTable.js';
import { BallManager } from '../balls/BallManager.js';
import { CueStick } from '../cue/CueStick.js';
import { AimRenderer } from '../aiming/AimRenderer.js';
import { Audience } from './Audience.js';
import { Referee } from './Referee.js';
import { CameraManager } from '../camera/CameraManager.js';
import { disposeBallTextures, setBallTextureQuality } from '../balls/BallMaterials.js';

export class PoolScene {
  constructor(sceneManager, settings) {
    this.sceneManager = sceneManager;
    this.settings = settings;
    setBallTextureQuality(settings.get('graphicsQuality'));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 40);
    this.camera.position.set(0, 2.2, 2.0);

    this.environment = new Environment(this.scene, sceneManager.renderer);
    this.lighting = new Lighting(this.scene);
    this.table = new PoolTable();
    this.scene.add(this.table.group);
    this.balls = new BallManager(this.scene);
    this.cue = new CueStick(this.scene);
    this.aimRenderer = new AimRenderer(this.scene);
    this.audience = new Audience(this.scene);
    this.referee = new Referee(this.scene);
    this.cameraManager = new CameraManager(this.camera, sceneManager.canvas, settings);
    this.aspect = 16 / 9;
    this.applyQuality();
  }

  applyQuality() { this.lighting.applyQuality(this.settings.get('graphicsQuality')); }

  /** Cloth colour, crowd and referee visibility from the settings. */
  applyLook() {
    this.table.setCloth(this.settings.get('clothColor'));
    this.audience.setVisible(this.settings.get('showCrowd'));
    this.referee.setVisible(this.settings.get('showReferee'));
  }

  resize(w, h) {
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(dt, ctx) {
    this.cameraManager.update(dt, { aspect: this.aspect, ...ctx });
    this.environment.update(this.camera);
    this.audience.update(dt);
    this.referee.update(dt, ctx.cue || null);
  }

  dispose() {
    this.cameraManager.dispose();
    this.audience.dispose();
    this.referee.dispose();
    this.aimRenderer.dispose();
    this.cue.dispose();
    this.balls.dispose();
    this.table.dispose();
    this.lighting.dispose();
    this.environment.dispose();
    disposeBallTextures();
  }
}
