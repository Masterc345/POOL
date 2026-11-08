import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const builder = read('electron-builder.yml');
const nsh = read('electron/installer/installer.nsh');

describe('package.json build commands', () => {
  it('defines every required npm script', () => {
    for (const s of ['dev', 'build', 'start', 'dist', 'dist:win', 'test']) expect(typeof pkg.scripts[s]).toBe('string');
    expect(pkg.scripts['dist:win']).toContain('--win');
    expect(pkg.scripts.build).toContain('vite build');
    expect(pkg.scripts.test).toContain('vitest');
  });
  it('declares the required stack', () => {
    expect(pkg.devDependencies.three).toBeDefined(); // bundled by Vite, so it is not shipped as a runtime dependency
    for (const d of ['electron', 'electron-builder', 'vite', 'vitest']) expect(pkg.devDependencies[d]).toBeDefined();
    expect(pkg.main).toBe('electron/main.js');
  });
});

describe('installer configuration', () => {
  it('is a Windows x64 NSIS wizard with directory selection and no one-click install', () => {
    expect(builder).toContain('target: nsis');
    expect(builder).toContain('- x64');
    expect(builder).toMatch(/oneClick:\s*false/);
    expect(builder).toMatch(/allowToChangeInstallationDirectory:\s*true/);
    expect(builder).toMatch(/perMachine:\s*true/);
    expect(builder).toMatch(/runAfterFinish:\s*true/);
    expect(builder).toMatch(/deleteAppDataOnUninstall:\s*false/);
    expect(builder).toContain('PoolMaster3D-Setup.${ext}');
    expect(builder).toContain('output: release');
  });
  it('references icons and NSIS include that exist', () => {
    for (const f of ['build/icon.ico', 'build/installerSidebar.bmp', 'electron/installer/installer.nsh']) expect(existsSync(new URL(`../${f}`, import.meta.url))).toBe(true);
  });
  it('custom NSIS script verifies files, creates shortcuts and asks before deleting user data', () => {
    expect(nsh).toContain('AtLeastWin10');
    expect(nsh).toContain('app.asar');
    expect(nsh).toContain('CreateShortCut "$DESKTOP');
    expect(nsh).toContain('CreateShortCut "$SMPROGRAMS');
    expect(nsh).toContain('MessageBox MB_YESNO');
    expect(nsh).toContain('IfSilent');
  });
  it('NSIS macros are balanced', () => {
    const opens = (nsh.match(/^!macro /gm) || []).length;
    const closes = (nsh.match(/^!macroend/gm) || []).length;
    expect(opens).toBe(closes);
    const fo = (nsh.match(/^\s*Function /gm) || []).length;
    const fe = (nsh.match(/^\s*FunctionEnd/gm) || []).length;
    expect(fo).toBe(fe);
  });
  it('CI workflow builds the Windows installer', () => {
    const wf = read('.github/workflows/build-windows.yml');
    expect(wf).toContain('windows-latest');
    expect(wf).toContain('npm run dist:win');
    expect(wf).toContain('PoolMaster3D-Setup.exe');
  });
});

describe('electron shell', () => {
  it('uses context isolation, no node integration and a sandboxed renderer', () => {
    const main = read('electron/main.js');
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('sandbox: true');
    expect(read('electron/preload.js')).toContain('contextBridge');
  });
});
