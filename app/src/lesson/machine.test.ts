import { beforeEach, describe, expect, it } from 'vitest';
import { type Clock, type Effect, LessonMachine } from './machine';

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

const SENTENCES = 3;
let clock: FakeClock;
let effects: Effect[];
let machine: LessonMachine;

/** Id of the most recent play effect. */
function lastId(): number {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    if (e.type !== 'stop') return e.id;
  }
  throw new Error('no play effect yet');
}

function endClip(): void {
  machine.clipEnded(lastId());
}

function types(): string[] {
  return effects.map((e) =>
    e.type === 'stop' ? 'stop' : `${e.type}${'index' in e ? e.index : ''}`,
  );
}

beforeEach(() => {
  clock = new FakeClock();
  effects = [];
  machine = new LessonMachine(SENTENCES, clock, (e) => effects.push(e), {
    silenceMs: 3000,
    maxWaitMs: 15000,
  });
});

describe('start', () => {
  it('plays the first French sentence', () => {
    expect(machine.state).toEqual({ phase: 'idle', index: 0 });
    machine.start();
    expect(machine.state).toEqual({ phase: 'playingFrench', index: 0 });
    expect(types()).toEqual(['playFrench0']);
  });

  it('restarts from the first sentence while running', () => {
    machine.start();
    endClip();
    machine.next();
    machine.start();
    expect(machine.state).toEqual({ phase: 'playingFrench', index: 0 });
    expect(types().at(-1)).toBe('playFrench0');
  });
});

describe('waiting for the learner', () => {
  beforeEach(() => {
    machine.start();
    endClip();
  });

  it('waits after the French ends', () => {
    expect(machine.state.phase).toBe('waiting');
  });

  it('plays the meaning after the maximum wait if the learner never speaks', () => {
    clock.advance(14999);
    expect(machine.state.phase).toBe('waiting');
    clock.advance(1);
    expect(machine.state.phase).toBe('playingMeaning');
    expect(types().at(-1)).toBe('playMeaning0');
  });

  it('plays the meaning after the silence length once the learner stops speaking', () => {
    machine.speechStart();
    clock.advance(2000);
    machine.speechEnd();
    clock.advance(2999);
    expect(machine.state.phase).toBe('waiting');
    clock.advance(1);
    expect(machine.state.phase).toBe('playingMeaning');
  });

  it('restarts the silence wait on each new speech', () => {
    machine.speechStart();
    machine.speechEnd();
    clock.advance(2000);
    machine.speechStart();
    clock.advance(10000);
    machine.speechEnd();
    clock.advance(2999);
    expect(machine.state.phase).toBe('waiting');
    clock.advance(1);
    expect(machine.state.phase).toBe('playingMeaning');
  });

  it('does not use the 15 s never-spoke timer once the learner has spoken', () => {
    clock.advance(10000);
    machine.speechStart();
    machine.speechEnd();
    clock.advance(2999);
    expect(machine.state.phase).toBe('waiting');
  });

  it('ends the wait after one stretch of non-stop speech reaches the maximum', () => {
    machine.speechStart();
    clock.advance(14999);
    expect(machine.state.phase).toBe('waiting');
    clock.advance(1);
    expect(machine.state.phase).toBe('playingMeaning');
  });

  it('allows many repeats with pauses in between', () => {
    for (let i = 0; i < 5; i++) {
      machine.speechStart();
      clock.advance(2000);
      machine.speechEnd();
      clock.advance(1000);
    }
    expect(machine.state.phase).toBe('waiting');
  });

  it('applies updated settings from the next wait', () => {
    machine.speechStart();
    machine.speechEnd();
    machine.updateSettings({ silenceMs: 1000 });
    clock.advance(2999);
    expect(machine.state.phase).toBe('waiting');
    machine.repeat();
    endClip();
    machine.speechStart();
    machine.speechEnd();
    clock.advance(1000);
    expect(machine.state.phase).toBe('playingMeaning');
  });
});

describe('speech during the French clip', () => {
  it('is ignored while the French plays', () => {
    machine.start();
    machine.speechStart();
    machine.speechEnd();
    clock.advance(60000);
    expect(machine.state.phase).toBe('playingFrench');
  });

  it('counts as speech if the learner is still speaking when the French ends', () => {
    machine.start();
    machine.speechStart();
    endClip();
    clock.advance(14999);
    expect(machine.state.phase).toBe('waiting');
    machine.speechEnd();
    clock.advance(3000);
    expect(machine.state.phase).toBe('playingMeaning');
  });
});

describe('the meaning', () => {
  beforeEach(() => {
    machine.start();
    endClip();
    clock.advance(15000);
  });

  it('cannot be interrupted by speech, repeat or next', () => {
    expect(machine.state.phase).toBe('playingMeaning');
    const before = effects.length;
    machine.speechStart();
    machine.speechEnd();
    machine.repeat();
    machine.next();
    clock.advance(60000);
    expect(machine.state.phase).toBe('playingMeaning');
    expect(effects.length).toBe(before);
  });

  it('is followed by the next sentence', () => {
    endClip();
    expect(machine.state).toEqual({ phase: 'playingFrench', index: 1 });
    expect(types().at(-1)).toBe('playFrench1');
  });

  it('starts the next wait fresh', () => {
    endClip();
    endClip();
    expect(machine.state).toEqual({ phase: 'waiting', index: 1 });
    clock.advance(15000);
    expect(machine.state.phase).toBe('playingMeaning');
  });
});

describe('repeat', () => {
  it('replays the French while waiting, then the loop continues', () => {
    machine.start();
    endClip();
    machine.speechStart();
    machine.repeat();
    expect(machine.state).toEqual({ phase: 'playingFrench', index: 0 });
    expect(types().at(-1)).toBe('playFrench0');
    machine.speechEnd();
    clock.advance(60000);
    expect(machine.state.phase).toBe('playingFrench');
    endClip();
    expect(machine.state.phase).toBe('waiting');
    clock.advance(15000);
    expect(machine.state.phase).toBe('playingMeaning');
  });

  it('restarts the French while it plays', () => {
    machine.start();
    machine.repeat();
    expect(types()).toEqual(['playFrench0', 'playFrench0']);
  });

  it('ignores the old clip ending after a repeat', () => {
    machine.start();
    const oldId = lastId();
    machine.repeat();
    machine.clipEnded(oldId);
    expect(machine.state.phase).toBe('playingFrench');
  });

  it('cancels the pending wait', () => {
    machine.start();
    endClip();
    clock.advance(14000);
    machine.repeat();
    clock.advance(5000);
    expect(machine.state.phase).toBe('playingFrench');
  });
});

describe('next', () => {
  it('skips the meaning while waiting', () => {
    machine.start();
    endClip();
    machine.next();
    expect(machine.state).toEqual({ phase: 'playingFrench', index: 1 });
    expect(types()).toEqual(['playFrench0', 'playFrench1']);
  });

  it('skips to the next sentence while the French plays', () => {
    machine.start();
    machine.next();
    expect(machine.state).toEqual({ phase: 'playingFrench', index: 1 });
  });

  it('cancels the pending wait', () => {
    machine.start();
    endClip();
    machine.next();
    clock.advance(60000);
    expect(machine.state).toEqual({ phase: 'playingFrench', index: 1 });
  });

  it('on the last sentence plays the finished cue', () => {
    machine.start();
    machine.next();
    machine.next();
    machine.next();
    expect(machine.state.phase).toBe('playingFinishedCue');
    expect(types().at(-1)).toBe('playFinishedCue');
  });
});

describe('end of the lesson', () => {
  function playToTheLastMeaning(): void {
    machine.start();
    for (let i = 0; i < SENTENCES; i++) {
      endClip(); // French
      clock.advance(15000);
      if (i < SENTENCES - 1) endClip(); // meaning
    }
  }

  it('plays the finished cue after the last meaning', () => {
    playToTheLastMeaning();
    expect(machine.state).toEqual({ phase: 'playingMeaning', index: 2 });
    endClip();
    expect(machine.state.phase).toBe('playingFinishedCue');
    expect(types().at(-1)).toBe('playFinishedCue');
  });

  it('stops after the finished cue', () => {
    playToTheLastMeaning();
    endClip();
    endClip();
    expect(machine.state.phase).toBe('finished');
    expect(types().at(-1)).toBe('stop');
    const before = effects.length;
    machine.speechStart();
    machine.speechEnd();
    machine.repeat();
    machine.next();
    clock.advance(60000);
    expect(machine.state.phase).toBe('finished');
    expect(effects.length).toBe(before);
  });

  it('ignores speech, repeat and next during the finished cue', () => {
    machine.start();
    for (let i = 0; i < SENTENCES; i++) machine.next();
    const before = effects.length;
    machine.speechStart();
    machine.repeat();
    machine.next();
    expect(machine.state.phase).toBe('playingFinishedCue');
    expect(effects.length).toBe(before);
  });

  it('can start again after finishing', () => {
    machine.start();
    for (let i = 0; i < SENTENCES; i++) machine.next();
    endClip();
    expect(machine.state.phase).toBe('finished');
    machine.start();
    expect(machine.state).toEqual({ phase: 'playingFrench', index: 0 });
  });
});

describe('pause', () => {
  beforeEach(() => {
    machine.start();
    endClip(); // waiting
  });

  it('stops the max wait from running out', () => {
    clock.advance(10000);
    machine.pause();
    clock.advance(60000);
    expect(types()).toEqual(['playFrench0']);
    expect(machine.state.phase).toBe('waiting');
  });

  it('stops the silence timer', () => {
    machine.speechStart();
    machine.speechEnd();
    clock.advance(2000);
    machine.pause();
    clock.advance(60000);
    expect(types()).toEqual(['playFrench0']);
  });

  it('gives a full new wait on resume', () => {
    clock.advance(10000);
    machine.pause();
    machine.resume();
    clock.advance(14999);
    expect(types()).toEqual(['playFrench0']);
    clock.advance(1);
    expect(types()).toEqual(['playFrench0', 'playMeaning0']);
  });

  it('ignores speech starting and ending while paused, then waits full on resume', () => {
    machine.pause();
    machine.speechStart();
    machine.speechEnd();
    clock.advance(60000);
    expect(types()).toEqual(['playFrench0']);
    machine.resume();
    clock.advance(14999);
    expect(types()).toEqual(['playFrench0']);
    clock.advance(1);
    expect(types()).toEqual(['playFrench0', 'playMeaning0']);
  });

  it('on resume while the learner speaks, waits for the speech to end', () => {
    machine.pause();
    machine.speechStart();
    machine.resume();
    clock.advance(14999);
    expect(types()).toEqual(['playFrench0']);
    machine.speechEnd();
    clock.advance(3000);
    expect(types()).toEqual(['playFrench0', 'playMeaning0']);
  });

  it('starts no wait when the French ends while paused, until resume', () => {
    machine.repeat(); // playing French again
    machine.pause();
    endClip();
    expect(machine.state.phase).toBe('waiting');
    clock.advance(60000);
    expect(types()).toEqual(['playFrench0', 'playFrench0']);
    machine.resume();
    clock.advance(15000);
    expect(types()).toEqual(['playFrench0', 'playFrench0', 'playMeaning0']);
  });

  it('ignores pause and resume called twice', () => {
    machine.pause();
    machine.pause();
    machine.resume();
    machine.resume();
    clock.advance(15000);
    expect(types()).toEqual(['playFrench0', 'playMeaning0']);
  });
});

describe('halt', () => {
  it('cancels a pending wait and ignores later events', () => {
    machine.start();
    endClip(); // waiting
    machine.halt();
    clock.advance(60000);
    machine.speechStart();
    machine.speechEnd();
    clock.advance(60000);
    machine.repeat();
    machine.next();
    expect(types()).toEqual(['playFrench0']);
    expect(machine.state.phase).toBe('finished');
  });
});

describe('before start', () => {
  it('ignores everything', () => {
    machine.speechStart();
    machine.speechEnd();
    machine.repeat();
    machine.next();
    machine.clipEnded(1);
    clock.advance(60000);
    expect(machine.state.phase).toBe('idle');
    expect(effects).toEqual([]);
  });
});
