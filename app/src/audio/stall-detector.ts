// Playback can get stuck without any event (docs/app-spec.md section 4, "First
// run after granting mic permission"). The only reliable sign is that the
// current time stops moving while the audio should be playing.

export class StallDetector {
  private lastTime = Number.NaN;
  private since = 0;

  constructor(private readonly stallMs: number) {}

  /**
   * Call on every poll. Returns true once the time has not moved for `stallMs`
   * while the audio should be playing, then waits another `stallMs` before
   * it reports again.
   */
  check(now: number, currentTime: number, shouldBePlaying: boolean): boolean {
    if (!shouldBePlaying || currentTime !== this.lastTime) {
      this.lastTime = shouldBePlaying ? currentTime : Number.NaN;
      this.since = now;
      return false;
    }
    if (now - this.since >= this.stallMs) {
      this.since = now;
      return true;
    }
    return false;
  }

  reset(): void {
    this.lastTime = Number.NaN;
  }
}
