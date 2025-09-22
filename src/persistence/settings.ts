import db from './db.js';

export interface GuildSettings {
  guild_id: string;
  gm_reward: number;
  gn_reward: number;
  xp_reward: number;
  difficulty_bias: number;
}

const DEFAULT_SETTINGS: GuildSettings = {
  guild_id: 'global',
  gm_reward: 25,
  gn_reward: 25,
  xp_reward: 1,
  difficulty_bias: 0,
};

export function getGuildSettings(guild_id?: string | null): GuildSettings {
  if (!guild_id) {
    return { ...DEFAULT_SETTINGS, guild_id: 'global' };
  }
  const row = db
    .prepare(
      'SELECT guild_id, gm_reward, gn_reward, xp_reward, difficulty_bias FROM guild_settings WHERE guild_id=?'
    )
    .get(guild_id) as GuildSettings | undefined;
  if (!row) {
    return { ...DEFAULT_SETTINGS, guild_id };
  }
  return {
    guild_id,
    gm_reward: row.gm_reward ?? DEFAULT_SETTINGS.gm_reward,
    gn_reward: row.gn_reward ?? DEFAULT_SETTINGS.gn_reward,
    xp_reward: row.xp_reward ?? DEFAULT_SETTINGS.xp_reward,
    difficulty_bias: row.difficulty_bias ?? DEFAULT_SETTINGS.difficulty_bias,
  };
}

export function upsertGuildSettings(guild_id: string, settings: Partial<GuildSettings>) {
  const now = Date.now();
  const current = getGuildSettings(guild_id);
  const merged: GuildSettings = {
    ...current,
    ...settings,
    guild_id,
  };
  const existingRow = db
    .prepare('SELECT created_at FROM guild_settings WHERE guild_id=?')
    .get(guild_id) as { created_at?: number } | undefined;
  const createdAt = existingRow?.created_at ?? now;
  db.prepare(
    `INSERT INTO guild_settings (guild_id, gm_reward, gn_reward, xp_reward, difficulty_bias, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(guild_id) DO UPDATE SET
       gm_reward=excluded.gm_reward,
       gn_reward=excluded.gn_reward,
       xp_reward=excluded.xp_reward,
       difficulty_bias=excluded.difficulty_bias,
       updated_at=excluded.updated_at`
  ).run(guild_id, merged.gm_reward, merged.gn_reward, merged.xp_reward, merged.difficulty_bias, createdAt, now);
}

export function deleteGuildSettings(guild_id: string) {
  db.prepare('DELETE FROM guild_settings WHERE guild_id=?').run(guild_id);
}
