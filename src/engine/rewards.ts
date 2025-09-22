import { Effect } from '../models.js';

export function thresholdRewards(sleight:number, thresholds?: {sleight_gte:number; rewards: Effect[]}[]){
  if (!thresholds) return [] as Effect[];
  const best = thresholds.filter(t => sleight >= t.sleight_gte).sort((a,b)=>b.sleight_gte-a.sleight_gte)[0];
  return best?.rewards || [];
}

export function groupBonusAllSurvive(): Effect[] {
  return [{type:'coins', value:500}, {type:'xp', value:0, id:'xp_mult_20'}];
}

export function loneSurvivor(): Effect[] {
  return [{type:'coins', value:250}, {type:'xp', value:250}];
}
