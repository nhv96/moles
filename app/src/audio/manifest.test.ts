import { describe, expect, it } from 'vitest';
import { parseManifest } from './manifest';

const valid = {
  lesson: 'lesson-01',
  title: 'Introduce yourself',
  items: [
    {
      id: 's01',
      fr: 'Bonjour.',
      en: 'Hello.',
      fr_file: 's01_fr.m4a',
      en_file: 's01_en.m4a',
      fr_seconds: 1.2,
      en_seconds: 1,
      speed: 0.9,
    },
  ],
  finished_cue: { id: 'end', en: 'Done.', file: 'end_en.m4a', seconds: 2 },
};

describe('parseManifest', () => {
  it('accepts a manifest from the content generator', () => {
    const m = parseManifest(valid);
    expect(m.items).toHaveLength(1);
    expect(m.items[0].fr_file).toBe('s01_fr.m4a');
    expect(m.finished_cue.file).toBe('end_en.m4a');
  });

  it.each([
    ['not an object', 'x'],
    ['no items', { ...valid, items: [] }],
    ['no finished cue', { ...valid, finished_cue: undefined }],
    [
      'item without a file',
      { ...valid, items: [{ ...valid.items[0], fr_file: '' }] },
    ],
    [
      'item with a bad duration',
      { ...valid, items: [{ ...valid.items[0], en_seconds: 0 }] },
    ],
  ])('rejects %s', (_name, json) => {
    expect(() => parseManifest(json)).toThrow(/Invalid manifest/);
  });
});
