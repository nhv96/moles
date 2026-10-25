// Copies the built lesson audio (content/build/lesson-*) into public/lessons so
// Vite serves it. public/lessons is git-ignored.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, '..', 'content', 'build');
const target = join(root, 'public', 'lessons');

const lessons = existsSync(source)
  ? readdirSync(source).filter((name) =>
      existsSync(join(source, name, 'manifest.json')),
    )
  : [];
if (lessons.length === 0) {
  console.error(
    `No built lessons in ${source}. Run "uv run scripts/generate_kokoro.py build" in content/ first.`,
  );
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
for (const name of lessons) {
  cpSync(join(source, name), join(target, name), { recursive: true });
  console.log(`Copied ${name}`);
}
