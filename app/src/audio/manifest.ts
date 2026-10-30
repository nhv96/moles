// Shape of build/<pair>/<lesson>/manifest.json, written by the content pipeline
// (contract: content/schema/manifest.schema.json). Only what the app uses is read.

export const SUPPORTED_SCHEMA_VERSION = 1;

export interface ManifestItem {
  id: string;
  target: string;
  meaning: string;
  target_file: string;
  meaning_file: string;
  target_seconds: number;
  meaning_seconds: number;
}

export interface Manifest {
  lesson: string;
  pair: string;
  target_lang: string;
  meaning_lang: string;
  title: string;
  items: ManifestItem[];
  /** `file` is relative to the lessons folder, not to the lesson's own folder. */
  end_cue: { text: string; file: string; seconds: number };
}

export function fail(kind: string, what: string): never {
  throw new Error(`Invalid ${kind}: ${what}`);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function str(
  kind: string,
  obj: Record<string, unknown>,
  key: string,
): string {
  const value = obj[key];
  if (typeof value !== 'string' || value === '')
    fail(kind, `"${key}" must be a non-empty string`);
  return value;
}

export function num(
  kind: string,
  obj: Record<string, unknown>,
  key: string,
): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(kind, `"${key}" must be a positive number`);
  }
  return value;
}

/** Refuse files written for a contract version this app does not know. */
export function checkVersion(
  kind: string,
  json: Record<string, unknown>,
): void {
  if (json.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    fail(
      kind,
      `schema_version is ${String(json.schema_version)}, this app reads version ${SUPPORTED_SCHEMA_VERSION}`,
    );
  }
}

export function parseManifest(json: unknown): Manifest {
  const kind = 'manifest';
  if (!isObject(json)) fail(kind, 'not an object');
  checkVersion(kind, json);
  const { items, end_cue: cue } = json;
  if (!Array.isArray(items) || items.length === 0)
    fail(kind, '"items" must be a non-empty list');
  if (!isObject(cue)) fail(kind, '"end_cue" is missing');
  return {
    lesson: str(kind, json, 'lesson'),
    pair: str(kind, json, 'pair'),
    target_lang: str(kind, json, 'target_lang'),
    meaning_lang: str(kind, json, 'meaning_lang'),
    title: str(kind, json, 'title'),
    items: items.map((item: unknown) => {
      if (!isObject(item)) fail(kind, 'an item is not an object');
      return {
        id: str(kind, item, 'id'),
        target: str(kind, item, 'target'),
        meaning: str(kind, item, 'meaning'),
        target_file: str(kind, item, 'target_file'),
        meaning_file: str(kind, item, 'meaning_file'),
        target_seconds: num(kind, item, 'target_seconds'),
        meaning_seconds: num(kind, item, 'meaning_seconds'),
      };
    }),
    end_cue: {
      text: str(kind, cue, 'text'),
      file: str(kind, cue, 'file'),
      seconds: num(kind, cue, 'seconds'),
    },
  };
}
