import { nanoid } from 'nanoid';
import db from '../persistence/db.js';
import { Effect } from '../models.js';
import { applyEffects } from '../engine/rules.js';

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

type WorldEventGoalProgress = {
  goalId: string;
  current: number;
  target: number;
  participants: Set<string>;
  completed: boolean;
};

export interface WorldEventInstance {
  eventId: string;
  serverId: string;
  startTime: number;
  endTime: number;
  communityProgress: WorldEventGoalProgress[];
  participants: Set<string>;
}

interface SerializedProgress {
  goalId: string;
  current: number;
  target: number;
  participants: string[];
  completed?: boolean;
}

interface ActiveEventContext {
  event: WorldEvent;
  instance: WorldEventInstance;
  effects: GlobalEffect[];
}

export interface ActionModifiers {
  advantageStacks: number;
  disadvantageStacks: number;
  dcShift: number;
  multipliers: Record<string, number>;
  bonuses: Record<string, number>;
  sleightSuccessBonus: number;
}

export interface ActiveWorldEventSummary {
  event: WorldEvent;
  serverId: string;
  startedAt: number;
  endsAt: number;
  remainingMs: number;
  participantCount: number;
  progress: { goalId: string; current: number; target: number; completed: boolean; participantCount: number }[];
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

class WorldEventManager {
  private readonly activeEvents = new Map<string, WorldEventInstance>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private triggerInterval?: ReturnType<typeof setTimeout>;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private triggerInterval?: NodeJS.Timeout;
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const rows = db.prepare('SELECT * FROM world_events_active').all() as {
      event_id: string;
      server_id: string;
      start_time: number;
      end_time: number;
      community_progress_json: string;
      participants_json: string;
    }[];

    for (const row of rows) {
      const progressRaw = JSON.parse(row.community_progress_json || '[]') as SerializedProgress[];
      const progress: WorldEventGoalProgress[] = progressRaw.map((entry) => ({
        goalId: entry.goalId,
        current: entry.current,
        target: entry.target,
        completed: Boolean(entry.completed),
        participants: new Set(entry.participants ?? []),
      }));
      const instance: WorldEventInstance = {
        eventId: row.event_id,
        serverId: row.server_id,
        startTime: row.start_time,
        endTime: row.end_time,
        communityProgress: progress,
        participants: new Set(JSON.parse(row.participants_json || '[]') as string[]),
      };
      this.activeEvents.set(this.instanceKey(instance.eventId, instance.serverId), instance);
      this.scheduleEnd(instance);
    }

    const timer = setInterval(() => {
      try {
        this.checkEventTriggers().catch((err) => console.error('World event trigger sweep failed', err));
      } catch (err) {
        console.error('World event trigger sweep failed', err);
      }
    }, 30 * 60 * 1000);
    (timer as any).unref?.();
    this.triggerInterval = timer;
  }

  listActiveEvents(): ActiveWorldEventSummary[] {
    const now = Date.now();
    const summaries: ActiveWorldEventSummary[] = [];
    for (const instance of this.activeEvents.values()) {
      const event = WORLD_EVENTS.find((e) => e.id === instance.eventId);
      if (!event) continue;
      summaries.push({
        event,
        serverId: instance.serverId,
        startedAt: instance.startTime,
        endsAt: instance.endTime,
        remainingMs: Math.max(0, instance.endTime - now),
        participantCount: instance.participants.size,
        progress: instance.communityProgress.map((goal) => ({
          goalId: goal.goalId,
          current: goal.current,
          target: goal.target,
          completed: goal.completed,
          participantCount: goal.participants.size,
        })),
      });
    }
    return summaries.sort((a, b) => a.endsAt - b.endsAt);
  }

  prepareAction(serverId: string, action: { roll?: { tags?: string[] } }): { contexts: ActiveEventContext[]; modifiers: ActionModifiers } {
    const contexts = this.collectActiveContexts(action, serverId);
    return { contexts, modifiers: this.computeModifiers(contexts) };
  }

  recordActionImpact(
    contexts: ActiveEventContext[],
    impact: { serverId: string; userId: string; tags: string[]; rollKind: 'crit_success' | 'success' | 'fail' | 'crit_fail'; coinsDelta: number; xpDelta: number; fragmentsDelta: number }
  ): void {
    if (!contexts.length) return;
    const coinsLost = impact.coinsDelta < 0 ? Math.abs(impact.coinsDelta) : 0;
    const coinsGained = impact.coinsDelta > 0 ? impact.coinsDelta : 0;
    const xpGained = impact.xpDelta > 0 ? impact.xpDelta : 0;
    const fragmentsGained = impact.fragmentsDelta > 0 ? impact.fragmentsDelta : 0;
    const success = impact.rollKind === 'success' || impact.rollKind === 'crit_success';
    const failure = impact.rollKind === 'fail' || impact.rollKind === 'crit_fail';

    for (const ctx of contexts) {
      const instance = this.activeEvents.get(this.instanceKey(ctx.instance.eventId, ctx.instance.serverId));
      if (!instance) continue;
      instance.participants.add(impact.userId);

      const eventDef = ctx.event;
      if (eventDef.communityGoals?.length) {
        for (const goalProgress of instance.communityProgress) {
          if (goalProgress.completed) continue;
          const goalDef = eventDef.communityGoals.find((goal) => goal.description === goalProgress.goalId);
          if (!goalDef) continue;
          const delta = this.calculateGoalDelta(goalDef, {
            tags: impact.tags,
            success,
            failure,
            coinsLost,
            coinsGained,
            xpGained,
            fragmentsGained,
          });
          if (delta > 0) {
            goalProgress.current = Math.min(goalProgress.target, goalProgress.current + delta);
            goalProgress.participants.add(impact.userId);
            if (goalProgress.current >= goalProgress.target) {
              goalProgress.completed = true;
              this.handleGoalCompletion(eventDef, goalDef, goalProgress, instance);
            }
          }
        }
      }
      this.saveInstance(instance);
    }
  }

  async triggerEvent(eventId: string, serverId: string = 'global', opts: { source?: 'manual' | 'automatic' } = {}): Promise<boolean> {
    const event = WORLD_EVENTS.find((e) => e.id === eventId);
    if (!event) return false;
    if (this.isEventActive(eventId, serverId)) return false;

    const now = Date.now();
    const instance: WorldEventInstance = {
      eventId: event.id,
      serverId,
      startTime: now,
      endTime: now + event.duration * 60 * 60 * 1000,
      communityProgress:
        event.communityGoals?.map((goal) => ({
          goalId: goal.description,
          current: 0,
          target: goal.target,
          completed: false,
          participants: new Set<string>(),
        })) ?? [],
      participants: new Set<string>(),
    };

    this.activeEvents.set(this.instanceKey(eventId, serverId), instance);
    this.saveInstance(instance);
    this.scheduleEnd(instance);
    await this.broadcastEventStart(event, instance, opts.source ?? 'manual');
    return true;
  }

  async checkEventTriggers(): Promise<void> {
    for (const event of WORLD_EVENTS) {
      if (!event.triggerConditions || event.triggerConditions.length === 0) continue;
      const shouldTrigger = await this.evaluateTriggerConditions(event.triggerConditions);
      if (shouldTrigger && !this.isEventActive(event.id)) {
        await this.triggerEvent(event.id, 'global', { source: 'automatic' });
      }
    }
  }

  async forceEndEvent(eventId: string, serverId: string = 'global'): Promise<boolean> {
    const instance = this.activeEvents.get(this.instanceKey(eventId, serverId));
    if (!instance) return false;
    this.finalizeEvent(instance, 'forced');
    return true;
  }

  private collectActiveContexts(action: { roll?: { tags?: string[] } }, serverId: string): ActiveEventContext[] {
    const contexts: ActiveEventContext[] = [];
    for (const [key, instance] of this.activeEvents.entries()) {
      const [, storedServer] = key.split(':');
      if (storedServer !== 'global' && storedServer !== serverId) continue;
      const event = WORLD_EVENTS.find((e) => e.id === instance.eventId);
      if (!event) continue;
      const effects = event.globalEffects.filter((effect) => this.effectApplies(effect, action));
      contexts.push({ event, instance, effects });
    }
    return contexts;
  }

  private computeModifiers(contexts: ActiveEventContext[]): ActionModifiers {
    const modifiers: ActionModifiers = {
      advantageStacks: 0,
      disadvantageStacks: 0,
      dcShift: 0,
      multipliers: {},
      bonuses: {},
      sleightSuccessBonus: 0,
    };

    for (const ctx of contexts) {
      for (const effect of ctx.effects) {
        switch (effect.type) {
          case 'advantage':
            modifiers.advantageStacks += effect.value ?? 1;
            break;
          case 'disadvantage':
            modifiers.disadvantageStacks += effect.value ?? 1;
            break;
          case 'penalty': {
            const amount = Number(effect.value ?? 0);
            modifiers.dcShift += -amount;
            const lowerTarget = effect.target.toLowerCase();
            const lowerDesc = effect.description.toLowerCase();
            if (
              lowerTarget.includes('sleight') ||
              lowerTarget.includes('survival') ||
              lowerTarget.includes('integrity') ||
              lowerDesc.includes('sleight')
            ) {
              modifiers.sleightSuccessBonus += amount;
            }
            break;
          }
          case 'bonus': {
            const amount = Number(effect.value ?? 0);
            modifiers.bonuses[effect.target] = (modifiers.bonuses[effect.target] ?? 0) + amount;
            const lowerTarget = effect.target.toLowerCase();
            const lowerDesc = effect.description.toLowerCase();
            if (
              lowerTarget.includes('sleight') ||
              lowerTarget.includes('survival') ||
              lowerTarget.includes('integrity') ||
              lowerDesc.includes('sleight')
            ) {
              modifiers.sleightSuccessBonus += amount;
            }
            break;
          }
          case 'multiplier': {
            const amount = Number(effect.value ?? 1);
            modifiers.multipliers[effect.target] = (modifiers.multipliers[effect.target] ?? 1) * amount;
            break;
          }
        }
      }
    }

    return modifiers;
  }

  private scheduleEnd(instance: WorldEventInstance) {
    const key = this.instanceKey(instance.eventId, instance.serverId);
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(key);
    }
    const ms = Math.max(0, instance.endTime - Date.now());
    const timer = setTimeout(() => {
      this.finalizeEvent(instance, 'expired');
    }, ms);
    (timer as any).unref?.();
    this.timers.set(key, timer);
  }

  private finalizeEvent(instance: WorldEventInstance, reason: 'expired' | 'forced') {
    const key = this.instanceKey(instance.eventId, instance.serverId);
    if (!this.activeEvents.has(key)) return;
    this.activeEvents.delete(key);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    db.prepare('DELETE FROM world_events_active WHERE event_id=? AND server_id=?').run(instance.eventId, instance.serverId);
    db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)').run(
      `world_event_${instance.eventId}_${instance.endTime}_${reason}`,
      null,
      null,
      'world_event_ended',
      JSON.stringify({ eventId: instance.eventId, serverId: instance.serverId, reason }),
      Date.now()
    );
  }

  private calculateGoalDelta(
    goal: CommunityGoal,
    impact: {
      tags: string[];
      success: boolean;
      failure: boolean;
      coinsLost: number;
      coinsGained: number;
      xpGained: number;
      fragmentsGained: number;
    }
  ): number {
    const desc = goal.description.toLowerCase();
    if (desc.includes('lose') && desc.includes('coin')) {
      return Math.round(impact.coinsLost);
    }
    if (desc.includes('gain') && desc.includes('xp')) {
      return Math.round(impact.xpGained);
    }
    if (desc.includes('fragment')) {
      return Math.round(impact.fragmentsGained);
    }
    if (desc.includes('gremlin')) {
      return impact.success && impact.tags.some((tag) => tag.includes('gremlin')) ? 1 : 0;
    }
    if (desc.includes('craft')) {
      return impact.success ? 1 : 0;
    }
    if (desc.includes('non-validator')) {
      return impact.success ? 1 : 0;
    }
    if (desc.includes('timeline') || desc.includes('support')) {
      return impact.success ? 1 : 0;
    }
    if (desc.includes('integrity')) {
      return impact.success ? 1 : 0;
    }
    if (desc.includes('death') || desc.includes('downed')) {
      return impact.failure ? 1 : 0;
    }
    if (desc.includes('restore') || desc.includes('consensus')) {
      return impact.success ? 1 : 0;
    }
    return impact.success ? 1 : 0;
  }

  private handleGoalCompletion(
    event: WorldEvent,
    goal: CommunityGoal,
    progress: WorldEventGoalProgress,
    instance: WorldEventInstance
  ) {
    db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)').run(
      `world_event_goal_${event.id}_${Date.now()}`,
      null,
      null,
      'world_event_goal_completed',
      JSON.stringify({ eventId: event.id, serverId: instance.serverId, goal: goal.description }),
      Date.now()
    );

    if (goal.participantRewards?.length) {
      const participants = Array.from(progress.participants);
      for (const userId of participants) {
        this.applyOutOfRunRewards(userId, goal.participantRewards, event.id, goal.description);
      }
    }

    if (goal.rewards?.length) {
      // Server wide rewards are recorded for operators to process manually.
      db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)').run(
        `world_event_reward_${event.id}_${Date.now()}`,
        null,
        null,
        'world_event_global_reward',
        JSON.stringify({ eventId: event.id, serverId: instance.serverId, rewards: goal.rewards }),
        Date.now()
      );
    }
  }

  private applyOutOfRunRewards(userId: string, rewards: Effect[], eventId: string, goalId: string) {
    if (!rewards.length) return;
    const state: any = {
      hp: {},
      focus: {},
      flags: {},
      _coins: {},
      _xp: {},
      _fragments: {},
      _items: {},
      _buffs: {},
      _debuffs: {},
      _gems: {},
    };
    const summary = applyEffects(rewards, state, userId);
    const coins = Math.round(state._coins[userId] ?? 0);
    const xp = Math.round(state._xp[userId] ?? 0);
    const fragments = Math.round(state._fragments[userId] ?? 0);
    const gems = Math.round(state._gems[userId] ?? 0);

    if (coins) {
      db.prepare('UPDATE profiles SET coins=coins+? WHERE user_id=?').run(coins, userId);
    }
    if (xp) {
      db.prepare('UPDATE profiles SET xp=xp+? WHERE user_id=?').run(xp, userId);
    }
    if (fragments) {
      db.prepare('UPDATE profiles SET fragments=fragments+? WHERE user_id=?').run(fragments, userId);
    }
    if (gems) {
      db.prepare('UPDATE profiles SET gems=gems+? WHERE user_id=?').run(gems, userId);
    }
    if (Array.isArray(state._items[userId]) && state._items[userId].length) {
      const stmt = db.prepare(
        'INSERT INTO inventories (user_id,item_id,kind,rarity,qty,meta_json) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET qty=qty+excluded.qty'
      );
      for (const itemId of state._items[userId]) {
        stmt.run(userId, itemId, 'reward', 'unknown', 1, '{}');
      }
    }

    db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)').run(
      `world_event_participant_reward_${nanoid(8)}`,
      null,
      userId,
      'world_event_participant_reward',
      JSON.stringify({ eventId, goalId, summary }),
      Date.now()
    );
  }

  private async broadcastEventStart(event: WorldEvent, instance: WorldEventInstance, source: 'manual' | 'automatic') {
    const message =
      `🌍 **${event.name}** has begun!\n\n${event.description}\n\nDuration: ${event.duration} hours\n\n${event.globalEffects
        .map((effect) => `• ${effect.description}`)
        .join('\n')}`;
    db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)').run(
      `world_event_${instance.eventId}_${instance.startTime}_${source}`,
      null,
      null,
      'world_event_started',
      JSON.stringify({
        eventId: event.id,
        serverId: instance.serverId,
        duration: event.duration,
        message,
        source,
      }),
      Date.now()
    );
  }

  private saveInstance(instance: WorldEventInstance) {
    const progress: SerializedProgress[] = instance.communityProgress.map((goal) => ({
      goalId: goal.goalId,
      current: goal.current,
      target: goal.target,
      completed: goal.completed,
      participants: Array.from(goal.participants),
    }));
    db.prepare(
      `INSERT INTO world_events_active (event_id, server_id, start_time, end_time, community_progress_json, participants_json)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(event_id, server_id) DO UPDATE SET start_time=excluded.start_time, end_time=excluded.end_time, community_progress_json=excluded.community_progress_json, participants_json=excluded.participants_json`
    ).run(
      instance.eventId,
      instance.serverId,
      instance.startTime,
      instance.endTime,
      JSON.stringify(progress),
      JSON.stringify(Array.from(instance.participants))
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
        const gems = (row?.gems ?? 0) * 1000;
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
          .prepare('SELECT enabled FROM feature_flags WHERE guild_id=? AND feature=?')
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

  private isEventActive(eventId: string, serverId: string = 'global'): boolean {
    return this.activeEvents.has(this.instanceKey(eventId, serverId));
  }

  private instanceKey(eventId: string, serverId: string): string {
    return `${eventId}:${serverId}`;
  }
}

export const worldEventManager = new WorldEventManager();
