// The lesson screen: reads the index, lets the learner pick a pair and a lesson, loads it,
// then runs it on a tap (docs/app-spec.md section 2).

import { createBrowserAudio } from './audio/browser';
import type { BuildIndex } from './audio/index';
import { type LoadedLesson, loadIndex, loadLesson } from './audio/loader';
import { MicMonitor } from './mic/mic-monitor';
import { LessonSession } from './session';
import {
  type Choice,
  type PairGroup,
  describeLesson,
  groupByPair,
  initialChoice,
  parseSavedChoice,
} from './picker';
import { DEFAULT_DEV_SETTINGS, type DevSettings } from './settings';

const LESSONS_URL = `${import.meta.env.BASE_URL}lessons/`;
const CHOICE_KEY = 'morning-lesson.choice';

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
let index: BuildIndex | undefined;
let groups: PairGroup[] = [];
let choice: Choice | undefined;
let loadError: string | undefined;
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

  el('picker').hidden =
    groups.length === 0 || running || state?.phase === 'starting';

  let status = lesson ? 'Ready' : 'Loading the lesson…';
  if (loadError) status = loadError;
  else if (index && groups.length === 0) status = 'No lessons yet';
  let target = '';
  let meaning = '';
  if (state && lesson) {
    const item = lesson.manifest.items[state.lesson.index];
    switch (state.phase) {
      case 'starting':
        status = 'Stay quiet for a moment…';
        break;
      case 'running':
        status = describe(state.lesson.phase, state.paused, state.speaking);
        target = item.target;
        if (state.lesson.phase === 'playingMeaning') meaning = item.meaning;
        if (state.lesson.phase === 'playingFinishedCue')
          meaning = lesson.manifest.end_cue.text;
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
  el('target').textContent = target;
  el('meaning').textContent = meaning;
}

function describe(phase: string, paused: boolean, speaking: boolean): string {
  if (paused) return 'Paused';
  switch (phase) {
    case 'playingTarget':
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

function saveChoice(next: Choice): void {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(next));
  } catch {
    // storage can be blocked; the choice is then simply not remembered
  }
}

function readSavedChoice(): Choice | undefined {
  try {
    return parseSavedChoice(localStorage.getItem(CHOICE_KEY));
  } catch {
    return undefined;
  }
}

/** Draws the pair dropdown and the lesson buttons of the chosen pair. */
function renderPicker(): void {
  const pairSelect = el<HTMLSelectElement>('pair');
  pairSelect.replaceChildren(
    ...groups.map((group) => {
      const option = document.createElement('option');
      option.value = group.pair;
      option.textContent = group.label;
      return option;
    }),
  );
  pairSelect.value = choice?.pair ?? '';

  const group = groups.find((g) => g.pair === choice?.pair);
  el('lessons').replaceChildren(
    ...(group?.lessons ?? []).map((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute(
        'aria-checked',
        String(entry.lesson === choice?.lesson),
      );
      button.textContent = entry.title;
      const detail = document.createElement('small');
      detail.textContent = describeLesson(entry);
      button.append(detail);
      button.onclick = () => select({ pair: entry.pair, lesson: entry.lesson });
      return button;
    }),
  );
}

let selectionId = 0;

/** Makes a lesson the chosen one and downloads it. Only the latest selection may finish. */
function select(next: Choice): void {
  const entry = index?.lessons.find(
    (l) => l.pair === next.pair && l.lesson === next.lesson,
  );
  if (!entry) return;
  const mine = ++selectionId;
  choice = next;
  saveChoice(next);
  session = undefined; // the picker is only visible when no lesson is running
  lesson = undefined;
  loadError = undefined;
  renderPicker();
  render();
  loadLesson(LESSONS_URL, entry.manifest).then(
    (loaded) => {
      if (mine !== selectionId) return;
      lesson = loaded;
      log(
        `loaded ${next.pair}/${next.lesson}: ${loaded.manifest.items.length} sentences`,
      );
      render();
    },
    (error) => {
      if (mine !== selectionId) return;
      log(`FAILED to load the lesson: ${error}`);
      loadError = `Could not load the lesson: ${error}`;
      render();
    },
  );
}

el<HTMLSelectElement>('pair').onchange = (event) => {
  const pair = (event.target as HTMLSelectElement).value;
  const first = groups.find((g) => g.pair === pair)?.lessons[0];
  if (first) select({ pair, lesson: first.lesson });
};

render();
loadIndex(LESSONS_URL).then(
  (loaded) => {
    index = loaded;
    groups = groupByPair(loaded.lessons);
    log(`index lists ${loaded.lessons.length} lesson(s)`);
    const first = initialChoice(groups, readSavedChoice());
    if (first) select(first);
    else render();
  },
  (error) => {
    log(`FAILED to load the index: ${error}`);
    loadError = `Could not load the lessons: ${error}`;
    render();
  },
);
