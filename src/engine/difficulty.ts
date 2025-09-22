export type Tier = 'normal'|'tough'|'epic'|'mythic';

export function computeHiddenTier(avgLevel: number, avgPower: number, debuffBias=0): {tier:Tier, dcOffset:number} {
  const phi = 1.618;
  const scale = (avgLevel + avgPower/100) / 10 / phi - debuffBias*0.2;
  let tier: Tier = 'normal';
  let dc = 0;
  if (scale > 1.2) { tier='tough'; dc=+2; }
  if (scale > 2.0) { tier='epic'; dc=+5; }
  if (scale > 2.8) { tier='mythic'; dc=+7; }
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
