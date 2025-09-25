export interface Achievement {
  id: string;
  name: string;
  description: string;
  points: number;
  category: 'story' | 'combat' | 'exploration' | 'social' | 'seasonal' | 'collection';
  hidden?: boolean;
  requirements?: {
    scenes_completed?: string[];
    items_collected?: string[];
    stat_thresholds?: Record<string, number>;
    tags?: string[];
  };
  rewards?: {
    title?: string;
    cosmetics?: string[];
    items?: string[];
  };
}

export const ACHIEVEMENTS: Record<string, Achievement> = {
  first_steps: {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Complete Scene 1.1',
    points: 10,
    category: 'story',
    requirements: { scenes_completed: ['1.1'] }
  },
  gremlin_whisperer: {
    id: 'gremlin_whisperer',
    name: 'Gremlin Whisperer',
    description: 'Befriend 10 gremlins',
    points: 25,
    category: 'social',
    requirements: { stat_thresholds: { gremlins_befriended: 10 } },
    rewards: { title: 'Gremlin Whisperer' }
  },
  perfect_run: {
    id: 'perfect_run',
    name: 'Flawless Victory',
    description: 'Complete a scene with no damage',
    points: 50,
    category: 'combat',
    requirements: { tags: ['no_damage'] }
  },
  consensus_keeper: {
    id: 'consensus_keeper',
    name: 'Consensus Keeper',
    description: 'Stabilize five consensus fractures in raids.',
    points: 30,
    category: 'combat',
    requirements: { stat_thresholds: { fractures_stabilized: 5 } },
    rewards: { cosmetics: ['fracture_stabilizer_trail'] }
  },
  archivist: {
    id: 'archivist',
    name: 'Vault Archivist',
    description: 'Collect 50 lore fragments.',
    points: 40,
    category: 'collection',
    requirements: { stat_thresholds: { lore_fragments: 50 } }
  },
  seasonal_spirit: {
    id: 'seasonal_spirit',
    name: 'Seasonal Spirit',
    description: 'Complete all seasonal event scenes during an active festival.',
    points: 60,
    category: 'seasonal',
    requirements: { scenes_completed: ['halloween2025:all', 'summer_solstice:all'] }
  },
  raid_vanguard: {
    id: 'raid_vanguard',
    name: 'Raid Vanguard',
    description: 'Defeat the Stone Custodian within 12 rounds.',
    points: 80,
    category: 'combat',
    requirements: { scenes_completed: ['boss.custodian'], stat_thresholds: { rounds_elapsed: 12 } },
    rewards: { items: ['custodian_seal'] }
  },
  legendary_crafter: {
    id: 'legendary_crafter',
    name: 'Legendary Crafter',
    description: 'Craft your first legendary item.',
    points: 75,
    category: 'collection',
    requirements: { tags: ['legendary_crafted'] }
  },
  guild_founder: {
    id: 'guild_founder',
    name: 'Guild Founder',
    description: 'Establish a new guild and claim territory.',
    points: 55,
    category: 'social',
    requirements: { tags: ['guild_created'], scenes_completed: ['territory.claim'] }
  },
  voice_maestro: {
    id: 'voice_maestro',
    name: 'Voice Maestro',
    description: 'Complete a narrated run using the Voice RPG session tools.',
    points: 35,
    category: 'social',
    requirements: { tags: ['voice_session_clear'] }
  },
  telemetry_analyst: {
    id: 'telemetry_analyst',
    name: 'Telemetry Analyst',
    description: 'Generate a balance report from the analytics dashboard.',
    points: 20,
    category: 'exploration',
    requirements: { tags: ['balance_report_generated'] }
  },
  seasonal_speedrunner: {
    id: 'seasonal_speedrunner',
    name: 'Seasonal Speedrunner',
    description: 'Finish a seasonal scene in under three rounds.',
    points: 45,
    category: 'seasonal',
    requirements: { tags: ['seasonal_fast_clear'] }
  },
  perfect_collection: {
    id: 'perfect_collection',
    name: 'Complete Collection',
    description: 'Collect all cards from the Genesis set.',
    points: 120,
    category: 'collection',
    hidden: true,
    requirements: { tags: ['genesis_cards_complete'] }
  },
  arena_champion: {
    id: 'arena_champion',
    name: 'Consensus Colosseum Champion',
    description: 'Win ten matches in the Consensus Colosseum arena.',
    points: 65,
    category: 'combat',
    requirements: { stat_thresholds: { arena_wins: 10 } }
  },
  pet_whisperer: {
    id: 'pet_whisperer',
    name: 'Companion Whisperer',
    description: 'Level a companion to stage three.',
    points: 30,
    category: 'exploration',
    requirements: { stat_thresholds: { companion_stage_three: 1 } }
  },
  expeditionary: {
    id: 'expeditionary',
    name: 'Expeditionary Ledger',
    description: 'Complete 25 random encounters.',
    points: 30,
    category: 'exploration',
    requirements: { stat_thresholds: { random_encounters_cleared: 25 } }
  },
  revivalist: {
    id: 'revivalist',
    name: 'Ledger Revivalist',
    description: 'Restore a wiped raid using the state recovery system.',
    points: 55,
    category: 'story',
    requirements: { tags: ['state_recovery_success'] }
  },
  scholar_of_voices: {
    id: 'scholar_of_voices',
    name: 'Scholar of Voices',
    description: 'Unlock every ambient track in the voice system.',
    points: 25,
    category: 'exploration',
    requirements: { stat_thresholds: { voice_tracks_unlocked: 8 } }
  },
  marketplace_maven: {
    id: 'marketplace_maven',
    name: 'Marketplace Maven',
    description: 'Trade with the wandering merchant five times.',
    points: 30,
    category: 'social',
    requirements: { stat_thresholds: { merchant_trades: 5 } }
  },
  gremlin_librarian: {
    id: 'gremlin_librarian',
    name: 'Gremlin Librarian',
    description: 'Unlock every lore entry in the Hall of Records.',
    points: 90,
    category: 'story',
    hidden: true,
    requirements: { tags: ['records_completed'] }
  },
  solstice_guardian: {
    id: 'solstice_guardian',
    name: 'Solstice Guardian',
    description: 'Protect the solar engine during the Summer Solstice event.',
    points: 45,
    category: 'seasonal',
    requirements: { scenes_completed: ['summer_solstice:solar_engine_defense'] }
  }
};

export const ACHIEVEMENT_LIST = Object.values(ACHIEVEMENTS);
