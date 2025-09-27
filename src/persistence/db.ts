import fs from 'fs';
import path from 'path';
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
  // Try multiple paths for schema.sql
  const candidates = [
    // In production dist folder
    path.resolve(process.cwd(), 'dist', 'persistence', 'schema.sql'),
    // In source folder (development)
    path.resolve(process.cwd(), 'src', 'persistence', 'schema.sql'),
    // Using import.meta.url (current working approach)
    new URL('./schema.sql', import.meta.url),
    new URL('../../src/persistence/schema.sql', import.meta.url),
    // Fallback to root directory
    path.resolve(process.cwd(), 'schema.sql'),
  ];

  for (const candidate of candidates) {
    try {
      const filePath = candidate instanceof URL ? candidate : candidate;
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      if (code !== 'ENOENT') {
        console.warn('Error reading schema candidate:', candidate, err);
      }
      // Continue to next candidate
    }
  }

  // If no schema file found, provide inline schema as fallback
  console.warn('No schema.sql file found, using inline schema');
  return getInlineSchema();
}

function getInlineSchema(): string {
  // Inline schema as fallback - you can copy your schema.sql content here
  return `
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  class TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  hp INTEGER DEFAULT 20,
  hp_max INTEGER DEFAULT 20,
  focus INTEGER DEFAULT 10,
  focus_max INTEGER DEFAULT 10,
  flags_json TEXT DEFAULT '{}',
  last_gm_ts INTEGER,
  last_gn_ts INTEGER,
  coins INTEGER DEFAULT 0,
  gems INTEGER DEFAULT 0,
  fragments INTEGER DEFAULT 0,
  last_weekly_claim INTEGER,
  weekly_streak INTEGER DEFAULT 0,
  selected_role TEXT,
  downed_at INTEGER,
  loadout_hash TEXT,
  CHECK (level >= 1),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Add the rest of your schema here, or better yet, copy it from your actual schema.sql file
-- This is just a minimal example to get you started

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  guild_id TEXT,
  channel_id TEXT,
  party_id TEXT,
  content_id TEXT,
  content_version TEXT,
  scene_id TEXT,
  round_id TEXT,
  micro_ix INTEGER,
  rng_seed TEXT,
  flags_json TEXT,
  sleight_score INTEGER DEFAULT 0,
  sleight_history_json TEXT DEFAULT '[]',
  active_user_id TEXT,
  turn_order_json TEXT,
  turn_expires_at INTEGER,
  afk_tracker_json TEXT DEFAULT '{}',
  ui_message_id TEXT,
  ui_channel_id TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- Continue with the rest of your tables...
`;
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
