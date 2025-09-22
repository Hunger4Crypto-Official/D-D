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
  focus INTEGER DEFAULT 10,
  flags_json TEXT DEFAULT '{}',
  last_gm_ts INTEGER,
  last_gn_ts INTEGER,
  coins INTEGER DEFAULT 0,
  gems INTEGER DEFAULT 0,
  last_weekly_claim INTEGER,
  weekly_streak INTEGER DEFAULT 0,
  selected_role TEXT,
  CHECK (level >= 1),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventories (
  user_id TEXT,
  item_id TEXT,
  kind TEXT,
  rarity TEXT,
  qty INTEGER DEFAULT 1,
  meta_json TEXT DEFAULT '{}',
  PRIMARY KEY(user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

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
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS difficulty_snapshots (
  run_id TEXT,
  scene_id TEXT,
  snapshot_ts INTEGER,
  tier TEXT,
  dc_offset INTEGER,
  inputs_json TEXT
);

CREATE TABLE IF NOT EXISTS economy_ledger (
  txn_id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT,
  amount INTEGER,
  reason TEXT,
  meta_json TEXT,
  ts INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT,
  user_id TEXT,
  type TEXT,
  payload_json TEXT,
  ts INTEGER
);

CREATE TABLE IF NOT EXISTS pity (
  user_id TEXT,
  pack_id TEXT,
  opened INTEGER DEFAULT 0,
  last_rarity TEXT,
  PRIMARY KEY(user_id, pack_id)
);

CREATE TABLE IF NOT EXISTS user_runs (
  user_id TEXT,
  run_id TEXT,
  role_id TEXT,
  scene_id TEXT,
  status TEXT DEFAULT 'active',
  created_at INTEGER,
  updated_at INTEGER,
  PRIMARY KEY(user_id, run_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS licenses (
  guild_id TEXT PRIMARY KEY,
  tier TEXT,
  features_json TEXT,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_runs_guild ON runs(guild_id);
CREATE INDEX IF NOT EXISTS idx_user_runs_status ON user_runs(user_id, status);
