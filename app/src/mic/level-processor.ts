// Runs on the audio thread. Measures the sound level (RMS) of every block of
// about 40 ms and posts it with the audio clock time. Unlike a timer on the
// page, it sees all the sound even when the page is throttled with the screen
// locked, and the main thread gets the levels, in order, whenever it wakes up.

export {};

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor,
): void;
declare const currentTime: number; // seconds on the audio clock

const BLOCK_FRAMES = 2048;

class LevelProcessor extends AudioWorkletProcessor {
  private sumSquares = 0;
  private frames = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) this.sumSquares += sample * sample;
    this.frames += channel.length;
    if (this.frames >= BLOCK_FRAMES) {
      const rms = Math.sqrt(this.sumSquares / this.frames);
      this.port.postMessage({ timeMs: currentTime * 1000, rms });
      this.sumSquares = 0;
      this.frames = 0;
    }
    return true;
  }
}

registerProcessor('level-processor', LevelProcessor);
