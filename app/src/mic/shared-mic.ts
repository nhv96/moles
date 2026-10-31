// One microphone for the whole page, shared by the lessons one after another.
//
// Opening the mic makes iOS switch the headphones to the headset route, and
// the volume then rises slowly from zero. A new mic per lesson meant that
// rise at every lesson. Here the mic opens at the first lesson and stays open
// when a lesson ends; the next lesson attaches to it and reuses the noise
// calibration (no reopening, no new calibration).
//
// The mic is closed after `idleMs` without a lesson, so it does not stay on
// all day. The next lesson then opens and calibrates it again.
//
// If the mic is no longer live (the stream ended, the audio context was
// suspended), the next lesson opens and calibrates it again.

import type { Clock } from '../lesson/machine';
import type { SessionMic } from '../session';
import type { MicEvents } from './mic-monitor';
import type { Calibration, DetectorSettings } from './speech-detector';

/** The parts of MicMonitor that are used, so tests can use a fake. */
export interface SharedMonitor {
  open(): Promise<void>;
  close(): void;
  updateSettings(settings: Partial<DetectorSettings>): void;
  readonly ready: boolean;
  readonly calibration: Calibration | undefined;
}

export const DEFAULT_IDLE_MS = 3 * 60 * 1000;

export class SharedMic {
  private monitor: SharedMonitor | undefined;
  private current: MicEvents | undefined;
  private idleTimer: unknown;

  /** `createMonitor` gets events that go to the lesson attached at the time. */
  constructor(
    private readonly createMonitor: (events: MicEvents) => SharedMonitor,
    private readonly clock: Clock = window,
    private readonly idleMs: number = DEFAULT_IDLE_MS,
  ) {}

  /** The mic for one lesson. Its close() detaches the lesson; the mic stays open. */
  attach(events: MicEvents): SessionMic {
    // Made here, not in open(), so settings applied before open() are kept.
    const monitor = (this.monitor ??= this.createMonitor(this.route()));
    this.cancelIdle();
    return {
      open: async () => {
        this.current = events;
        this.cancelIdle();
        const calibration = monitor.calibration;
        if (monitor.ready && calibration) {
          events.log('mic still open: reusing the noise calibration');
          events.calibrated(calibration);
          return;
        }
        await monitor.open();
      },
      close: () => {
        if (this.current !== events) return;
        this.current = undefined;
        this.cancelIdle();
        this.idleTimer = this.clock.setTimeout(() => {
          this.idleTimer = undefined;
          monitor.close();
          events.log('mic closed: no lesson for a while');
        }, this.idleMs);
      },
      updateSettings: (settings) => monitor.updateSettings(settings),
    };
  }

  private cancelIdle(): void {
    if (this.idleTimer === undefined) return;
    this.clock.clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  /** Events for the monitor: forward to the attached lesson, if any. */
  private route(): MicEvents {
    return {
      speechStart: () => this.current?.speechStart(),
      speechEnd: () => this.current?.speechEnd(),
      calibrated: (c) => this.current?.calibrated(c),
      level: (timeMs, level) => this.current?.level?.(timeMs, level),
      log: (message) => this.current?.log(message),
    };
  }
}
