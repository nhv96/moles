import { describe, expect, it } from 'vitest';
import type { Clock } from '../lesson/machine';
import type { MicEvents } from './mic-monitor';
import { SharedMic, type SharedMonitor } from './shared-mic';

const calibration = {
  noise: 0.001,
  startThreshold: 0.003,
  endThreshold: 0.002,
};

class FakeMonitor implements SharedMonitor {
  opens = 0;
  ready = false;
  calibration: typeof calibration | undefined;
  settings: object[] = [];
  constructor(readonly events: MicEvents) {}
  async open(): Promise<void> {
    this.opens++;
    this.ready = true;
    this.calibration = calibration;
    this.events.calibrated(calibration);
  }
  closed = 0;
  close(): void {
    this.closed++;
    this.ready = false;
  }
  updateSettings(settings: object): void {
    this.settings.push(settings);
  }
}

function lessonEvents(): MicEvents & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    speechStart: () => void calls.push('speechStart'),
    speechEnd: () => void calls.push('speechEnd'),
    calibrated: () => void calls.push('calibrated'),
    log: () => undefined,
  };
}

class FakeClock implements Clock {
  private timers = new Map<number, { at: number; callback: () => void }>();
  private time = 0;
  private next = 1;
  setTimeout(callback: () => void, ms: number): number {
    this.timers.set(this.next, { at: this.time + ms, callback });
    return this.next++;
  }
  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  advance(ms: number): void {
    this.time += ms;
    for (const [handle, t] of [...this.timers]) {
      if (t.at > this.time) continue;
      this.timers.delete(handle);
      t.callback();
    }
  }
}

const IDLE_MS = 1000;

function setup() {
  const clock = new FakeClock();
  let monitor!: FakeMonitor;
  const shared = new SharedMic(
    (events) => (monitor = new FakeMonitor(events)),
    clock,
    IDLE_MS,
  );
  return { shared, clock, monitor: () => monitor };
}

describe('SharedMic', () => {
  it('opens and calibrates the mic for the first lesson', async () => {
    const { shared, monitor } = setup();
    const events = lessonEvents();
    await shared.attach(events).open();
    expect(monitor().opens).toBe(1);
    expect(events.calls).toEqual(['calibrated']);
  });

  it('reuses the open mic and calibration for the next lesson', async () => {
    const { shared, monitor } = setup();
    const first = shared.attach(lessonEvents());
    await first.open();
    first.close();
    const events = lessonEvents();
    await shared.attach(events).open();
    expect(monitor().opens).toBe(1);
    expect(events.calls).toEqual(['calibrated']);
  });

  it('opens and calibrates again when the mic is no longer live', async () => {
    const { shared, monitor } = setup();
    const first = shared.attach(lessonEvents());
    await first.open();
    first.close();
    monitor().ready = false;
    await shared.attach(lessonEvents()).open();
    expect(monitor().opens).toBe(2);
  });

  it('sends speech events to the attached lesson only', async () => {
    const { shared, monitor } = setup();
    const first = lessonEvents();
    const firstMic = shared.attach(first);
    await firstMic.open();
    monitor().events.speechStart();
    firstMic.close();
    monitor().events.speechEnd();
    expect(first.calls).toEqual(['calibrated', 'speechStart']);
    const second = lessonEvents();
    await shared.attach(second).open();
    monitor().events.speechEnd();
    expect(second.calls).toEqual(['calibrated', 'speechEnd']);
  });

  it('keeps settings applied before open()', () => {
    const { shared, monitor } = setup();
    shared.attach(lessonEvents()).updateSettings({ startRatio: 4 });
    expect(monitor().settings).toEqual([{ startRatio: 4 }]);
  });

  it('closes the mic after the idle time, and the next lesson opens it again', async () => {
    const { shared, clock, monitor } = setup();
    const first = shared.attach(lessonEvents());
    await first.open();
    first.close();
    clock.advance(IDLE_MS - 1);
    expect(monitor().closed).toBe(0);
    clock.advance(1);
    expect(monitor().closed).toBe(1);
    await shared.attach(lessonEvents()).open();
    expect(monitor().opens).toBe(2);
  });

  it('does not close the mic when the next lesson comes in time', async () => {
    const { shared, clock, monitor } = setup();
    const first = shared.attach(lessonEvents());
    await first.open();
    first.close();
    clock.advance(IDLE_MS - 1);
    await shared.attach(lessonEvents()).open();
    clock.advance(IDLE_MS * 2);
    expect(monitor().closed).toBe(0);
  });

  it('does not close the mic while a lesson uses it', async () => {
    const { shared, clock, monitor } = setup();
    await shared.attach(lessonEvents()).open();
    clock.advance(IDLE_MS * 10);
    expect(monitor().closed).toBe(0);
  });
});
