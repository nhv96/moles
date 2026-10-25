// Plays the lesson clips for the lesson state machine and keeps the page alive.
//
// - A silent looping track plays from start() on, so the audio session stays
//   open between clips (screen locked). Clips play on a second element.
// - A watchdog restarts a clip or the silent track whose time stops moving.
// - Headphone buttons (Media Session, best effort) are reported as events.

import type { Effect } from '../lesson/machine';
import type { ClipSet } from './loader';
import { StallDetector } from './stall-detector';

/** The parts of HTMLAudioElement that are used, so tests can use a fake. */
export interface MediaElement {
  src: string;
  loop: boolean;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
}

export interface MediaSessionLike {
  setActionHandler(action: string, handler: (() => void) | null): void;
}

export interface Ticker {
  now(): number;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface PlayerDeps {
  createAudio: () => MediaElement;
  ticker: Ticker;
  mediaSession?: MediaSessionLike;
  /** URL of the silent keep-alive clip. */
  silentUrl: string;
}

export interface PlayerEvents {
  /** The clip with this id ended (really, or stuck at its very end). */
  clipEnded(id: number): void;
  /** Headphone previous button. */
  repeat(): void;
  /** Headphone next button. */
  next(): void;
  /** The user paused or resumed with the play/pause button. */
  pausedChange(paused: boolean): void;
  log(message: string): void;
}

export interface PlayerConfig {
  pollMs: number;
  stallMs: number;
  /** Play the silent keep-alive track. Only turned off to compare in tests. */
  silentTrack: boolean;
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  pollMs: 500,
  stallMs: 2000,
  silentTrack: true,
};

/** A clip this close to its end counts as finished when it is stuck. */
const END_MARGIN_S = 0.15;

export class LessonAudio {
  private readonly clip: MediaElement;
  private readonly silent: MediaElement;
  private readonly clipStall: StallDetector;
  private current: { id: number; url: string; stalls: number } | undefined;
  private started = false;
  private userPaused = false;
  private pollHandle: unknown;

  constructor(
    private readonly clips: ClipSet,
    private readonly events: PlayerEvents,
    private readonly deps: PlayerDeps,
    private readonly config: PlayerConfig = DEFAULT_PLAYER_CONFIG,
  ) {
    this.clip = deps.createAudio();
    this.silent = deps.createAudio();
    this.silent.loop = true;
    this.silent.src = deps.silentUrl;
    this.clipStall = new StallDetector(config.stallMs);
    this.clip.addEventListener('ended', () => this.finishClip('ended'));
    this.logElementEvents('clip', this.clip);
    this.logElementEvents('silent', this.silent);
  }

  get paused(): boolean {
    return this.userPaused;
  }

  /** Call from a tap: starts the silent track, the buttons and the watchdog. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.registerMediaSession();
    if (this.config.silentTrack) await this.silent.play();
    this.pollHandle = this.deps.ticker.setInterval(
      () => this.poll(),
      this.config.pollMs,
    );
  }

  /** Follows the effects of the lesson state machine. */
  apply(effect: Effect): void {
    if (effect.type === 'stop') {
      this.current = undefined;
      this.clip.pause();
      return;
    }
    const url =
      effect.type === 'playFrench'
        ? this.clips.frenchUrl(effect.index)
        : effect.type === 'playMeaning'
          ? this.clips.meaningUrl(effect.index)
          : this.clips.finishedCueUrl();
    this.current = { id: effect.id, url, stalls: 0 };
    this.clipStall.reset();
    this.clip.src = url;
    this.clip.currentTime = 0;
    if (!this.userPaused) this.playClip();
  }

  pause(): void {
    if (this.userPaused) return;
    this.userPaused = true;
    this.events.log(`pausing the clip at ${this.clip.currentTime.toFixed(2)}`);
    this.clip.pause(); // the silent track keeps playing
    this.events.pausedChange(true);
  }

  resume(): void {
    if (!this.userPaused) return;
    this.userPaused = false;
    this.events.log(
      `resuming the clip from ${this.clip.currentTime.toFixed(2)}`,
    );
    if (this.current) this.playClip();
    this.events.pausedChange(false);
  }

  dispose(): void {
    this.deps.ticker.clearInterval(this.pollHandle);
    this.clip.pause();
    this.silent.pause();
    for (const action of ['previoustrack', 'nexttrack', 'pause', 'play']) {
      this.deps.mediaSession?.setActionHandler(action, null);
    }
  }

  /** Times of both elements, for the test page. */
  snapshot(): string {
    return `clip=${this.clip.currentTime.toFixed(2)} silent=${this.silent.currentTime.toFixed(2)}`;
  }

  /** Events the browser fires on its own (for example when iOS pauses an element) are logged. */
  private logElementEvents(name: string, element: MediaElement): void {
    for (const type of [
      'play',
      'playing',
      'pause',
      'waiting',
      'stalled',
      'seeking',
      'seeked',
      'error',
      'emptied',
    ]) {
      element.addEventListener(type, () =>
        this.events.log(
          `${name} event: ${type} (time=${element.currentTime.toFixed(2)}, paused=${element.paused})`,
        ),
      );
    }
  }

  private playClip(): void {
    this.clip
      .play()
      .catch((error: unknown) =>
        this.events.log(`clip play() failed: ${error}`),
      );
  }

  private finishClip(why: string): void {
    const current = this.current;
    if (!current) return;
    this.current = undefined;
    this.clipStall.reset();
    this.events.log(`clip ${current.id} finished (${why})`);
    this.events.clipEnded(current.id);
  }

  private registerMediaSession(): void {
    const session = this.deps.mediaSession;
    if (!session) return;
    const on = (action: string, handler: () => void) => {
      session.setActionHandler(action, () => {
        this.events.log(`headphone button: ${action}`);
        handler();
      });
    };
    on('previoustrack', () => this.events.repeat());
    on('nexttrack', () => this.events.next());
    // Play/pause arrives as "pause" even when the user means resume, so it is a toggle.
    on('pause', () => (this.userPaused ? this.resume() : this.pause()));
    on('play', () => this.resume());
  }

  private poll(): void {
    const now = this.deps.ticker.now();

    const clipActive = this.current !== undefined && !this.userPaused;
    if (this.clipStall.check(now, this.clip.currentTime, clipActive))
      this.recoverClip();

    // The silent track's currentTime reads 0 on iOS even while it keeps the page
    // alive, so only a really paused element counts as a problem.
    if (this.config.silentTrack && this.silent.paused) {
      this.events.log('watchdog: silent track is paused, restarting it');
      this.silent
        .play()
        .catch((error: unknown) =>
          this.events.log(`silent play() failed: ${error}`),
        );
    }
  }

  private recoverClip(): void {
    const current = this.current;
    if (!current) return;
    const { duration, currentTime } = this.clip;
    if (Number.isFinite(duration) && currentTime >= duration - END_MARGIN_S) {
      // Stuck at the very end: the "ended" event never came.
      this.finishClip('stuck at the end');
      return;
    }
    current.stalls += 1;
    if (current.stalls === 1) {
      this.events.log(
        `watchdog: clip ${current.id} stalled at ${currentTime.toFixed(2)} s, resuming`,
      );
      this.playClip();
    } else {
      this.events.log(
        `watchdog: clip ${current.id} still stalled, reloading it from the start`,
      );
      this.clip.src = current.url;
      this.clip.currentTime = 0;
      this.playClip();
    }
  }
}
