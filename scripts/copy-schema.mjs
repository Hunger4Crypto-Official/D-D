import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const source = join(root, 'src', 'persistence', 'schema.sql');
const target = join(root, 'dist', 'persistence', 'schema.sql');

try {
  statSync(source);
} catch (error) {
  console.error('Missing schema.sql in src/persistence. Cannot copy schema to build output.');
  process.exitCode = 1;
  process.exit();
}

mkdirSync(dirname(target), { recursive: true });

try {
  copyFileSync(source, target);
  console.log(`Copied schema.sql to ${target}`);
} catch (error) {
  console.error('Failed to copy schema.sql to build output:', error);
  process.exitCode = 1;
}
import fs from 'fs';
import path from 'path';

const source = path.resolve('src', 'persistence', 'schema.sql');
const destination = path.resolve('dist', 'persistence', 'schema.sql');

if (!fs.existsSync(source)) {
  throw new Error(`Schema file not found at ${source}`);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);

console.log(`Copied schema.sql to ${destination}`);
