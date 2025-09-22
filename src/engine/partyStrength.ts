import db from '../persistence/db.js';
import { aggregateBonus } from '../ui/equipment.js';

export interface PartyDifficultyInputs {
  avgLevel: number;
  avgPower: number;
  debuffBias: number;
  members: {
    user_id: string;
    level: number;
    equipmentPower: number;
    hpRatio: number;
    focusRatio: number;
    downed: boolean;
  }[];
}

function equipmentPowerScore(user_id: string) {
  const agg = aggregateBonus(user_id);
  let score = 0;
  score += Math.abs(agg.dcOffset) * 40;
  score += Math.abs(agg.dcShift) * 25;
  score += agg.focusBonus * 15;
  score += agg.hpBonus * 6;
  score += agg.sleightBonus * 20;
  if (agg.rerollFail) score += 35;
  if (agg.neutralizeCritFail) score += 30;
  if (agg.fragmentsBoost) score += agg.fragmentsBoost * 5;
  if (agg.preventsCoinLoss) score += 10;
  score += agg.advantageTags.length * 6;
  score -= agg.disadvantageTags.length * 4;
  return score;
}

export function calculatePartyDifficultyInputs(run: any): PartyDifficultyInputs {
  const party = (run.party_id as string)?.split(',').filter(Boolean) ?? [];
  if (party.length === 0) {
    return { avgLevel: 1, avgPower: 0, debuffBias: 0, members: [] };
  }
  const members: PartyDifficultyInputs['members'] = [];
  let levelSum = 0;
  let powerSum = 0;
  let debuffSum = 0;
  for (const user_id of party) {
    const profile = db
      .prepare('SELECT level, hp, hp_max, focus, focus_max, downed_at FROM profiles WHERE user_id=?')
      .get(user_id) as { level?: number; hp?: number; hp_max?: number; focus?: number; focus_max?: number; downed_at?: number } | undefined;
    const level = profile?.level && profile.level > 0 ? profile.level : 1;
    const hpMax = profile?.hp_max && profile.hp_max > 0 ? profile.hp_max : 20;
    const focusMax = profile?.focus_max && profile.focus_max > 0 ? profile.focus_max : 10;
    const hpRatio = Math.max(0, Math.min(1, (profile?.hp ?? hpMax) / hpMax));
    const focusRatio = Math.max(0, Math.min(1, (profile?.focus ?? focusMax) / focusMax));
    const downed = Boolean(profile?.downed_at);
    const eqPower = equipmentPowerScore(user_id);

    let debuff = 0;
    if (hpRatio < 0.6) {
      debuff += (0.6 - hpRatio) * 4;
    }
    if (focusRatio < 0.6) {
      debuff += (0.6 - focusRatio) * 4;
    }
    if (downed) {
      debuff += 3;
    }

    members.push({ user_id, level, equipmentPower: eqPower, hpRatio, focusRatio, downed });
    levelSum += level;
    powerSum += eqPower;
    debuffSum += debuff;
  }
  return {
    avgLevel: levelSum / party.length,
    avgPower: powerSum / party.length,
    debuffBias: debuffSum / party.length,
    members,
  };
}
