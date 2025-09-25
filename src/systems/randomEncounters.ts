export interface EncounterRequirement {
  min_scene?: string;
  max_scene?: string;
  tags_all?: string[];
  tags_any?: string[];
}

export interface EncounterReward {
  shop_discount?: number;
  rare_items?: boolean;
  items?: string[];
  buffs?: string[];
  xp?: number;
  coins?: number;
}

export interface RandomEncounter {
  id: string;
  chance: number;
  requirements?: EncounterRequirement;
  combat?: boolean;
  scaling?: 'party_level' | 'scene_tier' | 'fixed';
  duration_rounds?: number;
  rewards?: EncounterReward;
  description?: string;
}

export const RANDOM_ENCOUNTERS: RandomEncounter[] = [
  {
    id: 'wandering_merchant',
    chance: 0.05,
    requirements: { min_scene: '2.1' },
    rewards: { shop_discount: 20, rare_items: true },
    description: 'A merchant drifting through the ledger corridors offers rare wares in exchange for harmony tokens.'
  },
  {
    id: 'gremlin_ambush',
    chance: 0.1,
    combat: true,
    scaling: 'party_level',
    description: 'A band of gremlins leaps from the rafters demanding proof of strength before letting the party proceed.'
  },
  {
    id: 'lost_archivist',
    chance: 0.08,
    requirements: { tags_any: ['lorehunter'] },
    rewards: { items: ['archival_key'], xp: 45 },
    description: 'An archivist trapped between shelves needs help finding the exit, rewarding the party with a spare key.'
  },
  {
    id: 'consensus_echo',
    chance: 0.06,
    requirements: { min_scene: '3.4', tags_all: ['ritualist'] },
    scaling: 'scene_tier',
    rewards: { buffs: ['echo_of_precision'], xp: 60 },
    description: 'A lingering echo of consensus offers a ritual challenge that grants a precision buff when solved.'
  },
  {
    id: 'ledger_glitch',
    chance: 0.03,
    combat: false,
    scaling: 'fixed',
    rewards: { coins: 120 },
    description: 'A ledger glitch spills coins into the corridor. Recover as much as possible before the auditors arrive.'
  },
  {
    id: 'custodian_probe',
    chance: 0.02,
    combat: true,
    scaling: 'scene_tier',
    requirements: { min_scene: 'boss.custodian' },
    rewards: { items: ['custodian_relic'], xp: 120 },
    description: 'A fragment of the Stone Custodian scans the area, challenging the party to prove they deserve its relic.'
  }
];

export function rollEncounter(available: RandomEncounter[], rng: () => number): RandomEncounter | null {
  const roll = rng();
  let cumulative = 0;
  for (const encounter of available) {
    cumulative += encounter.chance;
    if (roll <= cumulative) {
      return encounter;
    }
  }
  return null;
}

export function filterEncounters(options: {
  encounters?: RandomEncounter[];
  scene?: string;
  tags?: string[];
}): RandomEncounter[] {
  const { encounters = RANDOM_ENCOUNTERS, scene, tags = [] } = options;
  return encounters.filter((encounter) => {
    const req = encounter.requirements;
    if (!req) return true;
    if (req.min_scene && scene && scene < req.min_scene) return false;
    if (req.max_scene && scene && scene > req.max_scene) return false;
    if (req.tags_all && !req.tags_all.every((tag) => tags.includes(tag))) return false;
    if (req.tags_any && !req.tags_any.some((tag) => tags.includes(tag))) return false;
    return true;
  });
}
