// What the lesson picker shows and remembers, without any DOM, so it can be tested.

import type { IndexLesson } from './audio/index';

export interface Choice {
  pair: string;
  lesson: string;
}

export interface PairGroup {
  pair: string;
  /** For example "French → English": the language being learned, then the explanation language. */
  label: string;
  lessons: IndexLesson[];
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Lessons grouped by language pair, in the order of the index. */
export function groupByPair(
  lessons: IndexLesson[],
  nameOf: (code: string) => string = languageName,
): PairGroup[] {
  const groups = new Map<string, PairGroup>();
  for (const lesson of lessons) {
    let group = groups.get(lesson.pair);
    if (!group) {
      group = {
        pair: lesson.pair,
        label: `${nameOf(lesson.target_lang)} → ${nameOf(lesson.meaning_lang)}`,
        lessons: [],
      };
      groups.set(lesson.pair, group);
    }
    group.lessons.push(lesson);
  }
  return [...groups.values()];
}

/** "8 sentences · 29 s", or "· 2 min" from one minute on. */
export function describeLesson(lesson: IndexLesson): string {
  const length =
    lesson.seconds < 60
      ? `${Math.round(lesson.seconds)} s`
      : `${Math.round(lesson.seconds / 60)} min`;
  const noun = lesson.sentences === 1 ? 'sentence' : 'sentences';
  return `${lesson.sentences} ${noun} · ${length}`;
}

/** The remembered choice if that lesson still exists, otherwise the first lesson. */
export function initialChoice(
  groups: PairGroup[],
  saved: Choice | undefined,
): Choice | undefined {
  const exists = groups.some(
    (g) =>
      g.pair === saved?.pair &&
      g.lessons.some((l) => l.lesson === saved.lesson),
  );
  if (saved && exists) return saved;
  const first = groups[0]?.lessons[0];
  return first && { pair: first.pair, lesson: first.lesson };
}

export function parseSavedChoice(raw: string | null): Choice | undefined {
  try {
    const value: unknown = raw === null ? undefined : JSON.parse(raw);
    if (typeof value === 'object' && value !== null) {
      const { pair, lesson } = value as Record<string, unknown>;
      if (typeof pair === 'string' && typeof lesson === 'string')
        return { pair, lesson };
    }
  } catch {
    // not JSON: treated as nothing saved
  }
  return undefined;
}
