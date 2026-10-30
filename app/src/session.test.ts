import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerEvents } from './audio/player';
import type { Clock, Effect } from './lesson/machine';
import type { MicEvents } from './mic/mic-monitor';
import { DEFAULT_DEV_SETTINGS } from './settings';
import { LessonSession, type SessionAudio, type SessionMic } from './session';

class FakeClock implements Clock {
  private time = 0;
  private nextHandle = 1;
  private timers = new Map<number, { at: number; callback: () => void }>();
  setTimeout(callback: () => void, ms: number): number {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.time + ms, callback });
    return handle;
  }
  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].callback();
    }
    this.time = target;
  }
}

let clock: FakeClock;
let calls: string[];
let audioEvents: PlayerEvents;
let micEvents: MicEvents;
let applied: Effect[];
let meaningRate: number | undefined;
let detectorSettings: object | undefined;
let micOpenError: Error | undefined;
let changes: number;
let session: LessonSession;

function lastId(): number {
  for (let i = applied.length - 1; i >= 0; i--) {
    const e = applied[i];
    if (e.type !== 'stop') return e.id;
  }
  throw new Error('no play effect');
}

const calibration = {
  noise: 0.001,
  startThreshold: 0.003,
  endThreshold: 0.002,
};

/** Starts the session and lets the mic report its calibration. */
async function startRunning(): Promise<void> {
  const started = session.start();
  await Promise.resolve();
  micEvents.calibrated(calibration);
  await started;
}

beforeEach(() => {
  clock = new FakeClock();
  calls = [];
  applied = [];
  micOpenError = undefined;
  changes = 0;
  const audio: SessionAudio = {
    start: async () => void calls.push('audio.start'),
    apply: (e) => {
      calls.push(`audio.apply ${e.type}`);
      applied.push(e);
    },
    pause: () => {
      calls.push('audio.pause');
      audioEvents.pausedChange(true);
    },
    resume: () => {
      calls.push('audio.resume');
      audioEvents.pausedChange(false);
    },
    dispose: () => void calls.push('audio.dispose'),
    setMeaningRate: (rate) => void (meaningRate = rate),
  };
  const mic: SessionMic = {
    open: async () => {
      calls.push('mic.open');
      if (micOpenError) throw micOpenError;
    },
    close: () => void calls.push('mic.close'),
    updateSettings: (s) => void (detectorSettings = s),
  };
  session = new LessonSession({
    sentenceCount: 2,
    clock,
    createAudio: (events) => ((audioEvents = events), audio),
    createMic: (events) => ((micEvents = events), mic),
    onChange: () => void changes++,
    log: () => undefined,
    settings: { silenceMs: 3000, maxWaitMs: 15000 },
  });
});

describe('start', () => {
  it('opens the mic, waits for the calibration, then starts audio and lesson', async () => {
    const started = session.start();
    await Promise.resolve();
    expect(session.state.phase).toBe('starting');
    expect(calls).toEqual(['mic.open']);
    micEvents.calibrated(calibration);
    await started;
    expect(calls).toEqual([
      'mic.open',
      'audio.start',
      'audio.apply playTarget',
    ]);
    expect(session.state.phase).toBe('running');
  });

  it('fails when the mic cannot be opened, without starting audio', async () => {
    micOpenError = new Error('Permission denied');
    await session.start();
    expect(session.state).toMatchObject({
      phase: 'failed',
      error: 'Permission denied',
    });
    expect(calls).toEqual(['mic.open', 'audio.dispose', 'mic.close']);
  });

  it('fails when the mic gives no level', async () => {
    const started = session.start();
    await Promise.resolve();
    clock.advance(10000);
    await started;
    expect(session.state.phase).toBe('failed');
    expect(session.state.error).toMatch(/no sound level/);
    expect(calls).not.toContain('audio.start');
  });

  it('ignores a second start', async () => {
    await startRunning();
    await session.start();
    expect(calls.filter((c) => c === 'mic.open')).toHaveLength(1);
  });
});

describe('the loop', () => {
  beforeEach(startRunning);

  it('waits after the target and plays the meaning when the learner has spoken', () => {
    audioEvents.clipEnded(lastId());
    expect(session.state.lesson.phase).toBe('waiting');
    micEvents.speechStart();
    expect(session.state.speaking).toBe(true);
    micEvents.speechEnd();
    clock.advance(3000);
    expect(applied.at(-1)).toMatchObject({ type: 'playMeaning', index: 0 });
  });

  it('plays the meaning after the max wait when the learner is silent', () => {
    audioEvents.clipEnded(lastId());
    clock.advance(15000);
    expect(applied.at(-1)).toMatchObject({ type: 'playMeaning' });
  });

  it('goes through both sentences, plays the cue and releases everything', () => {
    for (let i = 0; i < 2; i++) {
      audioEvents.clipEnded(lastId()); // target
      clock.advance(15000);
      audioEvents.clipEnded(lastId()); // meaning
    }
    expect(applied.at(-1)).toMatchObject({ type: 'playFinishedCue' });
    expect(session.state.phase).toBe('running');
    audioEvents.clipEnded(lastId());
    expect(session.state.phase).toBe('finished');
    expect(calls.slice(-3)).toEqual([
      'audio.apply stop',
      'audio.dispose',
      'mic.close',
    ]);
  });

  it('headphone buttons repeat and skip', () => {
    audioEvents.repeat();
    expect(applied.at(-1)).toMatchObject({ type: 'playTarget', index: 0 });
    audioEvents.next();
    expect(applied.at(-1)).toMatchObject({ type: 'playTarget', index: 1 });
  });

  it('pausing freezes the wait; resuming gives a full new wait', () => {
    audioEvents.clipEnded(lastId());
    clock.advance(10000);
    session.togglePause();
    expect(session.state.paused).toBe(true);
    clock.advance(60000);
    expect(applied.at(-1)).toMatchObject({ type: 'playTarget' });
    session.togglePause();
    expect(session.state.paused).toBe(false);
    clock.advance(14999);
    expect(applied.at(-1)).toMatchObject({ type: 'playTarget' });
    clock.advance(1);
    expect(applied.at(-1)).toMatchObject({ type: 'playMeaning' });
  });

  it('a pause from the headphones or lock screen freezes the wait too', () => {
    audioEvents.clipEnded(lastId());
    audioEvents.pausedChange(true);
    clock.advance(60000);
    expect(applied.at(-1)).toMatchObject({ type: 'playTarget' });
  });

  it('after stop, a pending wait does not play anything', () => {
    audioEvents.clipEnded(lastId()); // waiting, timer pending
    session.stop();
    const count = applied.length;
    clock.advance(60000);
    expect(applied).toHaveLength(count);
  });

  it('stop ends the lesson early and releases the mic', () => {
    session.stop();
    expect(session.state.phase).toBe('finished');
    expect(calls.slice(-2)).toEqual(['audio.dispose', 'mic.close']);
    session.stop();
    expect(calls.filter((c) => c === 'mic.close')).toHaveLength(1);
  });

  it('tells the screen when a timer starts the meaning', () => {
    audioEvents.clipEnded(lastId());
    const before = changes;
    clock.advance(15000);
    expect(applied.at(-1)).toMatchObject({ type: 'playMeaning' });
    expect(changes).toBeGreaterThan(before);
  });

  it('tells the screen about each change', () => {
    const before = changes;
    audioEvents.clipEnded(lastId());
    micEvents.speechStart();
    expect(changes).toBe(before + 2);
  });
});

describe('applySettings', () => {
  const settings = {
    ...DEFAULT_DEV_SETTINGS,
    silenceMs: 1000,
    maxWaitMs: 5000,
    startRatio: 4,
    meaningRate: 0.8,
  };

  it('passes the detector settings to the mic and the speed to the audio', () => {
    session.applySettings(settings);
    expect(meaningRate).toBe(0.8);
    expect(detectorSettings).toMatchObject({ startRatio: 4, minLevel: 0.003 });
    expect(detectorSettings).not.toHaveProperty('silenceMs');
    expect(detectorSettings).not.toHaveProperty('meaningRate');
  });

  it('changes the wait times of the loop', async () => {
    await startRunning();
    session.applySettings(settings);
    audioEvents.clipEnded(lastId());
    clock.advance(4999);
    expect(applied.at(-1)).toMatchObject({ type: 'playTarget' });
    clock.advance(1);
    expect(applied.at(-1)).toMatchObject({ type: 'playMeaning' });
  });

  it('changes the silence length', async () => {
    await startRunning();
    session.applySettings(settings);
    audioEvents.clipEnded(lastId());
    micEvents.speechStart();
    micEvents.speechEnd();
    clock.advance(1000);
    expect(applied.at(-1)).toMatchObject({ type: 'playMeaning' });
  });
});

describe('stopping while starting', () => {
  it('does not start the lesson afterwards', async () => {
    const started = session.start();
    await Promise.resolve();
    session.stop();
    micEvents.calibrated(calibration);
    await started;
    expect(session.state.phase).toBe('finished');
    expect(applied).toEqual([]);
  });
});

describe('before the lesson runs', () => {
  it('ignores buttons', () => {
    session.togglePause();
    session.repeat();
    session.next();
    expect(calls).toEqual([]);
  });
});
