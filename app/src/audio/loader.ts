// Downloads the manifest and every clip up front and keeps the clips as blob URLs.
// With the screen locked the page may not be able to fetch, so nothing is
// fetched while the lesson runs.

import { type Manifest, parseManifest } from './manifest';

/** Where the player gets the URL of each clip. */
export interface ClipSet {
  frenchUrl(index: number): string;
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

export async function loadLesson(
  baseUrl: string,
  deps: LoaderDeps = browserDeps,
): Promise<LoadedLesson> {
  const get = async (name: string): Promise<Response> => {
    const response = await deps.fetch(baseUrl + name);
    if (!response.ok)
      throw new Error(`Could not load ${name} (HTTP ${response.status})`);
    return response;
  };

  const manifest = parseManifest(await (await get('manifest.json')).json());

  const urls = new Map<string, string>();
  const names = [
    ...manifest.items.flatMap((item) => [item.fr_file, item.en_file]),
    manifest.finished_cue.file,
  ];
  await Promise.all(
    names.map(async (name) => {
      const data = await (await get(name)).arrayBuffer();
      urls.set(
        name,
        deps.createObjectURL(new Blob([data], { type: 'audio/mp4' })),
      );
    }),
  );

  const url = (name: string): string => {
    const found = urls.get(name);
    if (!found) throw new Error(`Clip not loaded: ${name}`);
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
      frenchUrl: (index) => url(item(index).fr_file),
      meaningUrl: (index) => url(item(index).en_file),
      finishedCueUrl: () => url(manifest.finished_cue.file),
    },
  };
}
