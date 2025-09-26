import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { CFG } from '../config.js';

const dir = path.dirname(CFG.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(CFG.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function loadSchema(): string {
  const candidates = [
    new URL('./schema.sql', import.meta.url),
    new URL('../../src/persistence/schema.sql', import.meta.url),
  ];

  for (const url of candidates) {
    try {
      return fs.readFileSync(url, 'utf-8');
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      if (code !== 'ENOENT') {
        throw err;
      }
    }
  }

  throw new Error('Unable to load persistence schema.sql – ensure it is present in dist or src.');
}

const schema = loadSchema();
db.exec(schema);

if (process.argv.includes('--reset')) {
  db.exec('PRAGMA writable_schema=1; DELETE FROM sqlite_master WHERE type IN ("table","index","trigger"); PRAGMA writable_schema=0; VACUUM;');
  db.exec(schema);
  console.log('DB reset OK');
  process.exit(0);
}

export default db;
