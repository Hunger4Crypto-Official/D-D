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

export default db;
