// Opens the microphone and feeds its sound level to a SpeechDetector.
//
// - Echo cancellation, noise suppression and auto gain are off: they make
//   playback quieter on iOS and are not needed with headphones
//   (docs/app-spec.md section 4).
// - Call open() from a tap, and before any audio starts ("mic first").
// - The active input (iPhone microphone or headset) is logged, because iOS
//   switches between them from run to run.

import {
  type Calibration,
  DEFAULT_DETECTOR_SETTINGS,
  type DetectorSettings,
  SpeechDetector,
} from './speech-detector';
import workletUrl from './level-processor.ts?worker&url';

export interface MicEvents {
  speechStart(): void;
  speechEnd(): void;
  calibrated(calibration: Calibration): void;
  /** Every level, for meters. `timeMs` is the audio clock. */
  level?(timeMs: number, level: number): void;
  log(message: string): void;
}

export class MicMonitor {
  readonly detector: SpeechDetector;
  private context: AudioContext | undefined;
  private meter: AudioWorkletNode | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private stream: MediaStream | undefined;
  private queue: Promise<void> = Promise.resolve();

  /** Id of the microphone in use. */
  get activeDeviceId(): string | undefined {
    return this.stream?.getAudioTracks()[0]?.getSettings().deviceId;
  }

  constructor(
    private readonly events: MicEvents,
    settings: DetectorSettings = DEFAULT_DETECTOR_SETTINGS,
  ) {
    this.detector = new SpeechDetector(
      {
        speechStart: () => events.speechStart(),
        speechEnd: () => events.speechEnd(),
        calibrated: (c) => events.calibrated(c),
      },
      settings,
    );
  }

  /**
   * Asks for the mic and starts measuring (with the noise calibration first).
   * Without `deviceId`, iOS picks the input (iPhone or headset microphone).
   * Calling it again switches to another microphone. Calls are queued, so
   * quick taps cannot overlap.
   */
  open(deviceId?: string): Promise<void> {
    const run = this.queue.then(() => this.openNow(deviceId));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Changes the speech detector settings at once. */
  updateSettings(settings: Partial<DetectorSettings>): void {
    this.detector.updateSettings(settings);
  }

  /** Measure the background noise again. */
  recalibrate(): void {
    this.detector.recalibrate();
  }

  /** Releases the microphone and the audio context. */
  close(): void {
    this.queue = this.queue.then(() => {
      this.stopStream();
      void this.context?.close();
      this.context = undefined;
      this.meter = undefined;
    });
  }

  private async openNow(deviceId?: string): Promise<void> {
    const { log } = this.events;
    this.detector.recalibrate();
    this.stopStream();

    // The context and the worklet are made once and reused for every
    // microphone. Loading the worklet again for each switch failed on iOS
    // ("Importing a module script failed") on the third switch.
    // The context is created inside the tap, so iOS lets it run.
    const meter = this.meter ?? (await this.createMeter());
    const context = meter.context as AudioContext;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const track = this.stream.getAudioTracks()[0];
    if (!track) throw new Error('No microphone track');
    const s = track.getSettings();
    log(`mic input: ${track.label} (id ${s.deviceId?.slice(0, 8)})`);
    log(
      `mic settings: echoCancellation=${s.echoCancellation}, noiseSuppression=${s.noiseSuppression}, autoGainControl=${s.autoGainControl}`,
    );
    track.onmute = () => log('MIC TRACK MUTED');
    track.onunmute = () => log('mic track unmuted');
    track.onended = () => log('MIC TRACK ENDED');

    this.source = context.createMediaStreamSource(this.stream);
    this.source.connect(meter);
    await context.resume();
    log(`audioContext: ${context.state}, sample rate ${context.sampleRate}`);
  }

  private async createMeter(): Promise<AudioWorkletNode> {
    const context = new AudioContext();
    context.onstatechange = () =>
      this.events.log(`audioContext: ${context.state}`);
    try {
      await context.audioWorklet.addModule(workletUrl);
    } catch (error) {
      void context.close();
      throw error;
    }
    const meter = new AudioWorkletNode(context, 'level-processor', {
      numberOfOutputs: 0,
    });
    meter.port.onmessage = (
      message: MessageEvent<{ timeMs: number; rms: number }>,
    ) => {
      const { timeMs, rms } = message.data;
      this.events.level?.(timeMs, rms);
      this.detector.push(timeMs, rms);
    };
    this.context = context;
    this.meter = meter;
    return meter;
  }

  private stopStream(): void {
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source = undefined;
    this.stream = undefined;
  }
}

/** The microphones the browser offers. Labels are only filled in after the mic permission is granted. */
export async function listInputs(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput');
}
