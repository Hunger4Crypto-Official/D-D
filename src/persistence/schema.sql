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

CREATE TABLE IF NOT EXISTS pvp_records (
  user_id TEXT PRIMARY KEY,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  rating INTEGER DEFAULT 1200,
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

CREATE TABLE IF NOT EXISTS world_events_active (
  event_id TEXT,
  server_id TEXT,
  start_time INTEGER,
  end_time INTEGER,
  community_progress_json TEXT,
  participants_json TEXT,
  PRIMARY KEY(event_id, server_id)
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

CREATE TABLE IF NOT EXISTS player_guilds (
  guild_id TEXT PRIMARY KEY,
  owner_id TEXT,
  name TEXT UNIQUE,
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS player_guild_members (
  guild_id TEXT,
  user_id TEXT,
  role TEXT,
  joined_at INTEGER,
  PRIMARY KEY(guild_id, user_id),
  FOREIGN KEY (guild_id) REFERENCES player_guilds(guild_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_guild_invites (
  invite_id TEXT PRIMARY KEY,
  guild_id TEXT,
  inviter_id TEXT,
  invitee_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER,
  responded_at INTEGER,
  FOREIGN KEY (guild_id) REFERENCES player_guilds(guild_id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (invitee_id) REFERENCES users(user_id) ON DELETE CASCADE
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

-- Card and deck tables
CREATE TABLE IF NOT EXISTS player_decks (
  deck_id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  theme TEXT,
  cards_json TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS active_buffs (
  run_id TEXT,
  user_id TEXT,
  buff_id TEXT,
  source_card TEXT,
  duration INTEGER,
  created_at INTEGER,
  PRIMARY KEY(run_id, user_id, buff_id),
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nft_ownership (
  user_id TEXT,
  wallet_address TEXT,
  chain TEXT,
  nft_ids TEXT,
  verified_at INTEGER,
  PRIMARY KEY(user_id, chain),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_verifications (
  user_id TEXT,
  wallet_address TEXT,
  chain TEXT,
  challenge TEXT,
  created_at INTEGER,
  status TEXT,
  verified_at INTEGER,
  PRIMARY KEY(user_id, chain),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nft_rewards (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  wallet_address TEXT,
  chain TEXT,
  asset_id TEXT,
  reward_type TEXT,
  metadata_json TEXT,
  minted_at INTEGER,
  tx_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_collection (
  user_id TEXT,
  card_id TEXT,
  quantity INTEGER DEFAULT 1,
  obtained_at INTEGER,
  source TEXT,
  PRIMARY KEY(user_id, card_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vault_rooms (
  room_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  room_type TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  capacity INTEGER DEFAULT 5,
  decorations_json TEXT DEFAULT '[]',
  effects_json TEXT DEFAULT '[]',
  visitors_json TEXT DEFAULT '[]',
  active INTEGER DEFAULT 1,
  created_at INTEGER,
  last_updated INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vault_visits (
  visitor_id TEXT,
  host_id TEXT,
  visited_at INTEGER,
  rewards_json TEXT,
  PRIMARY KEY(visitor_id, host_id, visited_at)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT,
  achievement_id TEXT,
  earned_at INTEGER,
  PRIMARY KEY(user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS tournaments (
  tournament_id TEXT PRIMARY KEY,
  name TEXT,
  format TEXT,
  status TEXT,
  max_participants INTEGER,
  current_round INTEGER,
  total_rounds INTEGER,
  start_time INTEGER,
  end_time INTEGER,
  entry_fee_json TEXT,
  prizes_json TEXT,
  rules_json TEXT,
  metadata_json TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS tournament_registrations (
  tournament_id TEXT,
  user_id TEXT,
  registered_at INTEGER,
  seed REAL,
  PRIMARY KEY(tournament_id, user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tournament_brackets (
  tournament_id TEXT,
  round INTEGER,
  match_id TEXT PRIMARY KEY,
  player1_id TEXT,
  player2_id TEXT,
  winner_id TEXT,
  loser_id TEXT,
  scores_json TEXT,
  status TEXT,
  scheduled_time INTEGER,
  created_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tournament_prizes (
  tournament_id TEXT,
  user_id TEXT,
  placement TEXT,
  prizes_json TEXT,
  awarded_at INTEGER,
  PRIMARY KEY(tournament_id, user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tournament_bans (
  user_id TEXT,
  reason TEXT,
  issued_at INTEGER,
  expires_at INTEGER,
  PRIMARY KEY(user_id)
);
