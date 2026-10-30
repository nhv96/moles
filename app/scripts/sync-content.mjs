// Copies the built lessons (content/build) into public/lessons so Vite serves them.
// public/lessons is git-ignored.
//
// It reads content/build/index.json, checks that every file the index and the manifests
// list exists, and only then copies: index.json, the end cues (cues/), and one folder per
// lesson (<pair>/<lesson>/). A missing file stops the copy and is reported by name.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(path, name, problems) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    problems.push(
      `${name}: ${error.code === 'ENOENT' ? 'file is missing' : `cannot be read as JSON (${error.message})`}`,
    );
    return null;
  }
}

/** Throws an Error listing every problem, or returns the lessons that were copied. */
export function syncContent(source, target) {
  const hint =
    'Run "uv run scripts/pipeline.py build fr-en/lesson-01" in content/ first.';
  const problems = [];
  const indexPath = join(source, 'index.json');
  if (!existsSync(indexPath)) {
    throw new Error(`No index.json in ${source}. ${hint}`);
  }
  const index = readJson(indexPath, 'index.json', problems);
  if (!index || !Array.isArray(index.lessons) || !index.cues) {
    throw new Error(
      [
        ...problems,
        'index.json: not a build index (see schema/index.schema.json)',
      ]
        .map((p) => `  ${p}`)
        .join('\n'),
    );
  }

  const needFile = (rel, listedIn) => {
    const path = join(source, rel);
    if (!existsSync(path) || !statSync(path).isFile()) {
      problems.push(`${rel}: file is missing (listed in ${listedIn})`);
    } else if (statSync(path).size === 0) {
      problems.push(`${rel}: file is empty (listed in ${listedIn})`);
    }
  };

  for (const [lang, cue] of Object.entries(index.cues)) {
    needFile(cue.file, `index.json, cue ${lang}`);
  }
  const folders = [];
  for (const entry of index.lessons) {
    if (!existsSync(join(source, entry.manifest))) {
      problems.push(
        `${entry.manifest}: file is missing (listed in index.json)`,
      );
      continue;
    }
    const manifest = readJson(
      join(source, entry.manifest),
      entry.manifest,
      problems,
    );
    if (!manifest) continue;
    const folder = dirname(entry.manifest);
    folders.push(folder);
    for (const item of manifest.items ?? []) {
      needFile(`${folder}/${item.target_file}`, entry.manifest);
      needFile(`${folder}/${item.meaning_file}`, entry.manifest);
    }
    needFile(manifest.end_cue?.file, entry.manifest);
  }
  if (problems.length > 0) {
    throw new Error(
      `The build in ${source} is incomplete:\n${problems.map((p) => `  ${p}`).join('\n')}\n${hint}`,
    );
  }

  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(indexPath, join(target, 'index.json'));
  for (const cue of Object.values(index.cues)) {
    mkdirSync(dirname(join(target, cue.file)), { recursive: true });
    cpSync(join(source, cue.file), join(target, cue.file));
  }
  for (const folder of folders) {
    cpSync(join(source, folder), join(target, folder), { recursive: true });
  }
  return folders;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const copied = syncContent(
      join(root, '..', 'content', 'build'),
      join(root, 'public', 'lessons'),
    );
    for (const folder of copied) console.log(`Copied ${folder}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
