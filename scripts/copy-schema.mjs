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
