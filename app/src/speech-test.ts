// Dev-only page: shows the microphone level and when the speech detector says
// "speaking", to tune the settings and to test outdoors (no audio playback).

import { MicMonitor, listInputs } from './mic/mic-monitor';

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const t0 = Date.now();
const lines: string[] = [];

function log(message: string): void {
  lines.unshift(
    `${((Date.now() - t0) / 1000).toFixed(1).padStart(7)}s  ${message}`,
  );
  el('log').textContent = lines.join('\n');
}

el('copy').onclick = () => void navigator.clipboard.writeText(lines.join('\n'));

const BAR_FULL_SCALE = 0.1; // level shown as a full bar
let level = 0;
let peakInSpeech = 0;
let maxLagMs = 0;
let firstSample: { audioMs: number; wallMs: number } | undefined;

function render(): void {
  const { phase, speaking, calibration } = monitor.detector.state;
  const state = el('state');
  state.textContent =
    phase === 'calibrating' ? 'Stay quiet…' : speaking ? 'SPEAKING' : 'silent';
  state.className =
    phase === 'calibrating' ? 'calibrating' : speaking ? 'speaking' : '';
  el('bar').style.width = `${Math.min(100, (level / BAR_FULL_SCALE) * 100)}%`;
  const at = (value: number) =>
    `${Math.min(100, (value / BAR_FULL_SCALE) * 100)}%`;
  el('markStart').style.left = calibration
    ? at(calibration.startThreshold)
    : '-10px';
  el('markEnd').style.left = calibration
    ? at(calibration.endThreshold)
    : '-10px';
  el('status').textContent =
    `level ${level.toFixed(4)}` +
    (calibration
      ? ` | noise ${calibration.noise.toFixed(4)} | start ${calibration.startThreshold.toFixed(4)} | end ${calibration.endThreshold.toFixed(4)}`
      : '') +
    ` | page=${document.visibilityState} | worst delivery delay ${(maxLagMs / 1000).toFixed(1)}s`;
}

const monitor = new MicMonitor({
  speechStart: () => {
    peakInSpeech = level;
    log(`speech START (level ${level.toFixed(4)})`);
  },
  speechEnd: () => log(`speech END (peak ${peakInSpeech.toFixed(4)})`),
  calibrated: (c) =>
    log(
      `calibrated: noise ${c.noise.toFixed(4)}, start threshold ${c.startThreshold.toFixed(4)}, end threshold ${c.endThreshold.toFixed(4)}`,
    ),
  level: (audioMs, rms) => {
    level = rms;
    peakInSpeech = Math.max(peakInSpeech, rms);
    // How late levels reach the page compared with the audio clock (page throttling).
    const now = Date.now();
    firstSample ??= { audioMs, wallMs: now };
    const lagMs = now - firstSample.wallMs - (audioMs - firstSample.audioMs);
    if (lagMs > maxLagMs + 1000) {
      log(
        `levels reach the page ${(lagMs / 1000).toFixed(1)} s late (page throttled)`,
      );
    }
    maxLagMs = Math.max(maxLagMs, lagMs);
  },
  log,
});

function bindRatio(id: 'startRatio' | 'endRatio'): void {
  const input = el<HTMLInputElement>(id);
  const apply = () => {
    const ratio = Number(input.value) / 10;
    el(`${id}Value`).textContent = ratio.toFixed(1);
    monitor.detector.updateSettings({ [id]: ratio });
  };
  input.oninput = apply;
  apply();
}
bindRatio('startRatio');
bindRatio('endRatio');

// Settings that are not a ratio of the noise: shown and logged when changed.
function bindSetting(
  id: 'minLevel' | 'startMs',
  fromSlider: (value: number) => number,
  show: (value: number) => string,
): void {
  const input = el<HTMLInputElement>(id);
  const apply = () => {
    const value = fromSlider(Number(input.value));
    el(`${id}Value`).textContent = show(value);
    monitor.detector.updateSettings({ [id]: value });
  };
  input.oninput = apply;
  input.onchange = () =>
    log(`${id} set to ${show(fromSlider(Number(input.value)))}`);
  apply();
}
bindSetting(
  'minLevel',
  (v) => v / 10000,
  (v) => v.toFixed(4),
);
bindSetting(
  'startMs',
  (v) => v,
  (v) => String(v),
);

async function openMic(deviceId?: string): Promise<void> {
  await monitor.open(deviceId);
  el<HTMLButtonElement>('recalibrate').disabled = false;
  log('mic open: stay quiet for about 2.5 s');
  // Labels are only known once the permission is granted.
  const inputs = await listInputs();
  log(
    `microphones offered: ${inputs.map((d) => d.label || '(no label)').join(' | ')}`,
  );
  const select = el<HTMLSelectElement>('input');
  select.replaceChildren(
    ...inputs.map(
      (d) => new Option(d.label || d.deviceId.slice(0, 8), d.deviceId),
    ),
  );
  select.disabled = false;
  el<HTMLButtonElement>('switch').disabled = false;
  const active = monitor.activeDeviceId;
  if (active) select.value = active;
}

el('switch').onclick = async () => {
  const select = el<HTMLSelectElement>('input');
  log(`switching to: ${select.selectedOptions[0]?.text}`);
  try {
    await openMic(select.value);
  } catch (error) {
    log(`FAILED: ${error}`);
  }
};

el<HTMLButtonElement>('start').onclick = async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  button.disabled = true;
  try {
    log(`UA: ${navigator.userAgent}`);
    await openMic();
  } catch (error) {
    log(`FAILED: ${error}`);
    button.disabled = false;
  }
};

el('recalibrate').onclick = () => {
  monitor.recalibrate();
  log('measuring the noise again');
};

document.addEventListener('visibilitychange', () =>
  log(`page ${document.visibilityState}`),
);

setInterval(render, 100);
render();
