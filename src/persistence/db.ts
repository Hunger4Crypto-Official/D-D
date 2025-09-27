import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { CFG } from '../config.js';

const dir = path.dirname(CFG.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

class DatabaseManager {
  private readonly db: Database;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
  }

  prepare(query: string) {
    return this.db.prepare(query);
  }

  exec(sql: string) {
    return this.db.exec(sql);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  get connection() {
    return this.db;
  }
}

const db = new DatabaseManager(CFG.dbPath);

function loadSchema(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, 'schema.sql'),
    path.resolve(moduleDir, '../../src/persistence/schema.sql'),
    path.resolve(process.cwd(), 'src', 'persistence', 'schema.sql'),
    path.resolve(process.cwd(), 'dist', 'persistence', 'schema.sql'),
    path.resolve(process.cwd(), 'schema.sql'),
  ];

  const attempts: string[] = [];

  for (const candidate of candidates) {
    try {
      return fs.readFileSync(candidate, 'utf-8');
    } catch (err) {
      const error = err as NodeJS.ErrnoException | undefined;
      const code = error ? error.code : undefined;
      if (code !== 'ENOENT') {
        console.warn('Error reading schema candidate:', candidate, err);
      }

      const reason =
        code === 'ENOENT'
          ? 'missing file'
          : error && typeof error.message === 'string'
          ? error.message
          : String(err);
      attempts.push(`${candidate} (${reason})`);
    }
  }

  const attemptedPaths = attempts.map(path => `  - ${path}`).join('\n');
  throw new Error(
    [
      'Failed to load schema.sql. The runtime looks for a checked-in schema alongside the compiled files.',
      'Ensure schema.sql is copied next to dist/persistence/db.js (or set CFG.dbPath to a directory that contains it).',
      'The following locations were tried without success:',
      attemptedPaths,
    ].join('\n')
  );
}

const schema = loadSchema();
db.exec(schema);

if (process.argv.includes('--reset')) {
  db.exec('PRAGMA writable_schema=1; DELETE FROM sqlite_master WHERE type IN ("table","index","trigger"); PRAGMA writable_schema=0; VACUUM;');
  db.exec(schema);
  console.log('DB reset OK');
  process.exit(0);
}

const handleShutdown = (signal: NodeJS.Signals) => {
  console.log(`Graceful shutdown (${signal})...`);
  try {
    db.close();
  } catch (error) {
    console.error('Error closing database during shutdown:', error);
  } finally {
    const timer = setTimeout(() => process.exit(0), 1000) as unknown as NodeJS.Timer;
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }
};

process.once('SIGTERM', () => handleShutdown('SIGTERM'));
process.once('SIGINT', () => handleShutdown('SIGINT'));

export default db;
export { DatabaseManager };
