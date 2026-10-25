import { describe, expect, it } from 'vitest';
import { makeSilentWav } from './silence';

describe('makeSilentWav', () => {
  it('makes a valid 16-bit mono WAV of silence', () => {
    const wav = makeSilentWav(1, 8000);
    const view = new DataView(wav.buffer);
    const text = (o: number, n: number) =>
      String.fromCharCode(...wav.slice(o, o + n));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(36, 4)).toBe('data');
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(view.getUint32(40, true)).toBe(16000);
    expect(wav.length).toBe(44 + 16000);
    expect(wav.slice(44).every((b) => b === 0)).toBe(true);
  });
});
