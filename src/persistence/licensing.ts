import { CFG } from '../config.js';
import db from './db.js';

export interface LicenseRecord {
  guild_id: string;
  tier?: string;
  features_json?: string;
  expires_at?: number | null;
}

function parseFeatures(json?: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.map((f) => `${f}`);
    }
    if (parsed && typeof parsed === 'object') {
      return Object.keys(parsed).filter((key) => parsed[key]);
    }
  } catch (err) {
    console.warn('Failed to parse license features', err);
  }
  return [];
}

export function guildHasLicense(guild_id?: string | null): boolean {
  if (!guild_id) return true; // direct messages
  if (CFG.homeGuildId && guild_id === CFG.homeGuildId) return true;
  if (CFG.allowedGuilds.includes(guild_id)) return true;
  const row = db
    .prepare('SELECT tier, expires_at FROM licenses WHERE guild_id=?')
    .get(guild_id) as { tier?: string; expires_at?: number } | undefined;
  if (!row) return false;
  if (row.expires_at && row.expires_at < Date.now()) return false;
  return true;
}

export function licenseFeatures(guild_id?: string | null): string[] {
  if (!guild_id) return [];
  if (CFG.homeGuildId && guild_id === CFG.homeGuildId) {
    return ['campaign', 'shop', 'seasonal', 'pvp', 'minigames', 'gems'];
  }
  const row = db
    .prepare('SELECT features_json FROM licenses WHERE guild_id=?')
    .get(guild_id) as { features_json?: string } | undefined;
  const features = parseFeatures(row?.features_json);
  return features;
}

export function featureEnabled(guild_id: string | null | undefined, feature: string): boolean {
  if (!guild_id) return true;
  if (CFG.homeGuildId && guild_id === CFG.homeGuildId) return true;
  if (CFG.allowedGuilds.includes(guild_id)) return true;
  const override = db
    .prepare('SELECT enabled FROM feature_flags WHERE guild_id=? AND feature=?')
    .get(guild_id, feature) as { enabled?: number } | undefined;
  if (override) {
    return Boolean(override.enabled);
  }
  const features = licenseFeatures(guild_id);
  if (features.length === 0) return false;
  return features.includes(feature);
}

export function upsertLicense(record: LicenseRecord) {
  db.prepare(
    `INSERT INTO licenses (guild_id, tier, features_json, expires_at)
     VALUES (?,?,?,?)
     ON CONFLICT(guild_id) DO UPDATE SET
       tier=excluded.tier,
       features_json=excluded.features_json,
       expires_at=excluded.expires_at`
  ).run(record.guild_id, record.tier ?? null, record.features_json ?? null, record.expires_at ?? null);
}

export function setFeatureFlag(guild_id: string, feature: string, enabled: boolean) {
  db.prepare(
    `INSERT INTO feature_flags (guild_id, feature, enabled, updated_at)
     VALUES (?,?,?,?)
     ON CONFLICT(guild_id, feature) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at`
  ).run(guild_id, feature, enabled ? 1 : 0, Date.now());
}

export function listLicenses(): LicenseRecord[] {
  return db
    .prepare('SELECT guild_id, tier, features_json, expires_at FROM licenses ORDER BY guild_id')
    .all() as LicenseRecord[];
}
