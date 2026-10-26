// Decides from a stream of sound levels when the learner is speaking.
// Pure logic: it knows nothing about the microphone, and it runs on the
// audio clock (the timestamps that come with the levels), not on timers, so a
// throttled page that gets a burst of late levels still sees the right timing.
//
// 1. Calibration: levels while the learner is quiet give the background noise
//    level. Thresholds are relative to it, because a fixed threshold does not
//    hold up outdoors (docs/app-spec.md section 4). The first `settleMs` are
//    skipped, because opening or switching to a Bluetooth headset mic makes a
//    loud burst (seen: noise 0.03 instead of 0.0005), and the noise is the
//    average of the quietest `windowMs` of the rest, so a cough or a bang
//    during calibration does not ruin it either.
// 2. Hysteresis: speech starts only after the level stays above the start
//    threshold for `startMs`, and ends only after it stays below the lower end
//    threshold for `hangMs`. Short noises and the gaps between words do not
//    flip the state.

export interface DetectorSettings {
  /** Levels this long after the mic opens are ignored (the route settles). */
  settleMs: number;
  /** How long the learner is quiet after that, to measure the background noise. */
  calibrationMs: number;
  /** The noise is the average level of the quietest stretch of this length. */
  windowMs: number;
  /** Speech starts above noise * startRatio. */
  startRatio: number;
  /** Speech ends below noise * endRatio (lower than startRatio). */
  endRatio: number;
  /** Floor for the start threshold, so a silent room does not make it zero. */
  minLevel: number;
  /** The level must stay above the start threshold this long to count as speech. */
  startMs: number;
  /** The level must stay below the end threshold this long to end the speech. */
  hangMs: number;
}

export const DEFAULT_DETECTOR_SETTINGS: DetectorSettings = {
  settleMs: 1000,
  calibrationMs: 1500,
  windowMs: 500,
  startRatio: 3,
  endRatio: 2,
  minLevel: 0.003,
  startMs: 100,
  hangMs: 400,
};

export interface Calibration {
  /** Background noise level (average of the quietest stretch of the calibration). */
  noise: number;
  startThreshold: number;
  endThreshold: number;
}

export interface DetectorHandlers {
  speechStart(): void;
  speechEnd(): void;
  calibrated(calibration: Calibration): void;
}

export type DetectorPhase = 'calibrating' | 'listening';

export class SpeechDetector {
  private phase: DetectorPhase = 'calibrating';
  private calibrationStart: number | undefined;
  private calibrationLevels: Array<{ timeMs: number; level: number }> = [];
  private calibration: Calibration | undefined;
  private speaking = false;
  private aboveSince: number | undefined;
  private belowSince: number | undefined;

  constructor(
    private readonly handlers: DetectorHandlers,
    private settings: DetectorSettings = DEFAULT_DETECTOR_SETTINGS,
  ) {}

  get state(): {
    phase: DetectorPhase;
    speaking: boolean;
    calibration?: Calibration;
  } {
    return {
      phase: this.phase,
      speaking: this.speaking,
      calibration: this.calibration,
    };
  }

  /** Thresholds are recomputed from the measured noise, so changes apply at once. */
  updateSettings(settings: Partial<DetectorSettings>): void {
    this.settings = { ...this.settings, ...settings };
    if (this.calibration)
      this.calibration = this.thresholdsFor(this.calibration.noise);
  }

  /** Measure the background noise again, starting with the next level. */
  recalibrate(): void {
    this.phase = 'calibrating';
    this.calibrationStart = undefined;
    this.calibrationLevels = [];
    this.aboveSince = undefined;
    this.belowSince = undefined;
    this.endSpeech();
  }

  /** `timeMs` is the audio clock time of the level; `level` is an RMS value (0 to 1). */
  push(timeMs: number, level: number): void {
    if (this.phase === 'calibrating') {
      this.calibrationStart ??= timeMs + this.settings.settleMs;
      if (timeMs < this.calibrationStart) return;
      this.calibrationLevels.push({ timeMs, level });
      if (timeMs - this.calibrationStart >= this.settings.calibrationMs)
        this.finishCalibration();
      return;
    }
    const calibration = this.calibration;
    if (!calibration) return;

    if (!this.speaking) {
      if (level > calibration.startThreshold) {
        this.aboveSince ??= timeMs;
        if (timeMs - this.aboveSince >= this.settings.startMs) {
          this.speaking = true;
          this.belowSince = undefined;
          this.handlers.speechStart();
        }
      } else {
        this.aboveSince = undefined;
      }
    } else if (level < calibration.endThreshold) {
      this.belowSince ??= timeMs;
      if (timeMs - this.belowSince >= this.settings.hangMs) this.endSpeech();
    } else {
      this.belowSince = undefined;
    }
  }

  private endSpeech(): void {
    if (!this.speaking) return;
    this.speaking = false;
    this.aboveSince = undefined;
    this.belowSince = undefined;
    this.handlers.speechEnd();
  }

  private finishCalibration(): void {
    const noise = quietestWindowAverage(
      this.calibrationLevels,
      this.settings.windowMs,
    );
    this.calibration = this.thresholdsFor(noise);
    this.phase = 'listening';
    this.handlers.calibrated(this.calibration);
  }

  private thresholdsFor(noise: number): Calibration {
    const { startRatio, endRatio, minLevel } = this.settings;
    const startThreshold = Math.max(minLevel, noise * startRatio);
    const endThreshold = Math.min(
      startThreshold,
      Math.max(minLevel * (endRatio / startRatio), noise * endRatio),
    );
    return { noise, startThreshold, endThreshold };
  }
}

/** Lowest average level over any stretch of `windowMs` (all levels if there are fewer). */
function quietestWindowAverage(
  levels: Array<{ timeMs: number; level: number }>,
  windowMs: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < levels.length; i++) {
    const start = levels[i].timeMs;
    let sum = 0;
    let count = 0;
    for (
      let j = i;
      j < levels.length && levels[j].timeMs - start < windowMs;
      j++
    ) {
      sum += levels[j].level;
      count++;
    }
    if (count > 0) best = Math.min(best, sum / count);
  }
  return Number.isFinite(best) ? best : 0;
}
