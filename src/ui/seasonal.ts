import fs from 'fs-extra';
import path from 'node:path';
import { CFG } from '../config.js';
import { startRun } from '../engine/orchestrator.js';

interface SeasonInfo {
  id: string;
  title: string;
  version: string;
  description: string;
}

function seasonsRoot() {
  return path.join(CFG.contentRoot, 'seasons');
}

export function listSeasons(): SeasonInfo[] {
  const root = seasonsRoot();
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root);
  const seasons: SeasonInfo[] = [];
  for (const entry of entries) {
    const manifestPath = path.join(root, entry, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = fs.readJSONSync(manifestPath) as any;
      seasons.push({
        id: entry,
        title: manifest.book_name || entry,
        version: manifest.version || '1.0.0',
        description: manifest.description || 'Seasonal event',
      });
    } catch (err) {
      console.warn('Failed to load season manifest', entry, err);
    }
  }
  return seasons;
}

export function startSeasonalRun(user_id: string, guild_id: string, channel_id: string, seasonId: string) {
export function startSeasonalRun(user_id: string, channel_id: string, seasonId: string) {
  const seasonPath = path.join('seasons', seasonId);
  const manifestPath = path.join(CFG.contentRoot, seasonPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Season not found');
  }
  const run_id = startRun(guild_id, channel_id, [user_id], seasonPath, '6.1')
  const run_id = startRun('global', channel_id, [user_id], seasonPath, '6.1');
  return run_id;
}
