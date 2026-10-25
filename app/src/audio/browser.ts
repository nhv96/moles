// Connects LessonAudio to the real browser.

import { makeSilentWav } from './silence';
import {
  LessonAudio,
  type PlayerConfig,
  type PlayerEvents,
  type Ticker,
} from './player';
import type { ClipSet } from './loader';

const browserTicker: Ticker = {
  now: () => Date.now(),
  setInterval: (callback, ms) => window.setInterval(callback, ms),
  clearInterval: (handle) => window.clearInterval(handle as number),
};

export function createBrowserAudio(
  clips: ClipSet,
  events: PlayerEvents,
  title: string,
  config?: PlayerConfig,
): LessonAudio {
  const silentUrl = URL.createObjectURL(
    new Blob([makeSilentWav()], { type: 'audio/wav' }),
  );
  const mediaSession =
    'mediaSession' in navigator ? navigator.mediaSession : undefined;
  if (mediaSession) {
    mediaSession.metadata = new MediaMetadata({
      title,
      artist: 'Morning Lesson',
    });
    mediaSession.playbackState = 'playing'; // iOS follows the real audio; keep it consistent
  }
  return new LessonAudio(
    clips,
    events,
    {
      createAudio: () => new Audio(),
      ticker: browserTicker,
      mediaSession: mediaSession && {
        setActionHandler: (action, handler) =>
          mediaSession.setActionHandler(action as MediaSessionAction, handler),
      },
      silentUrl,
    },
    config,
  );
}
