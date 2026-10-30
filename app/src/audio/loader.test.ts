import { describe, expect, it } from 'vitest';
import { loadIndex, loadLesson } from './loader';

const manifest = {
  schema_version: 1,
  lesson: 'lesson-01',
  pair: 'fr-en',
  target_lang: 'fr',
  meaning_lang: 'en',
  title: 'T',
  items: [
    {
      id: 's01',
      target: 'a',
      meaning: 'b',
      target_file: 'a_target.m4a',
      meaning_file: 'a_meaning.m4a',
      target_seconds: 1,
      meaning_seconds: 1,
    },
    {
      id: 's02',
      target: 'c',
      meaning: 'd',
      target_file: 'b_target.m4a',
      meaning_file: 'b_meaning.m4a',
      target_seconds: 1,
      meaning_seconds: 1,
    },
  ],
  end_cue: { text: 'e', file: 'cues/en.m4a', seconds: 1 },
};

const index = {
  schema_version: 1,
  cues: { en: { text: 'e', file: 'cues/en.m4a', seconds: 1 } },
  lessons: [],
};

function deps(missing: string[] = []) {
  const fetched: string[] = [];
  return {
    fetched,
    fetch: async (url: string) => {
      fetched.push(url);
      if (missing.some((path) => url.endsWith(path)))
        return new Response('no', { status: 404 });
      if (url.endsWith('manifest.json'))
        return new Response(JSON.stringify(manifest));
      if (url.endsWith('index.json'))
        return new Response(JSON.stringify(index));
      return new Response(new Uint8Array([1, 2, 3]));
    },
    createObjectURL: (blob: Blob) =>
      `blob:${blob.type}:${blob.size}:${Math.random()}`,
  };
}

const MANIFEST = 'fr-en/lesson-01/manifest.json';

describe('loadIndex', () => {
  it('loads and checks index.json', async () => {
    const d = deps();
    expect((await loadIndex('/lessons/', d)).lessons).toEqual([]);
    expect(d.fetched).toEqual(['/lessons/index.json']);
  });

  it('fails clearly when there is no index', async () => {
    await expect(loadIndex('/lessons/', deps(['index.json']))).rejects.toThrow(
      'Could not load index.json (HTTP 404)',
    );
  });
});

describe('loadLesson', () => {
  it('loads the manifest and every clip once', async () => {
    const d = deps();
    const { clips } = await loadLesson('/lessons/', MANIFEST, d);
    // clips are next to the manifest; the end cue is named from the lessons folder
    expect(d.fetched.sort()).toEqual(
      [
        'fr-en/lesson-01/manifest.json',
        'fr-en/lesson-01/a_target.m4a',
        'fr-en/lesson-01/a_meaning.m4a',
        'fr-en/lesson-01/b_target.m4a',
        'fr-en/lesson-01/b_meaning.m4a',
        'cues/en.m4a',
      ]
        .map((n) => '/lessons/' + n)
        .sort(),
    );
    expect(clips.targetUrl(0)).toMatch(/^blob:audio\/mp4:3:/);
    expect(
      new Set([
        clips.targetUrl(0),
        clips.meaningUrl(0),
        clips.targetUrl(1),
        clips.finishedCueUrl(),
      ]).size,
    ).toBe(4);
  });

  it('fails clearly when a file is missing', async () => {
    await expect(
      loadLesson('/x/', MANIFEST, deps(['b_meaning.m4a'])),
    ).rejects.toThrow(
      'Could not load fr-en/lesson-01/b_meaning.m4a (HTTP 404)',
    );
  });

  it('rejects a sentence that does not exist', async () => {
    const { clips } = await loadLesson('/x/', MANIFEST, deps());
    expect(() => clips.targetUrl(5)).toThrow('No sentence 5');
  });
});
