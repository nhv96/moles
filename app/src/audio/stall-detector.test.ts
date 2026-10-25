import { describe, expect, it } from 'vitest';
import { StallDetector } from './stall-detector';

describe('StallDetector', () => {
  it('stays quiet while the time moves', () => {
    const d = new StallDetector(2000);
    for (let i = 0; i < 20; i++)
      expect(d.check(i * 500, i * 0.5, true)).toBe(false);
  });

  it('reports when the time has not moved for the stall length', () => {
    const d = new StallDetector(2000);
    expect(d.check(0, 1, true)).toBe(false);
    expect(d.check(1500, 1, true)).toBe(false);
    expect(d.check(2000, 1, true)).toBe(true);
  });

  it('waits a full stall length before reporting again', () => {
    const d = new StallDetector(2000);
    d.check(0, 1, true);
    expect(d.check(2000, 1, true)).toBe(true);
    expect(d.check(3500, 1, true)).toBe(false);
    expect(d.check(4000, 1, true)).toBe(true);
  });

  it('does not count time while the audio should not be playing', () => {
    const d = new StallDetector(2000);
    d.check(0, 1, true);
    d.check(1000, 1, false);
    expect(d.check(2500, 1, true)).toBe(false);
    expect(d.check(4500, 1, true)).toBe(true);
  });

  it('starts over after reset', () => {
    const d = new StallDetector(2000);
    d.check(0, 0, true);
    d.reset();
    expect(d.check(1900, 0, true)).toBe(false);
    expect(d.check(3900, 0, true)).toBe(true);
  });
});
