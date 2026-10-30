// Shape of build/index.json: the list of everything that is built
// (contract: content/schema/index.schema.json). The app reads only this file to find lessons.

import { checkVersion, fail, isObject, num, str } from './manifest';

export interface IndexLesson {
  pair: string;
  lesson: string;
  title: string;
  target_lang: string;
  meaning_lang: string;
  sentences: number;
  seconds: number;
  /** Path of the manifest, relative to the lessons folder. */
  manifest: string;
}

export interface BuildIndex {
  lessons: IndexLesson[];
}

export function parseIndex(json: unknown): BuildIndex {
  const kind = 'index';
  if (!isObject(json)) fail(kind, 'not an object');
  checkVersion(kind, json);
  if (!Array.isArray(json.lessons)) fail(kind, '"lessons" must be a list');
  return {
    lessons: json.lessons.map((entry: unknown) => {
      if (!isObject(entry)) fail(kind, 'a lesson entry is not an object');
      return {
        pair: str(kind, entry, 'pair'),
        lesson: str(kind, entry, 'lesson'),
        title: str(kind, entry, 'title'),
        target_lang: str(kind, entry, 'target_lang'),
        meaning_lang: str(kind, entry, 'meaning_lang'),
        sentences: num(kind, entry, 'sentences'),
        seconds: num(kind, entry, 'seconds'),
        manifest: str(kind, entry, 'manifest'),
      };
    }),
  };
}
