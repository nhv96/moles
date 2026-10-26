// Runs one lesson: connects the state machine, the audio module and the mic.
// The browser parts are passed in, so the order of steps and the wiring can be
// tested with fakes.
//
// Start order (docs/app-spec.md section 4, "mic first"):
//   tap -> mic open -> noise calibration (about 2.5 s) -> audio start -> lesson start

import type { PlayerEvents } from './audio/player';
import {
  type Clock,
  type Effect,
  LessonMachine,
  type LessonState,
  type Settings,
} from './lesson/machine';
import type { MicEvents } from './mic/mic-monitor';

export interface SessionAudio {
  start(): Promise<void>;
  apply(effect: Effect): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

export interface SessionMic {
  open(): Promise<void>;
  close(): void;
}

export interface SessionDeps {
  sentenceCount: number;
  clock: Clock;
  /** Gets the events the audio module reports (clip ended, buttons, pause). */
  createAudio(events: PlayerEvents): SessionAudio;
  /** Gets the events the mic reports (speech start and end, calibrated). */
  createMic(events: MicEvents): SessionMic;
  /** Something the screen shows has changed. */
  onChange(): void;
  log(message: string): void;
  settings?: Settings;
  /** Longest wait for the first sound level after the mic opens. */
  calibrationTimeoutMs?: number;
}

export type SessionPhase =
  'idle' | 'starting' | 'running' | 'finished' | 'failed';

export interface SessionState {
  phase: SessionPhase;
  lesson: LessonState;
  paused: boolean;
  speaking: boolean;
  error?: string;
}

export class LessonSession {
  private readonly machine: LessonMachine;
  private readonly audio: SessionAudio;
  private readonly mic: SessionMic;
  private phase: SessionPhase = 'idle';
  private paused = false;
  private speaking = false;
  private error: string | undefined;
  private calibrated: (() => void) | undefined;

  constructor(private readonly deps: SessionDeps) {
    this.machine = new LessonMachine(
      deps.sentenceCount,
      deps.clock,
      (effect) => this.onEffect(effect),
      deps.settings,
    );
    this.audio = deps.createAudio({
      clipEnded: (id) => {
        this.machine.clipEnded(id);
        this.deps.onChange();
      },
      repeat: () => this.repeat(),
      next: () => this.next(),
      pausedChange: (paused) => this.onPausedChange(paused),
      log: deps.log,
    });
    this.mic = deps.createMic({
      speechStart: () => {
        this.speaking = true;
        this.machine.speechStart();
        this.deps.onChange();
      },
      speechEnd: () => {
        this.speaking = false;
        this.machine.speechEnd();
        this.deps.onChange();
      },
      calibrated: (c) => {
        deps.log(
          `calibrated: noise ${c.noise.toFixed(4)}, start ${c.startThreshold.toFixed(4)}, end ${c.endThreshold.toFixed(4)}`,
        );
        this.calibrated?.();
      },
      log: deps.log,
    });
  }

  get state(): SessionState {
    return {
      phase: this.phase,
      lesson: this.machine.state,
      paused: this.paused,
      speaking: this.speaking,
      error: this.error,
    };
  }

  /** Call from a tap. A failure leaves the session `failed`; make a new one to retry. */
  async start(): Promise<void> {
    if (this.phase !== 'idle') return;
    this.phase = 'starting';
    this.deps.onChange();
    try {
      const calibrated = this.waitForCalibration();
      await this.mic.open();
      this.deps.log('mic open: measuring the noise');
      await calibrated;
      await this.audio.start();
      if (this.phase !== 'starting') return; // stopped while starting
      this.phase = 'running';
      this.machine.start();
    } catch (error) {
      if (this.phase === 'starting') this.fail(error);
    }
    this.deps.onChange();
  }

  /** Play/pause button on the screen. */
  togglePause(): void {
    if (this.phase !== 'running') return;
    if (this.paused) this.audio.resume();
    else this.audio.pause();
  }

  repeat(): void {
    if (this.phase !== 'running') return;
    this.machine.repeat();
    this.deps.onChange();
  }

  next(): void {
    if (this.phase !== 'running') return;
    this.machine.next();
    this.deps.onChange();
  }

  /** Ends the lesson early and releases the mic and the audio. */
  stop(): void {
    if (this.phase === 'finished' || this.phase === 'failed') return;
    this.finish('finished');
  }

  private waitForCalibration(): Promise<void> {
    const timeoutMs = this.deps.calibrationTimeoutMs ?? 10000;
    return new Promise((resolve, reject) => {
      const timer = this.deps.clock.setTimeout(
        () =>
          reject(new Error('The microphone gave no sound level; try again.')),
        timeoutMs,
      );
      this.calibrated = () => {
        this.deps.clock.clearTimeout(timer);
        this.calibrated = undefined;
        resolve();
      };
    });
  }

  private onEffect(effect: Effect): void {
    this.deps.log(`effect: ${JSON.stringify(effect)}`);
    this.audio.apply(effect);
    if (effect.type === 'stop') this.finish('finished');
    else this.deps.onChange(); // effects also come from the machine's timers
  }

  private onPausedChange(paused: boolean): void {
    this.paused = paused;
    if (paused) this.machine.pause();
    else this.machine.resume();
    this.deps.onChange();
  }

  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.deps.log(`FAILED: ${this.error}`);
    this.finish('failed');
  }

  private finish(phase: 'finished' | 'failed'): void {
    this.phase = phase;
    this.audio.dispose();
    this.mic.close();
    this.deps.onChange();
  }
}
