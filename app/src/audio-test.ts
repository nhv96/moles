// Dev-only page: plays all of lesson 1 with the real state machine and audio
// module (no mic), to check screen-locked playback and the watchdog.

import { createBrowserAudio } from './audio/browser';
import { loadLesson } from './audio/loader';
import { DEFAULT_PLAYER_CONFIG } from './audio/player';
import { LessonMachine } from './lesson/machine';

// ?wait=<seconds> sets the wait between clips (default 3), ?silent=0 turns the silent track off.
const params = new URLSearchParams(location.search);
const waitMs = Number(params.get('wait') ?? 3) * 1000;
const silentTrack = params.get('silent') !== '0';

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const startButton = el<HTMLButtonElement>('start');
const t0 = Date.now();
const lines: string[] = [];

function log(message: string): void {
  lines.unshift(
    `${((Date.now() - t0) / 1000).toFixed(1).padStart(7)}s  ${message}`,
  );
  el('log').textContent = lines.join('\n');
}

el('copy').onclick = () => void navigator.clipboard.writeText(lines.join('\n'));

el('mic').onclick = async () => {
  log('asking for the mic (the permission dialog may stall playback)');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    log(`mic granted: ${stream.getAudioTracks()[0]?.label}`);
  } catch (error) {
    log(`mic failed: ${error}`);
  }
};

startButton.onclick = async () => {
  startButton.disabled = true;
  try {
    log(`options: wait=${waitMs / 1000}s, silentTrack=${silentTrack}`);
    log('loading the lesson');
    const { manifest, clips } = await loadLesson(
      `${import.meta.env.BASE_URL}lessons/lesson-01/`,
    );
    log(`loaded ${manifest.items.length} sentences`);

    const machine = new LessonMachine(
      manifest.items.length,
      window,
      (effect) => {
        log(`effect: ${JSON.stringify(effect)}`);
        audio.apply(effect);
      },
      { silenceMs: waitMs, maxWaitMs: waitMs }, // no mic here: just a wait between clips
    );
    const audio = createBrowserAudio(
      clips,
      {
        clipEnded: (id) => machine.clipEnded(id),
        repeat: () => machine.repeat(),
        next: () => machine.next(),
        pausedChange: (paused) => log(paused ? 'PAUSED' : 'RESUMED'),
        log,
      },
      manifest.title,
      { ...DEFAULT_PLAYER_CONFIG, silentTrack },
    );

    await audio.start();
    log('silent track playing');
    machine.start();
    setInterval(() => {
      const { phase, index } = machine.state;
      el('status').textContent =
        `${phase}, sentence ${index + 1} | ${audio.snapshot()} | page=${document.visibilityState}`;
    }, 500);
  } catch (error) {
    log(`FAILED: ${error}`);
    startButton.disabled = false;
  }
};
