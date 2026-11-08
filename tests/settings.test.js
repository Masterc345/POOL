import { describe, it, expect } from 'vitest';
import { SettingsStore, sanitizeSettings, DEFAULT_SETTINGS } from '../src/core/Settings.js';
import { StatsStore } from '../src/core/Stats.js';
import { createMemoryBackend } from '../src/utils/Helpers.js';
import { EventManager } from '../src/core/EventManager.js';

describe('settings persistence', () => {
  it('saves and reloads settings', async () => {
    const backend = createMemoryBackend();
    const a = new SettingsStore(backend);
    await a.load();
    a.patch({ audioVolume: 0.25, assistanceLevel: 5, graphicsQuality: 'ultra', playerName: 'Zoe' });
    await a.flush();
    const b = new SettingsStore(backend);
    await b.load();
    expect(b.get('audioVolume')).toBe(0.25);
    expect(b.get('assistanceLevel')).toBe(5);
    expect(b.get('graphicsQuality')).toBe('ultra');
    expect(b.get('playerName')).toBe('Zoe');
  });

  it('survives corrupted or hostile data', async () => {
    const backend = createMemoryBackend();
    await backend.write('settings', '{not json');
    const s = new SettingsStore(backend);
    await s.load();
    expect(s.values).toEqual({ ...DEFAULT_SETTINGS });
    const clean = sanitizeSettings({ audioVolume: 99, assistanceLevel: 12, graphicsQuality: 'ludicrous', resolution: '1x1', playerName: '   ' });
    expect(clean.audioVolume).toBe(1);
    expect(clean.assistanceLevel).toBe(DEFAULT_SETTINGS.assistanceLevel);
    expect(clean.graphicsQuality).toBe(DEFAULT_SETTINGS.graphicsQuality);
    expect(clean.resolution).toBe('auto');
    expect(clean.playerName).toBe(DEFAULT_SETTINGS.playerName);
    expect(sanitizeSettings({ brightness: 9, shotClock: 17 }).brightness).toBe(1.4);
    expect(sanitizeSettings({ shotClock: 17 }).shotClock).toBe(0);
    expect(sanitizeSettings({ shotClock: 45 }).shotClock).toBe(45);
    expect(sanitizeSettings({ clothColor: 'blue' }).clothColor).toBe('blue');
    expect(sanitizeSettings({ clothColor: 'neon' }).clothColor).toBe('green');
    expect(sanitizeSettings({ showCrowd: 'yes' }).showCrowd).toBe(true);
    expect(sanitizeSettings({ showReferee: false }).showReferee).toBe(false);
    expect(sanitizeSettings({ commentary: false }).commentary).toBe(false);
    expect(sanitizeSettings({ commentary: 'loud' }).commentary).toBe(true);
    expect(sanitizeSettings({ commentatorVoice: 'Microsoft David' }).commentatorVoice).toBe('Microsoft David');
    expect(sanitizeSettings({ commentatorVoice: 42 }).commentatorVoice).toBe('');
  });

  it('notifies listeners only for real changes', () => {
    const s = new SettingsStore(createMemoryBackend());
    const calls = [];
    s.onChange((_v, changed) => calls.push(changed));
    s.set('audioVolume', DEFAULT_SETTINGS.audioVolume);
    s.set('audioVolume', 0.1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['audioVolume']);
  });
});

describe('look and feel', () => {
  it('every cloth colour is dark (the table must never look bright)', async () => {
    const { CLOTHS } = await import('../src/utils/Constants.js');
    const lum = (hex) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    for (const [name, c] of Object.entries(CLOTHS)) expect(lum(c.base)).toBeLessThan(0.07);
    expect(Object.keys(CLOTHS)).toContain('black');
  });

  it('default brightness is subdued', () => {
    expect(DEFAULT_SETTINGS.brightness).toBeLessThanOrEqual(0.75);
  });
});

describe('stats', () => {
  it('records a finished match', async () => {
    const st = new StatsStore(createMemoryBackend());
    await st.load();
    await st.record({ players: [{ shots: 10, pocketed: [1, 2, 3], fouls: 1, longestRun: 2 }, {}], duration: 300 }, { vsAI: 'hard', humanWon: true });
    expect(st.data.gamesPlayed).toBe(1);
    expect(st.data.wins).toBe(1);
    expect(st.data.ballsPocketed).toBe(3);
    expect(st.data.vsAI.hard.w).toBe(1);
    const st2 = new StatsStore(st.backend);
    await st2.load();
    expect(st2.data.shots).toBe(10);
  });
});

describe('event manager', () => {
  it('emits, unsubscribes and isolates handler errors', () => {
    const e = new EventManager();
    let n = 0;
    const off = e.on('x', () => { n++; });
    e.on('x', () => { throw new Error('boom'); });
    e.emit('x');
    off();
    e.emit('x');
    expect(n).toBe(1);
  });
});
