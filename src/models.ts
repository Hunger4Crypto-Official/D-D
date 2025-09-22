export type UserId = string;
export type GuildId = string;
export type RunId = string;

export interface Effect {
  type: 'hp'|'focus'|'coins'|'xp'|'flag'|'item'|'fragment'|'gem'|'buff'|'debuff';
  op?: '+'|'-'|'=';
  value?: number | string | boolean;
  id?: string; // for items/buffs
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
