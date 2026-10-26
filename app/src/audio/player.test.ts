import { beforeEach, describe, expect, it } from 'vitest';
import type { ClipSet } from './loader';
import {
  LessonAudio,
  type MediaElement,
  type MediaSessionLike,
  type PlayerEvents,
  type Ticker,
} from './player';

class FakeAudio implements MediaElement {
  src = '';
  loop = false;
  currentTime = 0;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  duration = Number.NaN;
  paused = true;
  readyState = 4;
  playCalls = 0;
  private endedListeners: Array<() => void> = [];

  play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(type: string, listener: () => void): void {
    if (type === 'ended') this.endedListeners.push(listener);
  }
  fireEnded(): void {
    this.endedListeners.forEach((l) => l());
  }
}

class FakeTicker implements Ticker {
  time = 0;
  private callback: (() => void) | undefined;
  now = () => this.time;
  setInterval(callback: () => void): number {
    this.callback = callback;
    return 1;
  }
  clearInterval(): void {
    this.callback = undefined;
  }
  /** Moves the time forward in poll-sized steps, running the poll each step. */
  advance(ms: number, step = 500): void {
    for (let t = 0; t < ms; t += step) {
      this.time += step;
      this.callback?.();
    }
  }
}

const clips: ClipSet = {
  frenchUrl: (i) => `fr${i}`,
  meaningUrl: (i) => `en${i}`,
  finishedCueUrl: () => 'end',
};

let elements: FakeAudio[];
let ticker: FakeTicker;
let handlers: Map<string, (() => void) | null>;
let calls: string[];
let audio: LessonAudio;

function clipEl(): FakeAudio {
  return elements[0];
}
function silentEl(): FakeAudio {
  return elements[1];
}
function press(action: string): void {
  handlers.get(action)?.();
}

beforeEach(() => {
  elements = [];
  ticker = new FakeTicker();
  handlers = new Map();
  calls = [];
  const events: PlayerEvents = {
    clipEnded: (id) => calls.push(`ended:${id}`),
    repeat: () => calls.push('repeat'),
    next: () => calls.push('next'),
    pausedChange: (p) => calls.push(p ? 'paused' : 'resumed'),
    log: () => {},
  };
  const mediaSession: MediaSessionLike = {
    setActionHandler: (action, handler) => handlers.set(action, handler),
  };
  audio = new LessonAudio(clips, events, {
    createAudio: () => {
      const el = new FakeAudio();
      elements.push(el);
      return el;
    },
    ticker,
    mediaSession,
    silentUrl: 'silent',
  });
});

describe('start', () => {
  it('plays the silent track in a loop and registers the buttons', async () => {
    await audio.start();
    expect(silentEl().src).toBe('silent');
    expect(silentEl().loop).toBe(true);
    expect(silentEl().paused).toBe(false);
    expect([...handlers.keys()].sort()).toEqual([
      'nexttrack',
      'pause',
      'play',
      'previoustrack',
    ]);
  });
});

describe('playing clips', () => {
  beforeEach(async () => {
    await audio.start();
  });

  it('plays the French, the meaning and the finished cue', () => {
    audio.apply({ type: 'playFrench', index: 2, id: 1 });
    expect(clipEl().src).toBe('fr2');
    expect(clipEl().paused).toBe(false);
    audio.apply({ type: 'playMeaning', index: 2, id: 2 });
    expect(clipEl().src).toBe('en2');
    audio.apply({ type: 'playFinishedCue', id: 3 });
    expect(clipEl().src).toBe('end');
  });

  it('reports the end of the current clip once', () => {
    audio.apply({ type: 'playFrench', index: 0, id: 7 });
    clipEl().fireEnded();
    clipEl().fireEnded();
    expect(calls).toEqual(['ended:7']);
  });

  it('does not report the end of a clip that was replaced and stopped', () => {
    audio.apply({ type: 'playFrench', index: 0, id: 1 });
    audio.apply({ type: 'stop' });
    clipEl().fireEnded();
    expect(calls).toEqual([]);
    expect(clipEl().paused).toBe(true);
  });

  it('keeps the silent track playing after a clip ends', () => {
    audio.apply({ type: 'playFrench', index: 0, id: 1 });
    clipEl().fireEnded();
    expect(silentEl().paused).toBe(false);
  });
});

describe('meaning speed', () => {
  beforeEach(async () => {
    await audio.start();
    audio.setMeaningRate(0.8);
  });

  it('slows only the meaning', () => {
    audio.apply({ type: 'playFrench', index: 0, id: 1 });
    expect(clipEl().playbackRate).toBe(1);
    audio.apply({ type: 'playMeaning', index: 0, id: 2 });
    expect(clipEl().playbackRate).toBe(0.8);
    expect(clipEl().defaultPlaybackRate).toBe(0.8);
    audio.apply({ type: 'playFrench', index: 1, id: 3 });
    expect(clipEl().playbackRate).toBe(1);
    audio.apply({ type: 'playFinishedCue', id: 4 });
    expect(clipEl().playbackRate).toBe(1);
  });

  it('changes at once while a meaning plays, and not while French plays', () => {
    audio.apply({ type: 'playMeaning', index: 0, id: 1 });
    audio.setMeaningRate(1.2);
    expect(clipEl().playbackRate).toBe(1.2);
    audio.apply({ type: 'playFrench', index: 0, id: 2 });
    audio.setMeaningRate(0.9);
    expect(clipEl().playbackRate).toBe(1);
  });
});

describe('headphone buttons', () => {
  beforeEach(async () => {
    await audio.start();
    audio.apply({ type: 'playFrench', index: 0, id: 1 });
  });

  it('maps previous to repeat and next to next', () => {
    press('previoustrack');
    press('nexttrack');
    expect(calls).toEqual(['repeat', 'next']);
  });

  it('treats pause as a toggle that never stops the silent track', () => {
    press('pause');
    expect(audio.paused).toBe(true);
    expect(clipEl().paused).toBe(true);
    expect(silentEl().paused).toBe(false);
    press('pause');
    expect(audio.paused).toBe(false);
    expect(clipEl().paused).toBe(false);
    expect(calls).toEqual(['paused', 'resumed']);
  });

  it('resumes on play and ignores play when not paused', () => {
    press('play');
    expect(calls).toEqual([]);
    press('pause');
    press('play');
    expect(calls).toEqual(['paused', 'resumed']);
  });

  it('holds a new clip until resumed while paused', () => {
    press('pause');
    audio.apply({ type: 'playMeaning', index: 0, id: 2 });
    expect(clipEl().src).toBe('en0');
    expect(clipEl().paused).toBe(true);
    press('pause');
    expect(clipEl().paused).toBe(false);
  });
});

describe('watchdog', () => {
  beforeEach(async () => {
    await audio.start();
    clipEl().duration = 3;
    audio.apply({ type: 'playFrench', index: 0, id: 1 });
  });

  it('leaves a clip alone while its time moves', () => {
    const plays = clipEl().playCalls;
    for (let i = 0; i < 4; i++) {
      clipEl().currentTime += 0.5;
      ticker.advance(500);
    }
    expect(clipEl().playCalls).toBe(plays);
  });

  it('resumes a clip whose time stops, then reloads it if still stuck', () => {
    clipEl().currentTime = 1.2;
    const plays = clipEl().playCalls;
    ticker.advance(2500);
    expect(clipEl().playCalls).toBe(plays + 1);
    expect(clipEl().currentTime).toBe(1.2);
    ticker.advance(2000);
    expect(clipEl().playCalls).toBe(plays + 2);
    expect(clipEl().currentTime).toBe(0);
    expect(clipEl().src).toBe('fr0');
  });

  it('counts a clip stuck at its very end as ended', () => {
    clipEl().currentTime = 3;
    ticker.advance(2500);
    expect(calls).toEqual(['ended:1']);
  });

  it('does not run on a user-paused clip', () => {
    press('pause');
    const plays = clipEl().playCalls;
    ticker.advance(10000);
    expect(clipEl().playCalls).toBe(plays);
    expect(calls).toEqual(['paused']);
  });

  it('leaves a silent track alone when its time reads zero but it is playing', () => {
    const plays = silentEl().playCalls;
    ticker.advance(10000);
    expect(silentEl().playCalls).toBe(plays);
  });

  it('restarts a silent track that got paused', () => {
    const plays = silentEl().playCalls;
    silentEl().pause();
    ticker.advance(500);
    expect(silentEl().playCalls).toBe(plays + 1);
    expect(silentEl().paused).toBe(false);
  });
});

describe('dispose', () => {
  it('ignores clips that are applied afterwards', async () => {
    await audio.start();
    audio.dispose();
    const plays = clipEl().playCalls;
    audio.apply({ type: 'playMeaning', index: 0, id: 1 });
    expect(clipEl().playCalls).toBe(plays);
  });

  it('stops everything and removes the button handlers', async () => {
    await audio.start();
    audio.dispose();
    expect(silentEl().paused).toBe(true);
    expect(handlers.get('pause')).toBeNull();
  });
});
