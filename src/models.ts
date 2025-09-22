export type UserId = string;
export type GuildId = string;
export type RunId = string;

export interface Effect {
  type: 'hp' | 'focus' | 'coins' | 'xp' | 'flag' | 'item' | 'fragment' | 'gem' | 'buff' | 'debuff' | 'unlock';
  op?: '+' | '-' | '=';
  value?: number | string | boolean;
  id?: string; // for items/buffs
  target?: string;
}

export interface EquipmentBonus {
  dcShift?: number;
  dcOffset?: number;
  advantageTags?: string[];
  disadvantageTags?: string[];
  focusBonus?: number;
  hpBonus?: number;
  sleightBonus?: number;
  rerollFail?: boolean;
  neutralizeCritFail?: boolean;
  fragmentsBoost?: number;
  preventsCoinLoss?: boolean;
}

export interface Outcome {
  effects: Effect[];
  next_hint?: string;
  narration?: string;
}

export interface ActionDef {
  id: string;
  label: string;
  requirements?: {
    items_any?: string[];
    flags_all?: string[];
  };
  roll?: { kind: 'phi_d20'; tags?: string[] };
  outcomes: {
    crit_success?: Outcome;
    success?: Outcome;
    fail?: Outcome;
    crit_fail?: Outcome;
  };
  banter?: Record<string,string>;
  telemetry_tags?: string[];
}

export interface RoundDef {
  round_id: string;
  description: string;
  actions: ActionDef[];
}

export interface SceneDef {
  schema_version: string;
  content_id: string; // 'genesis'
  book_id: string;    // 'book_1'
  scene_id: string;   // '1.1'
  title: string;
  narration: string;
  rounds: RoundDef[];
  threshold_rewards?: { sleight_gte:number; rewards: Effect[] }[];
  arrivals?: { when: string; goto: string }[];
}

export interface Manifest {
  content_id: string;
  version: string;
  book_name: string;
  scenes: string[];
  schema_version?: string;
}

export interface DropTable {
  pack_id: string;
  cost: { coins?: number; gems?: number };
  pity?: { rare_after?: number; epic_after?: number };
  weights: Record<string,number>;
  pools: Record<string,{kind:string; id:string; rarity?:string}[]>;
}

export interface Compliments { lines: string[] }

export interface Checkpoint {
  run_id: RunId;
  guild_id: GuildId;
  channel_id: string;
  party_id: string;
  content_id: string;
  content_version: string;
  scene_id: string;
  round_id: string;
  micro_ix: number;
  rng_seed: string;
  flags_json: any;
  sleight_score: number;
  updated_at: number;
}

export interface PvPMatch {
  format: '1v1' | '3v3' | 'guild_war' | 'tournament';
  ruleset: {
    banList: string[];
    draftPhase: boolean;
    handicaps: Record<string, number>;
  };
  stakes: {
    entryFee: { coins: number; gems: number };
    winnerTakeAll: boolean;
    leaderboardPoints: number;
  };
  spectators: string[];
}

export interface TournamentBracket {
  id: string;
  participants: string[];
  prizes: { first: Effect[]; second: Effect[]; third: Effect[] };
  sponsorship: { sponsor: string; bonusRewards: Effect[] };
}

export interface VaultRoom {
  type: 'workshop' | 'shrine' | 'trophy_hall' | 'gremlin_den';
  level: number;
  decorations: string[];
  activeEffects: EquipmentBonus[];
}

export interface PlayerVault {
  rooms: VaultRoom[];
  decorations: { id: string; slot?: string }[];
  visitors: { user_id: string; timestamp: number }[];
  upgrades: {
    storage: number;
    workshop: number;
    shrine: number;
  };
}
