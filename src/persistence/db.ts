import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
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

  prepare<Params extends any[] = any[], Row = any>(query: string) {
    return this.db.prepare<Params, Row>(query);
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
  const candidates: (string | URL)[] = [
    path.resolve(process.cwd(), 'dist', 'persistence', 'schema.sql'),
    path.resolve(process.cwd(), 'src', 'persistence', 'schema.sql'),
    new URL('./schema.sql', import.meta.url),
    new URL('../../src/persistence/schema.sql', import.meta.url),
    path.resolve(process.cwd(), 'schema.sql'),
  ];

  const attempts: string[] = [];

  for (const candidate of candidates) {
    const filePath =
      candidate instanceof URL ? fileURLToPath(candidate) : candidate;
    attempts.push(filePath);

    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      if (code !== 'ENOENT') {
        throw new Error(
          `Failed to read schema from "${filePath}": ${(err as Error).message}`,
          { cause: err instanceof Error ? err : undefined },
        );
      }
    }
  }

  throw new Error(
    `Unable to locate schema.sql. Tried the following locations:\n${attempts
      .map((p) => ` - ${p}`)
      .join('\n')}`
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
    const timer = setTimeout(() => process.exit(0), 1000);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }
};

process.once('SIGTERM', () => handleShutdown('SIGTERM'));
process.once('SIGINT', () => handleShutdown('SIGINT'));

export default db;
export { DatabaseManager };
