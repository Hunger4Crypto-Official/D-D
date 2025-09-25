export type ResourceNodeType = 'ore' | 'essence' | 'ledger' | 'flora' | 'artifice';

export interface ResourceNode {
  id: string;
  type: ResourceNodeType;
  yield_per_hour: number;
  capacity: number;
  contested?: boolean;
}

export interface Defense {
  id: string;
  name: string;
  level: number;
  modifiers: {
    hp_bonus?: number;
    focus_bonus?: number;
    damage_reduction?: number;
    trap_difficulty?: number;
  };
  upkeep_cost: number;
}

export interface Territory {
  id: string;
  owner_guild: string;
  resources: ResourceNode[];
  defenses: Defense[];
  conquest_points: number;
  morale: number;
  contested_by?: string[];
}

export class TerritoryManager {
  private territories = new Map<string, Territory>();

  registerTerritory(territory: Territory): void {
    this.territories.set(territory.id, territory);
  }

  listTerritories(): Territory[] {
    return Array.from(this.territories.values());
  }

  claimTerritory(territoryId: string, guildId: string): Territory | null {
    const territory = this.territories.get(territoryId);
    if (!territory) return null;
    territory.owner_guild = guildId;
    territory.conquest_points = 0;
    territory.morale = 50;
    territory.contested_by = [];
    this.territories.set(territoryId, territory);
    return territory;
  }

  adjustConquest(territoryId: string, points: number): Territory | null {
    const territory = this.territories.get(territoryId);
    if (!territory) return null;
    territory.conquest_points = Math.max(0, territory.conquest_points + points);
    territory.morale = Math.min(100, Math.max(0, territory.morale + Math.sign(points) * 5));
    this.territories.set(territoryId, territory);
    return territory;
  }

  addContestant(territoryId: string, guildId: string): void {
    const territory = this.territories.get(territoryId);
    if (!territory) return;
    if (!territory.contested_by) territory.contested_by = [];
    if (!territory.contested_by.includes(guildId)) {
      territory.contested_by.push(guildId);
    }
  }
}

export const DEFAULT_TERRITORIES: Territory[] = [
  {
    id: 'ledger_bastion',
    owner_guild: 'neutral',
    conquest_points: 0,
    morale: 50,
    resources: [
      { id: 'ancient_ore', type: 'ore', yield_per_hour: 24, capacity: 480 },
      { id: 'ledger_bloom', type: 'flora', yield_per_hour: 12, capacity: 240 }
    ],
    defenses: [
      {
        id: 'resonant_barrier',
        name: 'Resonant Barrier',
        level: 1,
        modifiers: { damage_reduction: 0.1 },
        upkeep_cost: 50
      }
    ]
  },
  {
    id: 'custodian_watch',
    owner_guild: 'neutral',
    conquest_points: 0,
    morale: 55,
    resources: [
      { id: 'custodian_stone', type: 'artifice', yield_per_hour: 6, capacity: 90, contested: true },
      { id: 'gremlin_essence', type: 'essence', yield_per_hour: 18, capacity: 300 }
    ],
    defenses: [
      {
        id: 'stone_sentinels',
        name: 'Stone Sentinels',
        level: 2,
        modifiers: { hp_bonus: 150, trap_difficulty: 5 },
        upkeep_cost: 80
      }
    ]
  }
];
