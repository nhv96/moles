// Shape of content/build/<lesson>/manifest.json, written by the content generator.

export interface ManifestItem {
  id: string;
  fr: string;
  en: string;
  fr_file: string;
  en_file: string;
  fr_seconds: number;
  en_seconds: number;
}

export interface Manifest {
  lesson: string;
  title: string;
  items: ManifestItem[];
  finished_cue: { id: string; en: string; file: string; seconds: number };
}

function fail(what: string): never {
  throw new Error(`Invalid manifest: ${what}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value === '')
    fail(`"${key}" must be a non-empty string`);
  return value;
}

function num(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(`"${key}" must be a positive number`);
  }
  return value;
}

export function parseManifest(json: unknown): Manifest {
  if (!isObject(json)) fail('not an object');
  const { items, finished_cue: cue } = json;
  if (!Array.isArray(items) || items.length === 0)
    fail('"items" must be a non-empty list');
  if (!isObject(cue)) fail('"finished_cue" is missing');
  return {
    lesson: str(json, 'lesson'),
    title: str(json, 'title'),
    items: items.map((item: unknown) => {
      if (!isObject(item)) fail('an item is not an object');
      return {
        id: str(item, 'id'),
        fr: str(item, 'fr'),
        en: str(item, 'en'),
        fr_file: str(item, 'fr_file'),
        en_file: str(item, 'en_file'),
        fr_seconds: num(item, 'fr_seconds'),
        en_seconds: num(item, 'en_seconds'),
      };
    }),
    finished_cue: {
      id: str(cue, 'id'),
      en: str(cue, 'en'),
      file: str(cue, 'file'),
      seconds: num(cue, 'seconds'),
    },
  };
}
