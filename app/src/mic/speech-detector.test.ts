import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Calibration,
  DEFAULT_DETECTOR_SETTINGS,
  SpeechDetector,
} from './speech-detector';

const STEP = 50; // ms between levels

let events: string[];
let calibration: Calibration | undefined;
let detector: SpeechDetector;
let clock: number;

/** Feeds `ms` of a constant level. */
function feed(level: number, ms: number): void {
  for (let t = 0; t < ms; t += STEP) {
    detector.push(clock, level);
    clock += STEP;
  }
}

/** Calibrates on a constant background noise. */
function calibrate(noise = 0.01): void {
  const { settleMs, calibrationMs } = DEFAULT_DETECTOR_SETTINGS;
  feed(noise, settleMs + calibrationMs + STEP);
}

beforeEach(() => {
  events = [];
  calibration = undefined;
  clock = 1000; // the audio clock does not start at zero
  detector = new SpeechDetector({
    speechStart: () => events.push('start'),
    speechEnd: () => events.push('end'),
    calibrated: (c) => {
      calibration = c;
      events.push('calibrated');
    },
  });
});

describe('calibration', () => {
  it('waits 1 s for the mic to settle, then measures 1.5 s of background noise', () => {
    feed(0.01, 2400);
    expect(detector.state.phase).toBe('calibrating');
    feed(0.01, 200);
    expect(detector.state.phase).toBe('listening');
    expect(calibration?.noise).toBeCloseTo(0.01);
  });

  it('sets thresholds relative to the noise', () => {
    calibrate(0.01);
    expect(calibration?.startThreshold).toBeCloseTo(0.03);
    expect(calibration?.endThreshold).toBeCloseTo(0.02);
  });

  it('ignores the loud burst of a mic that was just opened or switched', () => {
    feed(0.3, 1000); // the settle period
    feed(0.0005, 1700);
    expect(calibration?.noise).toBeCloseTo(0.0005);
  });

  it('is not ruined by a bang or cough during the measurement', () => {
    feed(0.01, 1000);
    feed(0.01, 400);
    feed(0.5, 250); // a bang
    feed(0.01, 1000);
    expect(calibration?.noise).toBeCloseTo(0.01);
  });

  it('follows steady noise', () => {
    calibrate(0.05);
    expect(calibration?.noise).toBeCloseTo(0.05);
  });

  it('keeps a floor for the thresholds in a very quiet room', () => {
    calibrate(0.0001);
    expect(calibration?.startThreshold).toBeCloseTo(0.003);
    expect(calibration?.endThreshold).toBeLessThanOrEqual(
      calibration?.startThreshold ?? 0,
    );
  });

  it('reports no speech during calibration', () => {
    feed(0.2, 1000);
    expect(events).toEqual([]);
  });

  it('can be repeated, and ends any speech in progress', () => {
    calibrate();
    feed(0.1, 300);
    expect(detector.state.speaking).toBe(true);
    detector.recalibrate();
    expect(events).toEqual(['calibrated', 'start', 'end']);
    expect(detector.state.phase).toBe('calibrating');
    calibrate(0.05);
    expect(calibration?.noise).toBeCloseTo(0.05);
  });
});

describe('speech', () => {
  beforeEach(() => {
    calibrate(0.01);
    events = [];
  });

  it('starts after the level stays above the start threshold for 100 ms', () => {
    feed(0.1, 100);
    expect(events).toEqual([]);
    feed(0.1, STEP);
    expect(events).toEqual(['start']);
    expect(detector.state.speaking).toBe(true);
  });

  it('ignores a short noise', () => {
    feed(0.1, 50);
    feed(0.01, 1000);
    expect(events).toEqual([]);
  });

  it('does not start on a level between the thresholds', () => {
    feed(0.025, 2000);
    expect(events).toEqual([]);
  });

  it('ends after the level stays below the end threshold for 400 ms', () => {
    feed(0.1, 500);
    feed(0.01, 350);
    expect(events).toEqual(['start']);
    feed(0.01, 100);
    expect(events).toEqual(['start', 'end']);
  });

  it('keeps speaking through the short gaps between words', () => {
    feed(0.1, 500);
    feed(0.01, 300);
    feed(0.1, 500);
    feed(0.01, 300);
    feed(0.1, 500);
    expect(events).toEqual(['start']);
  });

  it('keeps speaking while the level is between the thresholds (hysteresis)', () => {
    feed(0.1, 500);
    feed(0.025, 3000);
    expect(events).toEqual(['start']);
  });

  it('reports each speech separately', () => {
    feed(0.1, 500);
    feed(0.01, 1000);
    feed(0.1, 500);
    feed(0.01, 1000);
    expect(events).toEqual(['start', 'end', 'start', 'end']);
  });
});

describe('settings', () => {
  it('applies new ratios to the measured noise at once', () => {
    calibrate(0.01);
    events = [];
    detector.updateSettings({ startRatio: 10, endRatio: 5 });
    expect(detector.state.calibration?.startThreshold).toBeCloseTo(0.1);
    feed(0.05, 1000);
    expect(events).toEqual([]);
    feed(0.2, 200);
    expect(events).toEqual(['start']);
  });
});
