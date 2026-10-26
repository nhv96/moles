// The lesson screen: loads lesson 1, then runs it on a tap (docs/app-spec.md section 2).

import { createBrowserAudio } from './audio/browser';
import { type LoadedLesson, loadLesson } from './audio/loader';
import { MicMonitor } from './mic/mic-monitor';
import { LessonSession } from './session';
import { DEFAULT_DEV_SETTINGS, type DevSettings } from './settings';

const LESSON_URL = `${import.meta.env.BASE_URL}lessons/lesson-01/`;

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

let lesson: LoadedLesson | undefined;
let session: LessonSession | undefined;
let settings: DevSettings = DEFAULT_DEV_SETTINGS;

function render(): void {
  const start = el<HTMLButtonElement>('start');
  const controls = el('controls');
  const state = session?.state;
  const running = state?.phase === 'running';
  start.hidden = running || state?.phase === 'starting';
  start.disabled = !lesson;
  start.textContent =
    state?.phase === 'finished' || state?.phase === 'failed'
      ? 'Start again'
      : 'Start';
  controls.hidden = !running;
  el('pause').textContent = state?.paused ? 'Resume' : 'Pause';

  let status = lesson ? 'Ready' : 'Loading the lesson…';
  let french = '';
  let english = '';
  if (state && lesson) {
    const item = lesson.manifest.items[state.lesson.index];
    switch (state.phase) {
      case 'starting':
        status = 'Stay quiet for a moment…';
        break;
      case 'running':
        status = describe(state.lesson.phase, state.paused, state.speaking);
        french = item.fr;
        if (state.lesson.phase === 'playingMeaning') english = item.en;
        if (state.lesson.phase === 'playingFinishedCue')
          english = lesson.manifest.finished_cue.en;
        el('progress').textContent =
          `${state.lesson.index + 1} / ${lesson.manifest.items.length}`;
        break;
      case 'finished':
        status = 'Lesson finished';
        break;
      case 'failed':
        status = `Problem: ${state.error}`;
        break;
    }
  }
  if (state?.phase !== 'running') el('progress').textContent = '';
  el('status').textContent = status;
  el('french').textContent = french;
  el('english').textContent = english;
}

function describe(phase: string, paused: boolean, speaking: boolean): string {
  if (paused) return 'Paused';
  switch (phase) {
    case 'playingFrench':
      return 'Listen';
    case 'waiting':
      return speaking ? 'Listening to you…' : 'Your turn: repeat it';
    case 'playingMeaning':
      return 'Meaning';
    case 'playingFinishedCue':
      return 'Done';
    default:
      return '';
  }
}

el('start').onclick = () => {
  if (!lesson) return;
  const loaded = lesson;
  log(`UA: ${navigator.userAgent}`);
  // Everything that needs a tap (the mic, the audio context) starts inside this click.
  session = new LessonSession({
    sentenceCount: loaded.manifest.items.length,
    clock: window,
    createAudio: (events) =>
      createBrowserAudio(loaded.clips, events, loaded.manifest.title),
    createMic: (events) => new MicMonitor(events),
    onChange: render,
    log,
  });
  session.applySettings(settings);
  void session.start();
};

el('pause').onclick = () => session?.togglePause();
el('repeat').onclick = () => session?.repeat();
el('next').onclick = () => session?.next();
el('stop').onclick = () => session?.stop();

document.addEventListener('visibilitychange', () =>
  log(`page ${document.visibilityState}`),
);

// Development mode only: the module is not part of the production build.
if (import.meta.env.DEV) {
  void import('./dev-settings').then(({ mountDevSettings }) =>
    mountDevSettings(
      el('app'),
      (next) => {
        settings = next;
        session?.applySettings(next);
      },
      log,
    ),
  );
}

render();
loadLesson(LESSON_URL).then(
  (loaded) => {
    lesson = loaded;
    log(`loaded ${loaded.manifest.items.length} sentences`);
    render();
  },
  (error) => {
    log(`FAILED to load the lesson: ${error}`);
    el('status').textContent = `Could not load the lesson: ${error}`;
  },
);
