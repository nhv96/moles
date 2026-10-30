import { describe, expect, it } from 'vitest';
import { parseManifest } from './manifest';

const valid = {
  schema_version: 1,
  lesson: 'lesson-01',
  pair: 'fr-en',
  target_lang: 'fr',
  meaning_lang: 'en',
  title: 'Introduce yourself',
  items: [
    {
      id: 's01',
      target: 'Bonjour.',
      meaning: 'Hello.',
      target_file: 's01_target.m4a',
      meaning_file: 's01_meaning.m4a',
      target_seconds: 1.2,
      meaning_seconds: 1,
      speed: 0.9,
      mode: 'whole',
    },
  ],
  end_cue: { text: 'Done.', file: 'cues/en.m4a', seconds: 2 },
};

describe('parseManifest', () => {
  it('accepts a manifest from the content pipeline', () => {
    const m = parseManifest(valid);
    expect(m.items).toHaveLength(1);
    expect(m.items[0].target_file).toBe('s01_target.m4a');
    expect(m.pair).toBe('fr-en');
    expect(m.end_cue.file).toBe('cues/en.m4a');
  });

  it.each([
    ['not an object', 'x'],
    ['an unknown schema version', { ...valid, schema_version: 2 }],
    [
      'the old format (no schema version)',
      { ...valid, schema_version: undefined },
    ],
    ['no items', { ...valid, items: [] }],
    ['no end cue', { ...valid, end_cue: undefined }],
    ['no pair', { ...valid, pair: '' }],
    [
      'item without a file',
      { ...valid, items: [{ ...valid.items[0], target_file: '' }] },
    ],
    [
      'item with a bad duration',
      { ...valid, items: [{ ...valid.items[0], meaning_seconds: 0 }] },
    ],
  ])('rejects %s', (_name, json) => {
    expect(() => parseManifest(json)).toThrow(/Invalid manifest/);
  });
});
