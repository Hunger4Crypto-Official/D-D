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

CREATE TABLE IF NOT EXISTS equipment_loadouts (
  user_id TEXT,
  slot TEXT,
  item_id TEXT,
  durability INTEGER DEFAULT 100,
  max_durability INTEGER DEFAULT 100,
  set_key TEXT,
  equipped_at INTEGER,
  PRIMARY KEY(user_id, slot),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seasonal_badges (
  user_id TEXT,
  season_id TEXT,
  version TEXT,
  earned_at INTEGER,
  PRIMARY KEY(user_id, season_id, version)
);

CREATE TABLE IF NOT EXISTS minigame_scores (
  user_id TEXT,
  minigame_id TEXT,
  best_score INTEGER,
  last_played INTEGER,
  PRIMARY KEY(user_id, minigame_id)
);

CREATE TABLE IF NOT EXISTS shop_rotations (
  rotation_id TEXT PRIMARY KEY,
  active_from INTEGER,
  active_to INTEGER,
  packs_json TEXT,
  items_json TEXT
);

CREATE TABLE IF NOT EXISTS pvp_matches (
  match_id TEXT PRIMARY KEY,
  kind TEXT,
  status TEXT,
  participants_json TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  result_json TEXT
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

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  gm_reward INTEGER DEFAULT 25,
  gn_reward INTEGER DEFAULT 25,
  xp_reward INTEGER DEFAULT 1,
  difficulty_bias INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS feature_flags (
  guild_id TEXT,
  feature TEXT,
  enabled INTEGER DEFAULT 1,
  updated_at INTEGER,
  PRIMARY KEY(guild_id, feature)
);

CREATE TABLE IF NOT EXISTS content_overrides (
  guild_id TEXT,
  content_id TEXT,
  scene_id TEXT,
  override_json TEXT,
  updated_at INTEGER,
  PRIMARY KEY(guild_id, content_id, scene_id)
);

CREATE TABLE IF NOT EXISTS shop_packs (
  pack_id TEXT PRIMARY KEY,
  definition_json TEXT,
  rotation_tag TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS gem_orders (
  order_id TEXT PRIMARY KEY,
  user_id TEXT,
  network TEXT,
  tx_id TEXT,
  amount INTEGER,
  gems INTEGER,
  status TEXT,
  meta_json TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_runs_guild ON runs(guild_id);
CREATE INDEX IF NOT EXISTS idx_user_runs_status ON user_runs(user_id, status);
