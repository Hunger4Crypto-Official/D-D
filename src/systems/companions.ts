export type CompanionType = 'gremlin' | 'construct' | 'spirit';

export interface CompanionAbility {
  id: string;
  name: string;
  description: string;
  cooldown_rounds: number;
  tags: string[];
}

export interface Companion {
  id: string;
  type: CompanionType;
  level: number;
  abilities: CompanionAbility[];
  evolution_stage: number;
  bonding_level: number;
}

export const COMPANION_ABILITY_LIBRARY: Record<string, CompanionAbility> = {
  gremlin_mischief: {
    id: 'gremlin_mischief',
    name: 'Gremlin Mischief',
    description: 'Distracts enemies and lowers their focus for one round.',
    cooldown_rounds: 3,
    tags: ['debuff', 'support']
  },
  construct_aegis: {
    id: 'construct_aegis',
    name: 'Construct Aegis',
    description: 'Projects a shield that absorbs damage equal to your companion level x 5.',
    cooldown_rounds: 4,
    tags: ['defense']
  },
  spirit_echo: {
    id: 'spirit_echo',
    name: 'Spirit Echo',
    description: 'Amplifies the next ritual roll granting advantage.',
    cooldown_rounds: 2,
    tags: ['buff', 'ritual']
  }
};

export const COMPANION_REGISTRY: Record<string, Companion> = {
  ember_tail: {
    id: 'ember_tail',
    type: 'gremlin',
    level: 1,
    evolution_stage: 1,
    bonding_level: 0,
    abilities: [COMPANION_ABILITY_LIBRARY.gremlin_mischief]
  },
  wardforge: {
    id: 'wardforge',
    type: 'construct',
    level: 1,
    evolution_stage: 1,
    bonding_level: 0,
    abilities: [COMPANION_ABILITY_LIBRARY.construct_aegis]
  },
  aurora_wisp: {
    id: 'aurora_wisp',
    type: 'spirit',
    level: 1,
    evolution_stage: 1,
    bonding_level: 0,
    abilities: [COMPANION_ABILITY_LIBRARY.spirit_echo]
  }
};

export function evolveCompanion(companion: Companion): Companion {
  const upgraded: Companion = {
    ...companion,
    evolution_stage: companion.evolution_stage + 1,
    level: companion.level + 1,
    bonding_level: Math.min(100, companion.bonding_level + 10)
  };
  return upgraded;
}
