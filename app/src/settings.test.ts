import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEV_SETTINGS,
  SETTINGS_KEY,
  type SettingsStorage,
  clearSettings,
  loadSettings,
  sanitizeSettings,
  saveSettings,
} from './settings';

function fakeStorage(initial?: string): SettingsStorage & { data?: string } {
  const storage = {
    data: initial,
    getItem: () => storage.data ?? null,
    setItem: (_key: string, value: string) => void (storage.data = value),
    removeItem: () => void (storage.data = undefined),
  };
  return storage;
}

describe('defaults', () => {
  it('match the machine and the detector (4 s, 15 s, 3, 2, 0.003, 100, 400)', () => {
    expect(DEFAULT_DEV_SETTINGS).toEqual({
      silenceMs: 4000,
      maxWaitMs: 15000,
      startRatio: 3,
      endRatio: 2,
      minLevel: 0.003,
      startMs: 100,
      hangMs: 400,
      meaningRate: 1,
    });
  });
});

describe('sanitizeSettings', () => {
  it('keeps valid values', () => {
    expect(sanitizeSettings({ silenceMs: 2000, meaningRate: 0.8 })).toEqual({
      ...DEFAULT_DEV_SETTINGS,
      silenceMs: 2000,
      meaningRate: 0.8,
    });
  });

  it('clamps values outside the range', () => {
    const result = sanitizeSettings({ silenceMs: 1, meaningRate: 9 });
    expect(result.silenceMs).toBe(500);
    expect(result.meaningRate).toBe(1.5);
  });

  it('uses the default for wrong types and non-numbers', () => {
    expect(
      sanitizeSettings({ silenceMs: '3000', maxWaitMs: NaN, startMs: null }),
    ).toEqual(DEFAULT_DEV_SETTINGS);
  });

  it('copes with data that is not an object', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_DEV_SETTINGS);
    expect(sanitizeSettings(5)).toEqual(DEFAULT_DEV_SETTINGS);
  });
});

describe('storage', () => {
  it('saves and loads', () => {
    const storage = fakeStorage();
    saveSettings(storage, { ...DEFAULT_DEV_SETTINGS, maxWaitMs: 8000 });
    expect(loadSettings(storage).maxWaitMs).toBe(8000);
  });

  it('loads the defaults when nothing is stored or the data is broken', () => {
    expect(loadSettings(fakeStorage())).toEqual(DEFAULT_DEV_SETTINGS);
    expect(loadSettings(fakeStorage('{oops'))).toEqual(DEFAULT_DEV_SETTINGS);
    expect(loadSettings(undefined)).toEqual(DEFAULT_DEV_SETTINGS);
  });

  it('clears', () => {
    const storage = fakeStorage();
    saveSettings(storage, DEFAULT_DEV_SETTINGS);
    clearSettings(storage);
    expect(storage.data).toBeUndefined();
  });

  it('does not throw when the storage does', () => {
    const broken: SettingsStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_DEV_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_DEV_SETTINGS)).not.toThrow();
    expect(() => clearSettings(broken)).not.toThrow();
    expect(SETTINGS_KEY).toBeTruthy();
  });
});
