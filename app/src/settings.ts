// The values the developer settings screen can change while the app runs
// (docs/app-spec.md section 2, "Developer settings screen").

import { DEFAULT_DETECTOR_SETTINGS } from './mic/speech-detector';
import { DEFAULT_SETTINGS } from './lesson/machine';

export interface DevSettings {
  /** Silence after the learner stops speaking that ends the wait. */
  silenceMs: number;
  /** Longest wait without speech, or of one stretch of non-stop speech. */
  maxWaitMs: number;
  /** Speech starts above noise * startRatio. */
  startRatio: number;
  /** Speech ends below noise * endRatio. */
  endRatio: number;
  /** Floor for the start threshold. */
  minLevel: number;
  /** The level must stay above the start threshold this long to count as speech. */
  startMs: number;
  /** The level must stay below the end threshold this long to end the speech. */
  hangMs: number;
  /** Playback speed of the English meaning (1 = normal). */
  meaningRate: number;
}

export const DEFAULT_DEV_SETTINGS: DevSettings = {
  silenceMs: DEFAULT_SETTINGS.silenceMs,
  maxWaitMs: DEFAULT_SETTINGS.maxWaitMs,
  startRatio: DEFAULT_DETECTOR_SETTINGS.startRatio,
  endRatio: DEFAULT_DETECTOR_SETTINGS.endRatio,
  minLevel: DEFAULT_DETECTOR_SETTINGS.minLevel,
  startMs: DEFAULT_DETECTOR_SETTINGS.startMs,
  hangMs: DEFAULT_DETECTOR_SETTINGS.hangMs,
  meaningRate: 1,
};

export interface SettingField {
  key: keyof DevSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Shown value, for example seconds instead of milliseconds. */
  format(value: number): string;
  /** Says when a change takes effect. */
  note?: string;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export const SETTING_FIELDS: SettingField[] = [
  {
    key: 'silenceMs',
    label: 'Silence that ends the wait',
    min: 500,
    max: 8000,
    step: 100,
    format: seconds,
    note: 'from the next wait',
  },
  {
    key: 'maxWaitMs',
    label: 'Maximum wait',
    min: 3000,
    max: 40000,
    step: 500,
    format: seconds,
    note: 'from the next wait',
  },
  {
    key: 'startRatio',
    label: 'Speech starts above (× noise)',
    min: 1.5,
    max: 10,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'endRatio',
    label: 'Speech ends below (× noise)',
    min: 1,
    max: 8,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'minLevel',
    label: 'Lowest start threshold',
    min: 0.001,
    max: 0.03,
    step: 0.001,
    format: (v) => v.toFixed(3),
  },
  {
    key: 'startMs',
    label: 'Speech must last',
    min: 50,
    max: 600,
    step: 50,
    format: (v) => `${v} ms`,
  },
  {
    key: 'hangMs',
    label: 'Quiet that ends speech',
    min: 100,
    max: 1500,
    step: 50,
    format: (v) => `${v} ms`,
  },
  {
    key: 'meaningRate',
    label: 'Meaning voice speed',
    min: 0.5,
    max: 1.5,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}×`,
  },
];

/** Settings from stored data: unknown or invalid values fall back to the defaults. */
export function sanitizeSettings(data: unknown): DevSettings {
  const source =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : {};
  const result = { ...DEFAULT_DEV_SETTINGS };
  for (const field of SETTING_FIELDS) {
    const value = source[field.key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[field.key] = Math.min(field.max, Math.max(field.min, value));
    }
  }
  return result;
}

/** The part of Storage that is used, so tests can use a fake. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SETTINGS_KEY = 'morning-lesson.dev-settings';

/** Storage can be missing or throw (private windows), so every call is guarded. */
export function loadSettings(
  storage: SettingsStorage | undefined,
): DevSettings {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    return sanitizeSettings(text ? JSON.parse(text) : undefined);
  } catch {
    return { ...DEFAULT_DEV_SETTINGS };
  }
}

export function saveSettings(
  storage: SettingsStorage | undefined,
  settings: DevSettings,
): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not saved: the settings still apply until the page is closed.
  }
}

export function clearSettings(storage: SettingsStorage | undefined): void {
  try {
    storage?.removeItem(SETTINGS_KEY);
  } catch {
    // Nothing to clear.
  }
}
