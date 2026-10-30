import { describe, expect, it } from 'vitest';
import { parseIndex } from './index';

const entry = {
  pair: 'fr-en',
  lesson: 'lesson-01',
  title: 'Introduce yourself',
  target_lang: 'fr',
  meaning_lang: 'en',
  sentences: 8,
  seconds: 29.27,
  manifest: 'fr-en/lesson-01/manifest.json',
};
const valid = {
  schema_version: 1,
  cues: { en: { text: 'Done.', file: 'cues/en.m4a', seconds: 2 } },
  lessons: [entry],
};

describe('parseIndex', () => {
  it('accepts an index from the content pipeline', () => {
    const index = parseIndex(valid);
    expect(index.lessons).toEqual([entry]);
  });

  it('accepts an index without lessons', () => {
    expect(parseIndex({ ...valid, lessons: [] }).lessons).toEqual([]);
  });

  it.each([
    ['not an object', 'x'],
    ['an unknown schema version', { ...valid, schema_version: 2 }],
    ['no lessons list', { ...valid, lessons: undefined }],
    [
      'an entry without a manifest',
      { ...valid, lessons: [{ ...entry, manifest: '' }] },
    ],
    [
      'an entry with no sentences',
      { ...valid, lessons: [{ ...entry, sentences: 0 }] },
    ],
  ])('rejects %s', (_name, json) => {
    expect(() => parseIndex(json)).toThrow(/Invalid index/);
  });
});
