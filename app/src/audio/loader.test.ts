import { describe, expect, it } from 'vitest';
import { loadLesson } from './loader';

const manifest = {
  lesson: 'lesson-01',
  title: 'T',
  items: [
    {
      id: 's01',
      fr: 'a',
      en: 'b',
      fr_file: 'a_fr.m4a',
      en_file: 'a_en.m4a',
      fr_seconds: 1,
      en_seconds: 1,
    },
    {
      id: 's02',
      fr: 'c',
      en: 'd',
      fr_file: 'b_fr.m4a',
      en_file: 'b_en.m4a',
      fr_seconds: 1,
      en_seconds: 1,
    },
  ],
  finished_cue: { id: 'end', en: 'e', file: 'end.m4a', seconds: 1 },
};

function deps(missing: string[] = []) {
  const fetched: string[] = [];
  return {
    fetched,
    fetch: async (url: string) => {
      fetched.push(url);
      const name = url.split('/').pop() ?? '';
      if (missing.includes(name)) return new Response('no', { status: 404 });
      if (name === 'manifest.json')
        return new Response(JSON.stringify(manifest));
      return new Response(new Uint8Array([1, 2, 3]));
    },
    createObjectURL: (blob: Blob) =>
      `blob:${blob.type}:${blob.size}:${Math.random()}`,
  };
}

describe('loadLesson', () => {
  it('loads the manifest and every clip once', async () => {
    const d = deps();
    const { clips } = await loadLesson('/lessons/lesson-01/', d);
    expect(d.fetched.sort()).toEqual(
      [
        'manifest.json',
        'a_fr.m4a',
        'a_en.m4a',
        'b_fr.m4a',
        'b_en.m4a',
        'end.m4a',
      ]
        .map((n) => '/lessons/lesson-01/' + n)
        .sort(),
    );
    expect(clips.frenchUrl(0)).toMatch(/^blob:audio\/mp4:3:/);
    expect(
      new Set([
        clips.frenchUrl(0),
        clips.meaningUrl(0),
        clips.frenchUrl(1),
        clips.finishedCueUrl(),
      ]).size,
    ).toBe(4);
  });

  it('fails clearly when a file is missing', async () => {
    await expect(loadLesson('/x/', deps(['b_en.m4a']))).rejects.toThrow(
      'Could not load b_en.m4a (HTTP 404)',
    );
  });

  it('rejects a sentence that does not exist', async () => {
    const { clips } = await loadLesson('/x/', deps());
    expect(() => clips.frenchUrl(5)).toThrow('No sentence 5');
  });
});
