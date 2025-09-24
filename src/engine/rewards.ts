import { Effect } from '../models.js';

export function thresholdRewards(
  sleight: number,
  thresholds?: { sleight_gte?: number; rewards: Effect[] }[],
) {
  if (!thresholds) return [] as Effect[];
  const available = thresholds
    .filter((t) => typeof t.sleight_gte === 'number' && sleight >= (t.sleight_gte ?? 0))
    .sort((a, b) => (b.sleight_gte ?? 0) - (a.sleight_gte ?? 0))[0];
  return available?.rewards || [];
}

export function groupBonusAllSurvive(): Effect[] {
  return [{type:'coins', value:500}, {type:'xp', value:0, id:'xp_mult_20'}];
}

export function loneSurvivor(): Effect[] {
  return [{type:'coins', value:250}, {type:'xp', value:250}];
}
