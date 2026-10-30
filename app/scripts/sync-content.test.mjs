import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncContent } from './sync-content.mjs';

let dir, source, target;

function write(rel, content = 'x') {
  const path = join(source, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(
    path,
    typeof content === 'string' ? content : JSON.stringify(content),
  );
}

function buildFolder() {
  const manifest = {
    items: [
      { target_file: 's01_target.m4a', meaning_file: 's01_meaning.m4a' },
      { target_file: 's02_target.m4a', meaning_file: 's02_meaning.m4a' },
    ],
    end_cue: { file: 'cues/en.m4a' },
  };
  write('index.json', {
    cues: { en: { file: 'cues/en.m4a' } },
    lessons: [{ manifest: 'fr-en/lesson-01/manifest.json' }],
  });
  write('fr-en/lesson-01/manifest.json', manifest);
  for (const item of manifest.items) {
    write(`fr-en/lesson-01/${item.target_file}`);
    write(`fr-en/lesson-01/${item.meaning_file}`);
  }
  write('cues/en.m4a');
}

const files = (path) => readdirSync(path, { recursive: true }).sort();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sync-'));
  source = join(dir, 'build');
  target = join(dir, 'public', 'lessons');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('syncContent', () => {
  it('copies the index, the cues and every lesson folder', () => {
    buildFolder();
    expect(syncContent(source, target)).toEqual(['fr-en/lesson-01']);
    expect(files(target)).toContain('index.json');
    expect(files(target)).toContain(join('cues', 'en.m4a'));
    expect(files(target)).toContain(
      join('fr-en', 'lesson-01', 'manifest.json'),
    );
    expect(files(target)).toContain(
      join('fr-en', 'lesson-01', 's02_meaning.m4a'),
    );
  });

  it('removes what an earlier sync left behind', () => {
    buildFolder();
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'old.txt'), 'x');
    syncContent(source, target);
    expect(files(target)).not.toContain('old.txt');
  });

  it('fails with a clear message when there is no index', () => {
    mkdirSync(source, { recursive: true });
    expect(() => syncContent(source, target)).toThrow(
      /No index\.json.*pipeline\.py build/,
    );
  });

  it('names a missing clip and copies nothing', () => {
    buildFolder();
    unlinkSync(join(source, 'fr-en/lesson-01/s02_target.m4a'));
    expect(() => syncContent(source, target)).toThrow(
      /fr-en\/lesson-01\/s02_target\.m4a: file is missing \(listed in fr-en\/lesson-01\/manifest\.json\)/,
    );
    expect(() => readdirSync(target)).toThrow();
  });

  it('names a missing cue, a missing manifest and an empty clip', () => {
    buildFolder();
    unlinkSync(join(source, 'cues/en.m4a'));
    write('fr-en/lesson-01/s01_meaning.m4a', '');
    let message = '';
    try {
      syncContent(source, target);
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain(
      'cues/en.m4a: file is missing (listed in index.json, cue en)',
    );
    expect(message).toContain('fr-en/lesson-01/s01_meaning.m4a: file is empty');

    unlinkSync(join(source, 'fr-en/lesson-01/manifest.json'));
    expect(() => syncContent(source, target)).toThrow(
      /fr-en\/lesson-01\/manifest\.json: file is missing \(listed in index\.json\)/,
    );
  });

  it('rejects an index that is not an index', () => {
    write('index.json', { hello: 1 });
    expect(() => syncContent(source, target)).toThrow(/not a build index/);
  });
});
