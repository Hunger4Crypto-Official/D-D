import db from '../persistence/db.js';
import { Effect } from '../models.js';

export interface GlobalEffect {
  type: 'multiplier' | 'bonus' | 'penalty' | 'advantage' | 'disadvantage' | 'unlock';
  target: string;
  value: number;
  description: string;
}

export interface CommunityGoal {
  description: string;
  target: number;
  current: number;
  rewards: Effect[];
  participantRewards: Effect[];
}

export interface ShopItem {
  id: string;
  cost: { coins?: number; gems?: number; fragments?: number };
  rarity: string;
  stock?: number;
}

export interface TriggerCondition {
  type:
    | 'total_wealth_threshold'
    | 'community_sleight_threshold'
    | 'community_flag'
    | 'random_chance'
    | 'rare_item_sacrificed'
    | 'moral_choice_threshold'
    | 'community_death_count';
  value: number | string;
}

export interface WorldEvent {
  id: string;
  name: string;
  description: string;
  duration: number;
  rarity: 'common' | 'rare' | 'legendary';
  globalEffects: GlobalEffect[];
  communityGoals?: CommunityGoal[];
  specialShop?: ShopItem[];
  triggerConditions?: TriggerCondition[];
}

export interface WorldEventInstance {
  eventId: string;
  serverId: string;
  startTime: number;
  endTime: number;
  communityProgress: {
    goalId: string;
    current: number;
    target: number;
    participants: Set<string>;
  }[];
  participants: Set<string>;
}

export const WORLD_EVENTS: WorldEvent[] = [
  {
    id: 'great_rug_pull',
    name: "The Great Rug Pull",
    description: 'Market confidence shattered! Coins are scarce but fragments crystallize from the chaos.',
    duration: 72,
    rarity: 'common',
    globalEffects: [
      { type: 'multiplier', target: 'coins', value: 0.5, description: 'All coin rewards halved' },
      { type: 'multiplier', target: 'fragments', value: 2.0, description: 'Fragment drops doubled' },
      { type: 'advantage', target: 'trader,whale', value: 1, description: 'Traders and Whales gain advantage on all actions' },
    ],
    communityGoals: [
      {
        description: 'Collectively lose 1,000,000 coins to unlock emergency reserves',
        target: 1_000_000,
        current: 0,
        rewards: [{ type: 'item', id: 'emergency_vault_key' }],
        participantRewards: [{ type: 'coins', value: 500 }],
      },
    ],
  },
  {
    id: 'gremlin_uprising',
    name: 'Gremlin Uprising',
    description: 'The gremlins have organized! Chaos reigns but mischief brings unexpected rewards.',
    duration: 48,
    rarity: 'rare',
    globalEffects: [
      { type: 'advantage', target: 'gremlin', value: 1, description: 'All gremlin-tagged actions get advantage' },
      { type: 'bonus', target: 'sleight', value: 2, description: '+2 sleight for successful gremlin interactions' },
      { type: 'unlock', target: 'gremlin_shops', value: 1, description: 'Special gremlin vendors appear' },
    ],
    specialShop: [
      { id: 'gremlin_crown_replica', cost: { coins: 50_000 }, rarity: 'epic' },
      { id: 'chaos_amplifier', cost: { fragments: 200 }, rarity: 'legendary' },
    ],
    communityGoals: [
      {
        description: 'Cause 10,000 gremlin-tagged chaos events',
        target: 10_000,
        current: 0,
        rewards: [{ type: 'flag', id: 'gremlin_emperor_unlocked', value: true }],
        participantRewards: [{ type: 'item', id: 'gremlin_badge_of_honor' }],
      },
    ],
  },
  {
    id: 'whale_migration',
    name: 'Whale Migration',
    description: 'Massive capital flows shift the market. Prices fluctuate wildly, fortunes are made and lost.',
    duration: 96,
    rarity: 'rare',
    globalEffects: [
      { type: 'multiplier', target: 'shop_prices', value: 1.5, description: 'All shop prices +50%' },
      { type: 'multiplier', target: 'rare_drops', value: 3.0, description: 'Rare item drop rate tripled' },
      { type: 'advantage', target: 'whale,trader', value: 1, description: 'Whales and Traders read market flows' },
    ],
    triggerConditions: [{ type: 'total_wealth_threshold', value: 10_000_000 }],
    specialShop: [
      { id: 'whale_song_resonator', cost: { coins: 100_000 }, rarity: 'mythic', stock: 3 },
      { id: 'market_prophet_scroll', cost: { gems: 500 }, rarity: 'legendary', stock: 10 },
    ],
  },
  {
    id: 'validator_strike',
    name: 'Validator Strike',
    description: 'The consensus mechanisms rebel! Validation fails, but alternative paths emerge.',
    duration: 24,
    rarity: 'common',
    globalEffects: [
      { type: 'penalty', target: 'validator', value: -5, description: 'Validator actions have -5 DC penalty' },
      { type: 'advantage', target: 'hacker,dev', value: 1, description: 'Hackers and Devs exploit the chaos' },
      { type: 'unlock', target: 'emergency_protocols', value: 1, description: 'Emergency protocol actions appear' },
    ],
    communityGoals: [
      {
        description: 'Successfully complete 500 non-validator actions to restore consensus',
        target: 500,
        current: 0,
        rewards: [{ type: 'xp', value: 1000 }],
        participantRewards: [{ type: 'item', id: 'consensus_restorer_badge' }],
      },
    ],
  },
  {
    id: 'meme_singularity',
    name: 'The Meme Singularity',
    description: 'Reality bends to humor. Logic fails, chaos succeeds, and laughter has mass.',
    duration: 12,
    rarity: 'legendary',
    globalEffects: [
      { type: 'advantage', target: 'meme', value: 2, description: 'Meme Lords get double advantage' },
      { type: 'penalty', target: 'serious_tags', value: -3, description: 'Serious actions penalized' },
      { type: 'bonus', target: 'joke_actions', value: 5, description: '+5 sleight for successful jokes' },
      { type: 'multiplier', target: 'gremlin_spawns', value: 10, description: 'Gremlins everywhere!' },
    ],
    specialShop: [
      { id: 'reality_distortion_field', cost: { fragments: 1000 }, rarity: 'mythic', stock: 1 },
      { id: 'infinite_jest_scroll', cost: { coins: 999_999 }, rarity: 'artifact', stock: 1 },
    ],
  },
  {
    id: 'ledger_awakening',
    name: 'The Ledger Awakens',
    description: 'The great Ledger stirs from slumber. Ancient knowledge flows, but at a price.',
    duration: 168,
    rarity: 'legendary',
    globalEffects: [
      { type: 'advantage', target: 'insight,rune,puzzle', value: 1, description: 'Ancient wisdom guides seekers' },
      { type: 'multiplier', target: 'xp', value: 1.5, description: 'All XP gains increased 50%' },
      { type: 'unlock', target: 'primordial_scenes', value: 1, description: 'Ancient scenes become accessible' },
    ],
    triggerConditions: [
      { type: 'community_sleight_threshold', value: 50_000 },
      { type: 'rare_item_sacrificed', value: 'primordial_key' },
    ],
    communityGoals: [
      {
        description: 'Collectively gain 100,000 XP to fully awaken the Ledger',
        target: 100_000,
        current: 0,
        rewards: [{ type: 'unlock', target: 'ledger_champion_class', value: 1 }],
        participantRewards: [{ type: 'item', id: 'awakened_insight_crystal' }],
      },
    ],
  },
  {
    id: 'forge_masters_trial',
    name: "Forge Master's Trial",
    description: 'The ancient forges reignite! Crafting becomes an art, and masters are born.',
    duration: 120,
    rarity: 'rare',
    globalEffects: [
      { type: 'multiplier', target: 'crafting_success', value: 2.0, description: 'Crafting success rates doubled' },
      { type: 'bonus', target: 'fragments', value: 10, description: '+10 fragments per successful craft' },
      { type: 'unlock', target: 'legendary_recipes', value: 1, description: 'Legendary crafting recipes available' },
    ],
    specialShop: [
      { id: 'master_forge_hammer', cost: { fragments: 500 }, rarity: 'epic' },
      { id: 'primordial_anvil_shard', cost: { gems: 200 }, rarity: 'legendary', stock: 5 },
    ],
    communityGoals: [
      {
        description: 'Craft 1,000 items during the trial',
        target: 1000,
        current: 0,
        rewards: [{ type: 'unlock', target: 'forge_master_title', value: 1 }],
        participantRewards: [{ type: 'item', id: 'apprentice_forge_badge' }],
      },
    ],
  },
  {
    id: 'chain_fork_crisis',
    name: 'The Chain Fork Crisis',
    description: 'Reality splits! Players must choose sides as parallel timelines emerge.',
    duration: 72,
    rarity: 'rare',
    globalEffects: [
      { type: 'unlock', target: 'timeline_choice', value: 1, description: 'Players must choose Timeline A or B' },
      { type: 'penalty', target: 'consensus_actions', value: -2, description: 'Consensus becomes harder' },
      { type: 'advantage', target: 'choice_actions', value: 1, description: 'Decisive actions rewarded' },
    ],
    communityGoals: [
      {
        description: 'Timeline A: Embrace order (Need 60% community support)',
        target: 1000,
        current: 0,
        rewards: [{ type: 'unlock', target: 'order_timeline_scenes', value: 1 }],
        participantRewards: [{ type: 'item', id: 'order_crystal' }],
      },
      {
        description: 'Timeline B: Embrace chaos (Need 60% community support)',
        target: 1000,
        current: 0,
        rewards: [{ type: 'unlock', target: 'chaos_timeline_scenes', value: 1 }],
        participantRewards: [{ type: 'item', id: 'chaos_shard' }],
      },
    ],
  },
  {
    id: 'custodian_judgment',
    name: "The Custodian's Judgment",
    description: 'The stone sentinel weighs all souls. Past choices echo through eternity.',
    duration: 48,
    rarity: 'legendary',
    globalEffects: [
      { type: 'bonus', target: 'integrity_actions', value: 3, description: 'Integrity actions highly rewarded' },
      { type: 'penalty', target: 'deception_actions', value: -5, description: 'Deception severely punished' },
      { type: 'unlock', target: 'judgment_scenes', value: 1, description: 'Special judgment encounters' },
    ],
    triggerConditions: [
      { type: 'community_flag', value: 'custodian_awakened' },
      { type: 'moral_choice_threshold', value: 10_000 },
    ],
    communityGoals: [
      {
        description: 'Prove community worth through 500 integrity-based actions',
        target: 500,
        current: 0,
        rewards: [{ type: 'unlock', target: 'custodian_blessing', value: 1 }],
        participantRewards: [{ type: 'item', id: 'judgment_seal' }],
      },
    ],
  },
  {
    id: 'memento_mori',
    name: 'Memento Mori',
    description: 'Death walks among the living. Equipment breaks, characters fall, but legends are born.',
    duration: 24,
    rarity: 'legendary',
    globalEffects: [
      { type: 'multiplier', target: 'durability_loss', value: 3.0, description: 'Equipment degrades 3x faster' },
      { type: 'multiplier', target: 'death_chance', value: 2.0, description: 'Critical failures more dangerous' },
      { type: 'multiplier', target: 'legendary_drops', value: 5.0, description: 'Legendary drops 5x more likely' },
      { type: 'bonus', target: 'survival_rewards', value: 10, description: '+10 sleight for surviving dangerous actions' },
    ],
    specialShop: [
      { id: 'phoenix_resurrection_token', cost: { gems: 1000 }, rarity: 'artifact', stock: 3 },
      { id: 'death_defiance_charm', cost: { fragments: 200 }, rarity: 'epic', stock: 20 },
    ],
    triggerConditions: [
      { type: 'random_chance', value: 0.01 },
      { type: 'community_death_count', value: 100 },
    ],
  },
];

export class WorldEventManager {
  private readonly activeEvents = new Map<string, WorldEventInstance>();

  async triggerEvent(eventId: string, serverId: string = 'global'): Promise<void> {
    const event = WORLD_EVENTS.find((e) => e.id === eventId);
    if (!event) return;

    const instance: WorldEventInstance = {
      eventId: event.id,
      serverId,
      startTime: Date.now(),
      endTime: Date.now() + event.duration * 60 * 60 * 1000,
      communityProgress:
        event.communityGoals?.map((goal) => ({
          goalId: goal.description,
          current: 0,
          target: goal.target,
          participants: new Set<string>(),
        })) ?? [],
      participants: new Set<string>(),
    };

    this.activeEvents.set(this.instanceKey(eventId, serverId), instance);
    await this.broadcastEventStart(event, instance);
    const timer = setTimeout(() => this.endEvent(instance), event.duration * 60 * 60 * 1000);
    const maybeUnref = (timer as { unref?: () => void }).unref;
    if (maybeUnref) maybeUnref.call(timer);
  }

  async checkEventTriggers(): Promise<void> {
    for (const event of WORLD_EVENTS) {
      if (!event.triggerConditions || event.triggerConditions.length === 0) continue;
      const shouldTrigger = await this.evaluateTriggerConditions(event.triggerConditions);
      if (shouldTrigger && !this.isEventActive(event.id)) {
        await this.triggerEvent(event.id);
      }
    }
  }

  getActiveEventsForAction(action: { roll?: { tags?: string[] } }, serverId: string): GlobalEffect[] {
    const effects: GlobalEffect[] = [];
    for (const [key, instance] of this.activeEvents.entries()) {
      const [, storedServer] = key.split(':');
      if (storedServer !== 'global' && storedServer !== serverId) continue;
      const event = WORLD_EVENTS.find((e) => e.id === instance.eventId);
      if (!event) continue;
      for (const effect of event.globalEffects) {
        if (this.effectApplies(effect, action)) {
          effects.push(effect);
        }
      }
    }
    return effects;
  }

  private effectApplies(effect: GlobalEffect, action: { roll?: { tags?: string[] } }): boolean {
    if (!action.roll) {
      return effect.target === 'all' || ['coins', 'xp', 'fragments'].includes(effect.target);
    }
    if (effect.target === 'all') return true;
    if (['coins', 'xp', 'fragments', 'shop_prices', 'crafting_success', 'rare_drops'].includes(effect.target)) return true;
    const tags = action.roll.tags ?? [];
    const targetTags = effect.target.split(',').map((tag) => tag.trim());
    return targetTags.some((tag) => tags.includes(tag));
  }

  private async broadcastEventStart(event: WorldEvent, instance: WorldEventInstance): Promise<void> {
    const message =
      `🌍 **${event.name}** has begun!\n\n${event.description}\n\nDuration: ${event.duration} hours\n\n${event.globalEffects
        .map((effect) => `• ${effect.description}`)
        .join('\n')}`;
    // Actual broadcast will depend on the bot runtime. For now we store a log entry for observability.
    db.prepare(
      'INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)'
    ).run(
      `world_event_${instance.eventId}_${instance.startTime}`,
      null,
      null,
      'world_event_started',
      JSON.stringify({ eventId: event.id, serverId: instance.serverId, duration: event.duration, message }),
      Date.now()
    );
  }

  private async evaluateTriggerConditions(conditions: TriggerCondition[]): Promise<boolean> {
    for (const condition of conditions) {
      const met = await this.checkTriggerCondition(condition);
      if (!met) {
        return false;
      }
    }
    return true;
  }

  private async checkTriggerCondition(condition: TriggerCondition): Promise<boolean> {
    switch (condition.type) {
      case 'total_wealth_threshold': {
        const row = db.prepare('SELECT SUM(coins) as coins, SUM(gems) as gems FROM profiles').get() as
          | { coins: number | null; gems: number | null }
          | undefined;
        const coins = row?.coins ?? 0;
        const gems = (row?.gems ?? 0) * 1000; // weight gems heavily to count toward wealth
        return coins + gems >= Number(condition.value);
      }
      case 'community_sleight_threshold': {
        const row = db
          .prepare('SELECT SUM(sleight_score) as total FROM runs WHERE updated_at >= ?')
          .get(Date.now() - 14 * 24 * 60 * 60 * 1000) as { total: number | null } | undefined;
        return (row?.total ?? 0) >= Number(condition.value);
      }
      case 'community_flag': {
        const flag = db
          .prepare(
            'SELECT enabled FROM feature_flags WHERE guild_id=? AND feature=?'
          )
          .get('global', condition.value) as { enabled?: number } | undefined;
        return (flag?.enabled ?? 0) === 1;
      }
      case 'random_chance': {
        const value = Number(condition.value);
        return Math.random() < value;
      }
      case 'rare_item_sacrificed': {
        const count = db
          .prepare(
            "SELECT COUNT(1) as cnt FROM events WHERE type='item_sacrificed' AND json_extract(payload_json,'$.item_id') = ?"
          )
          .get(condition.value) as { cnt: number | null } | undefined;
        return (count?.cnt ?? 0) > 0;
      }
      case 'moral_choice_threshold': {
        const score = db
          .prepare(
            "SELECT SUM(json_extract(payload_json,'$.integrity_score')) as total FROM events WHERE type='moral_choice'"
          )
          .get() as { total: number | null } | undefined;
        return (score?.total ?? 0) >= Number(condition.value);
      }
      case 'community_death_count': {
        const deaths = db
          .prepare("SELECT COUNT(1) as cnt FROM events WHERE type='player_downed' OR type='player_death'")
          .get() as { cnt: number | null } | undefined;
        return (deaths?.cnt ?? 0) >= Number(condition.value);
      }
      default:
        return false;
    }
  }

  private endEvent(instance: WorldEventInstance) {
    const key = this.instanceKey(instance.eventId, instance.serverId);
    if (!this.activeEvents.has(key)) return;
    this.activeEvents.delete(key);
    db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)').run(
      `world_event_${instance.eventId}_${instance.endTime}`,
      null,
      null,
      'world_event_ended',
      JSON.stringify({ eventId: instance.eventId, serverId: instance.serverId }),
      Date.now()
    );
  }

  private isEventActive(eventId: string, serverId: string = 'global'): boolean {
    return this.activeEvents.has(this.instanceKey(eventId, serverId));
  }

  private instanceKey(eventId: string, serverId: string): string {
    return `${eventId}:${serverId}`;
  }
}

export const worldEventManager = new WorldEventManager();
