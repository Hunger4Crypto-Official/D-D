export type Tier = 'normal'|'tough'|'epic'|'mythic';

export function computeHiddenTier(avgLevel: number, avgPower: number, debuffBias = 0, manualBias = 0): {
  tier: Tier;
  dcOffset: number;
} {
  const normalizedLevel = avgLevel / 5; // level 5 feels like mid-game
  const normalizedPower = avgPower / 120; // roughly 0-2 range for gear
  const totalBias = manualBias * 0.5; // admin adjustment -3..+3 => -1.5..1.5
  const penalty = debuffBias * 0.6;
  const score = normalizedLevel + normalizedPower + totalBias - penalty;

  let tier: Tier = 'normal';
  let dc = 0;
  if (score >= 1.4) {
    tier = 'tough';
    dc = 2;
  }
  if (score >= 2.2) {
    tier = 'epic';
    dc = 5;
  }
  if (score >= 3.0) {
    tier = 'mythic';
    dc = 7;
  }
  return { tier, dcOffset: dc };
}

export function flavorForTier(tier:Tier): string {
  switch(tier){
    case 'normal': return 'The runes breathe steady, like the vault is listening.';
    case 'tough':  return 'The runes tighten; challenges sharpen like fresh-cut crystal.';
    case 'epic':   return 'Even the air crackles; the vault stares back and does not blink.';
    case 'mythic': return 'The room sings in a pitch that rattles molars; the Ledger bares old teeth.';
  }
}
