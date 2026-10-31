// The lesson loop as a plain state machine. It knows nothing about audio or
// the microphone: it receives events and answers with effects ("play this clip").
// Rules: docs/app-spec.md section 2, "Per-sentence loop".

export type Phase =
  | 'idle'
  | 'playingTarget'
  | 'waiting'
  | 'playingMeaning'
  | 'playingFinishedCue'
  | 'finished';

export interface Settings {
  /** Silence after the learner stops speaking that ends the wait. */
  silenceMs: number;
  /**
   * Longest one stretch of non-stop speech (or noise) may last before the
   * wait ends.
   */
  maxWaitMs: number;
}

export const DEFAULT_SETTINGS: Settings = { silenceMs: 4000, maxWaitMs: 15000 };

/** Each play effect replaces whatever clip is playing. `id` comes back in `clipEnded`. */
export type Effect =
  | { type: 'playTarget'; index: number; id: number }
  | { type: 'playMeaning'; index: number; id: number }
  | { type: 'playFinishedCue'; id: number }
  | { type: 'stop' };

export interface Clock {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface LessonState {
  phase: Phase;
  /** Index of the current sentence. */
  index: number;
}

export class LessonMachine {
  private phase: Phase = 'idle';
  private index = 0;
  private clipId = 0;
  /** Whether the learner is speaking right now, tracked in every phase. */
  private speaking = false;
  /** Paused by the learner: the wait timers do not run until resume(). */
  private paused = false;
  private silenceTimer: unknown = undefined;
  private maxWaitTimer: unknown = undefined;

  constructor(
    private readonly sentenceCount: number,
    private readonly clock: Clock,
    private readonly onEffect: (effect: Effect) => void,
    private settings: Settings = DEFAULT_SETTINGS,
  ) {
    if (sentenceCount < 1)
      throw new Error('A lesson needs at least one sentence');
  }

  get state(): LessonState {
    return { phase: this.phase, index: this.index };
  }

  /** Settings apply from the next wait on. */
  updateSettings(settings: Partial<Settings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /** Start (or restart) the lesson from the first sentence. */
  start(): void {
    this.clearTimers();
    this.index = 0;
    this.playTarget();
  }

  speechStart(): void {
    this.speaking = true;
    if (this.phase === 'waiting') this.onSpeechStartWhileWaiting();
  }

  speechEnd(): void {
    this.speaking = false;
    if (this.phase === 'waiting') this.onSpeechEndWhileWaiting();
  }

  /** The clip with this id finished. Ended events of replaced clips are ignored. */
  clipEnded(id: number): void {
    if (id !== this.clipId) return;
    switch (this.phase) {
      case 'playingTarget':
        this.phase = 'waiting';
        this.startWait();
        break;
      case 'playingMeaning':
        this.advance();
        break;
      case 'playingFinishedCue':
        this.phase = 'finished';
        this.onEffect({ type: 'stop' });
        break;
      default:
        break;
    }
  }

  /**
   * The learner paused the audio. The wait timers stop, so a pause cannot end
   * the wait. Speech is still tracked.
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clearTimers();
  }

  /** After a pause in the wait, the learner gets a full new wait. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.phase === 'waiting') this.startWait();
  }

  /** End the lesson now: cancels the timers and ignores everything after this. */
  halt(): void {
    this.clearTimers();
    this.phase = 'finished';
  }

  /** Replay the target sentence, then the loop continues. */
  repeat(): void {
    if (this.phase === 'playingTarget' || this.phase === 'waiting') {
      this.clearTimers();
      this.playTarget();
    }
  }

  /** Skip the meaning and go to the next sentence. */
  next(): void {
    if (this.phase === 'playingTarget' || this.phase === 'waiting') {
      this.clearTimers();
      this.advance();
    }
  }

  private playTarget(): void {
    this.phase = 'playingTarget';
    this.onEffect({ type: 'playTarget', index: this.index, id: ++this.clipId });
  }

  private playMeaning(): void {
    this.clearTimers();
    this.phase = 'playingMeaning';
    this.onEffect({
      type: 'playMeaning',
      index: this.index,
      id: ++this.clipId,
    });
  }

  private advance(): void {
    if (this.index + 1 < this.sentenceCount) {
      this.index += 1;
      this.playTarget();
    } else {
      this.phase = 'playingFinishedCue';
      this.onEffect({ type: 'playFinishedCue', id: ++this.clipId });
    }
  }

  private startWait(): void {
    if (this.paused) return;
    if (this.speaking) this.onSpeechStartWhileWaiting();
    else this.armSilence();
  }

  private onSpeechStartWhileWaiting(): void {
    if (this.paused) return;
    this.clearTimers();
    this.armMaxWait();
  }

  private onSpeechEndWhileWaiting(): void {
    if (this.paused) return;
    this.clearTimers();
    this.armSilence();
  }

  private armSilence(): void {
    this.silenceTimer = this.clock.setTimeout(
      () => this.playMeaning(),
      this.settings.silenceMs,
    );
  }

  private armMaxWait(): void {
    this.maxWaitTimer = this.clock.setTimeout(
      () => this.playMeaning(),
      this.settings.maxWaitMs,
    );
  }

  private clearTimers(): void {
    this.clock.clearTimeout(this.silenceTimer);
    this.clock.clearTimeout(this.maxWaitTimer);
    this.silenceTimer = undefined;
    this.maxWaitTimer = undefined;
  }
}
