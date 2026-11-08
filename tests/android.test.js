import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { patchManifest, mainActivitySource, prepare } = await import('../scripts/android-prepare.mjs');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const TEMPLATE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name">
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize"
            android:name=".MainActivity"
            android:exported="true">
        </activity>
    </application>
</manifest>`;

describe('Android (Capacitor) build', () => {
  it('capacitor config matches the app identity and web build folder', () => {
    const c = JSON.parse(read('capacitor.config.json'));
    expect(c.appId).toBe('com.poolmaster3d.game');
    expect(c.appName).toBe('PoolMaster3D');
    expect(c.webDir).toBe('dist');
    const pkg = JSON.parse(read('package.json'));
    for (const d of ['@capacitor/core', '@capacitor/android', '@capacitor/cli', '@capacitor/app']) expect(pkg.devDependencies[d]).toBeDefined();
  });

  it('manifest patch forces landscape and is idempotent', () => {
    const once = patchManifest(TEMPLATE_MANIFEST);
    expect(once).toContain('android:screenOrientation="sensorLandscape"');
    expect(patchManifest(once)).toBe(once);
    expect(once).toContain('android:name=".MainActivity"');
  });

  it('MainActivity source is full screen, keeps the screen on and uses the right package', () => {
    const src = mainActivitySource('com.poolmaster3d.game');
    expect(src).toContain('package com.poolmaster3d.game;');
    expect(src).toContain('extends BridgeActivity');
    expect(src).toContain('FLAG_KEEP_SCREEN_ON');
    expect(src).toContain('hide(WindowInsetsCompat.Type.systemBars())');
  });

  it('prepare() customises a generated project (manifest, activity, icons, colours)', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pm3d-'));
    const main = path.join(root, 'android', 'app', 'src', 'main');
    mkdirSync(path.join(main, 'java', 'com', 'poolmaster3d', 'game'), { recursive: true });
    mkdirSync(path.join(main, 'res'), { recursive: true });
    writeFileSync(path.join(main, 'AndroidManifest.xml'), TEMPLATE_MANIFEST);
    writeFileSync(path.join(main, 'java', 'com', 'poolmaster3d', 'game', 'MainActivity.java'), 'package com.poolmaster3d.game;\npublic class MainActivity {}\n');
    mkdirSync(path.join(root, 'resources', 'android', 'mipmap-hdpi'), { recursive: true });
    writeFileSync(path.join(root, 'resources', 'android', 'mipmap-hdpi', 'ic_launcher.png'), 'png');
    prepare(root);
    expect(readFileSync(path.join(main, 'AndroidManifest.xml'), 'utf8')).toContain('sensorLandscape');
    expect(readFileSync(path.join(main, 'java', 'com', 'poolmaster3d', 'game', 'MainActivity.java'), 'utf8')).toContain('KEEP_SCREEN_ON');
    expect(existsSync(path.join(main, 'res', 'mipmap-hdpi', 'ic_launcher.png'))).toBe(true);
    expect(readFileSync(path.join(main, 'res', 'values', 'ic_launcher_background.xml'), 'utf8')).toContain('#0E5C38');
    prepare(root); // running twice is harmless
  });

  it('prepare() fails clearly when the Android project is missing', () => {
    expect(() => prepare(mkdtempSync(path.join(tmpdir(), 'pm3d-')))).toThrow();
  });

  it('launcher icons exist for every density', () => {
    for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
        expect(existsSync(new URL(`../resources/android/mipmap-${d}/${f}`, import.meta.url))).toBe(true);
      }
    }
  });

  it('APK workflow builds a debug APK with Java 17 and uploads it', () => {
    const wf = read('.github/workflows/build-android.yml');
    expect(wf).toContain('java-version: 17');
    expect(wf).toContain('npx cap add android');
    expect(wf).toContain('android-prepare.mjs');
    expect(wf).toContain('assembleDebug');
    expect(wf).toContain('PoolMaster3D.apk');
  });

  it('web code skips the service worker inside the Android app and handles the Back button', () => {
    const main = read('src/main.js');
    expect(main).toContain('!window.Capacitor');
    expect(main).toContain('backButton');
  });
});
