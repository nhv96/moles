// Downloads the manifest and every clip up front and keeps the clips as blob URLs.
// With the screen locked the page may not be able to fetch, so nothing is
// fetched while the lesson runs.

import { type BuildIndex, parseIndex } from './index';
import { type Manifest, parseManifest } from './manifest';

/** Where the player gets the URL of each clip. */
export interface ClipSet {
  targetUrl(index: number): string;
  meaningUrl(index: number): string;
  finishedCueUrl(): string;
}

export interface LoadedLesson {
  manifest: Manifest;
  clips: ClipSet;
}

export interface LoaderDeps {
  fetch: (url: string) => Promise<Response>;
  createObjectURL: (blob: Blob) => string;
}

const browserDeps: LoaderDeps = {
  fetch: (url) => fetch(url),
  createObjectURL: (blob) => URL.createObjectURL(blob),
};

/** Downloads index.json from the lessons folder (for example "/lessons/"). */
export async function loadIndex(
  lessonsUrl: string,
  deps: LoaderDeps = browserDeps,
): Promise<BuildIndex> {
  const response = await deps.fetch(lessonsUrl + 'index.json');
  if (!response.ok)
    throw new Error(`Could not load index.json (HTTP ${response.status})`);
  return parseIndex(await response.json());
}

/**
 * Downloads one lesson. `manifestPath` comes from the index and is relative to the
 * lessons folder; the clips are next to the manifest, the end cue is named from the lessons folder.
 */
export async function loadLesson(
  lessonsUrl: string,
  manifestPath: string,
  deps: LoaderDeps = browserDeps,
): Promise<LoadedLesson> {
  const get = async (path: string): Promise<Response> => {
    const response = await deps.fetch(lessonsUrl + path);
    if (!response.ok)
      throw new Error(`Could not load ${path} (HTTP ${response.status})`);
    return response;
  };

  const manifest = parseManifest(await (await get(manifestPath)).json());
  const folder = manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1);

  const urls = new Map<string, string>();
  const paths = [
    ...manifest.items.flatMap((item) => [
      folder + item.target_file,
      folder + item.meaning_file,
    ]),
    manifest.end_cue.file,
  ];
  await Promise.all(
    paths.map(async (path) => {
      const data = await (await get(path)).arrayBuffer();
      urls.set(
        path,
        deps.createObjectURL(new Blob([data], { type: 'audio/mp4' })),
      );
    }),
  );

  const url = (path: string): string => {
    const found = urls.get(path);
    if (!found) throw new Error(`Clip not loaded: ${path}`);
    return found;
  };
  const item = (index: number) => {
    const found = manifest.items[index];
    if (!found) throw new Error(`No sentence ${index}`);
    return found;
  };

  return {
    manifest,
    clips: {
      targetUrl: (index) => url(folder + item(index).target_file),
      meaningUrl: (index) => url(folder + item(index).meaning_file),
      finishedCueUrl: () => url(manifest.end_cue.file),
    },
  };
}
