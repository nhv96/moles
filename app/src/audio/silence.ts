// A silent WAV used as the "keep-alive" track: playing it between clips keeps
// the page's audio session open with the screen locked.

export function makeSilentWav(
  seconds = 1,
  sampleRate = 8000,
): Uint8Array<ArrayBuffer> {
  const samples = Math.round(seconds * sampleRate);
  const bytes = new Uint8Array(new ArrayBuffer(44 + samples * 2)); // 16-bit mono, samples stay 0
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  return bytes;
}
