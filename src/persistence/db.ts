import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { CFG } from '../config.js';

const dir = path.dirname(CFG.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

class PerformanceMonitor {
  private writeCount = 0;
  private startTime = Date.now();
  private readonly interval: NodeJS.Timer;

  constructor(intervalMs = 30_000) {
    this.interval = setInterval(() => this.logStats(), intervalMs);
    if (typeof this.interval.unref === 'function') {
      this.interval.unref();
    }
  }

  recordWrite() {
    this.writeCount++;
  }

  private logStats() {
    const elapsed = Math.max((Date.now() - this.startTime) / 1000, 1);
    const writesPerSecond = this.writeCount / elapsed;
    console.log(`Database: ${writesPerSecond.toFixed(1)} writes/sec`);
    this.writeCount = 0;
    this.startTime = Date.now();
  }
}

type WriteOperation = () => void;

class DatabaseManager {
  private db: Database;
  private writeQueue: WriteOperation[] = [];
  private processing = false;
  private readonly monitor: PerformanceMonitor;
  private readonly interval: NodeJS.Timer;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.monitor = new PerformanceMonitor();
    this.interval = setInterval(() => this.processWrites(), 50);
    if (typeof this.interval.unref === 'function') {
      this.interval.unref();
    }
  }

  prepare(query: string) {
    const stmt = this.db.prepare(query);
    return {
      get: (...params: any[]) => stmt.get(...params),
      all: (...params: any[]) => stmt.all(...params),
      run: (...params: any[]) =>
        this.queueWrite(() => {
          stmt.run(...params);
          this.monitor.recordWrite();
        }),
    };
  }

  exec(sql: string) {
    return this.db.exec(sql);
  }

  private queueWrite(operation: WriteOperation) {
    this.writeQueue.push(operation);
    if (this.writeQueue.length >= 100) {
      this.processWrites();
    }
  }

  private processWrites(force = false) {
    if (this.processing) return;
    if (!force && this.writeQueue.length === 0) return;

    this.processing = true;

    try {
      while (this.writeQueue.length > 0) {
        const operations = this.writeQueue.splice(0, 100);
        const transaction = this.db.transaction((ops: WriteOperation[]) => {
          for (const op of ops) {
            op();
          }
        });
        transaction(operations);
      }
    } catch (error) {
      console.error('Batch write failed:', error);
    } finally {
      this.processing = false;

      if (force && this.writeQueue.length > 0) {
        this.processWrites(true);
      }
    }
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.processing) {
          setTimeout(check, 10);
          return;
        }

        if (this.writeQueue.length === 0) {
          resolve();
          return;
        }

        this.processWrites(true);

        if (this.writeQueue.length === 0) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };

      check();
    });
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
  db
    .flush()
    .catch((error) => {
      console.error('Error flushing database queue during shutdown:', error);
    })
    .finally(() => {
      const timer = setTimeout(() => process.exit(0), 1000);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });
};

process.once('SIGTERM', () => handleShutdown('SIGTERM'));
process.once('SIGINT', () => handleShutdown('SIGINT'));

export default db;
export { DatabaseManager };
