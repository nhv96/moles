// The developer settings panel (docs/app-spec.md section 2). Only loaded in
// development mode (`npm run dev`), never in the production build.

import {
  DEFAULT_DEV_SETTINGS,
  type DevSettings,
  SETTING_FIELDS,
  clearSettings,
  loadSettings,
  saveSettings,
} from './settings';

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Adds the panel to `container`. Calls `onChange` with the current settings
 * at once and after every change. Settings are kept in the browser between runs.
 */
export function mountDevSettings(
  container: HTMLElement,
  onChange: (settings: DevSettings) => void,
  log: (message: string) => void,
): void {
  let settings = loadSettings(storage());

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Developer settings';
  details.append(summary);

  const rows = new Map<
    keyof DevSettings,
    { input: HTMLInputElement; value: HTMLElement }
  >();
  for (const field of SETTING_FIELDS) {
    const label = document.createElement('label');
    const value = document.createElement('b');
    label.append(`${field.label}: `, value);
    if (field.note) label.append(` (${field.note})`);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);
    input.oninput = () => {
      settings = { ...settings, [field.key]: Number(input.value) };
      show();
      saveSettings(storage(), settings);
      onChange(settings);
    };
    // Logged once per change, not per slider step.
    input.onchange = () =>
      log(`setting ${field.key} = ${field.format(settings[field.key])}`);
    label.append(input);
    details.append(label);
    rows.set(field.key, { input, value });
  }

  const reset = document.createElement('button');
  reset.className = 'secondary';
  reset.textContent = 'Reset to defaults';
  reset.onclick = () => {
    settings = { ...DEFAULT_DEV_SETTINGS };
    clearSettings(storage());
    show();
    onChange(settings);
    log('settings reset to the defaults');
  };
  details.append(reset);

  function show(): void {
    for (const field of SETTING_FIELDS) {
      const row = rows.get(field.key);
      if (!row) continue;
      row.input.value = String(settings[field.key]);
      row.value.textContent = field.format(settings[field.key]);
    }
  }

  container.append(details);
  show();
  onChange(settings);
}
