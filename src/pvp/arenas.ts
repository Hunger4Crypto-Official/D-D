export type ArenaMode = 'capture_the_ledger' | 'control' | 'elimination';

export interface ArenaObjective {
  id: string;
  description: string;
  scoring: 'progressive' | 'tick' | 'capture';
}

export interface ArenaDefinition {
  mode: ArenaMode;
  teams: number;
  max_players: number;
  objectives: string[];
  rotation?: 'ranked' | 'seasonal' | 'skirmish';
  modifiers?: string[];
  rewards?: {
    coins?: number;
    xp?: number;
    items?: string[];
  };
}

export const ARENAS: Record<string, ArenaDefinition> = {
  consensus_colosseum: {
    mode: 'capture_the_ledger',
    teams: 2,
    max_players: 10,
    objectives: ['central_node', 'alpha_terminal', 'beta_terminal'],
    rotation: 'ranked',
    modifiers: ['ledger_flux'],
    rewards: { coins: 200, xp: 80, items: ['colosseum_banner'] }
  },
  vault_spires: {
    mode: 'control',
    teams: 3,
    max_players: 12,
    objectives: ['spire_a', 'spire_b', 'spire_c'],
    rotation: 'seasonal',
    modifiers: ['elevated_platforms'],
    rewards: { coins: 180, xp: 65 }
  }
};

export const ARENA_OBJECTIVES: Record<string, ArenaObjective> = {
  central_node: {
    id: 'central_node',
    description: 'Capture and hold the core ledger node to score consensus ticks.',
    scoring: 'tick'
  },
  alpha_terminal: {
    id: 'alpha_terminal',
    description: 'A flanking terminal providing speed boosts when secured.',
    scoring: 'progressive'
  },
  beta_terminal: {
    id: 'beta_terminal',
    description: 'Defensive terminal that deploys shield drones to the team in control.',
    scoring: 'progressive'
  },
  spire_a: {
    id: 'spire_a',
    description: 'Upper spire rewarding aerial dominance.',
    scoring: 'capture'
  },
  spire_b: {
    id: 'spire_b',
    description: 'Mid spire generating focus pulses.',
    scoring: 'tick'
  },
  spire_c: {
    id: 'spire_c',
    description: 'Lower spire granting defensive wards.',
    scoring: 'tick'
  }
};

export function getArenaByMode(mode: ArenaMode): ArenaDefinition[] {
  return Object.values(ARENAS).filter((arena) => arena.mode === mode);
}
