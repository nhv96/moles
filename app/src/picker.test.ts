import { describe, expect, it } from 'vitest';
import type { IndexLesson } from './audio/index';
import {
  describeLesson,
  groupByPair,
  initialChoice,
  languageName,
  parseSavedChoice,
} from './picker';

const lesson = (over: Partial<IndexLesson>): IndexLesson => ({
  pair: 'fr-en',
  lesson: 'lesson-01',
  title: 'Introduce yourself',
  target_lang: 'fr',
  meaning_lang: 'en',
  sentences: 8,
  seconds: 29.27,
  manifest: 'fr-en/lesson-01/manifest.json',
  ...over,
});

const lessons = [
  lesson({}),
  lesson({ lesson: 'lesson-02' }),
  lesson({
    pair: 'en-vi',
    lesson: 'lesson-01',
    target_lang: 'en',
    meaning_lang: 'vi',
  }),
];

describe('languageName', () => {
  it('turns codes into names, and keeps a code it does not know', () => {
    expect(languageName('fr')).toBe('French');
    expect(languageName('vi')).toBe('Vietnamese');
    expect(languageName('not a code!')).toBe('not a code!');
  });
});

describe('groupByPair', () => {
  it('groups lessons by pair in the order of the index', () => {
    const groups = groupByPair(lessons);
    expect(groups.map((g) => g.pair)).toEqual(['fr-en', 'en-vi']);
    expect(groups.map((g) => g.label)).toEqual([
      'French → English',
      'English → Vietnamese',
    ]);
    expect(groups[0].lessons.map((l) => l.lesson)).toEqual([
      'lesson-01',
      'lesson-02',
    ]);
  });

  it('has no groups without lessons', () => {
    expect(groupByPair([])).toEqual([]);
  });
});

describe('describeLesson', () => {
  it('shows seconds under a minute and minutes after', () => {
    expect(describeLesson(lesson({}))).toBe('8 sentences · 29 s');
    expect(describeLesson(lesson({ seconds: 130, sentences: 12 }))).toBe(
      '12 sentences · 2 min',
    );
    expect(describeLesson(lesson({ sentences: 1, seconds: 5 }))).toBe(
      '1 sentence · 5 s',
    );
  });
});

describe('initialChoice', () => {
  const groups = groupByPair(lessons);

  it('uses the remembered lesson when it still exists', () => {
    expect(
      initialChoice(groups, { pair: 'en-vi', lesson: 'lesson-01' }),
    ).toEqual({
      pair: 'en-vi',
      lesson: 'lesson-01',
    });
  });

  it('falls back to the first lesson when the remembered one is gone', () => {
    const first = { pair: 'fr-en', lesson: 'lesson-01' };
    expect(
      initialChoice(groups, { pair: 'sv-en', lesson: 'lesson-01' }),
    ).toEqual(first);
    expect(
      initialChoice(groups, { pair: 'fr-en', lesson: 'lesson-09' }),
    ).toEqual(first);
    expect(initialChoice(groups, undefined)).toEqual(first);
  });

  it('chooses nothing when there are no lessons', () => {
    expect(initialChoice([], undefined)).toBeUndefined();
  });
});

describe('parseSavedChoice', () => {
  it('reads a saved choice and ignores anything else', () => {
    expect(parseSavedChoice('{"pair":"fr-en","lesson":"lesson-01"}')).toEqual({
      pair: 'fr-en',
      lesson: 'lesson-01',
    });
    for (const raw of [
      null,
      '',
      'oops',
      '[]',
      '{"pair":1}',
      '{"pair":"fr-en"}',
    ])
      expect(parseSavedChoice(raw)).toBeUndefined();
  });
});
