import db from '../persistence/db.js';
import { BranchContext, buildBranchContext } from './branching.js';

type BranchConditionType = 'stat' | 'item' | 'flag' | 'history' | 'role' | 'karma';
type BranchOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';

export interface DynamicSceneRoute {
  sceneId: string;
  conditions: BranchCondition[];
  weight: number;
  tags: string[];
}

export interface BranchCondition {
  type: BranchConditionType;
  field: string;
  operator: BranchOperator;
  value: unknown;
}

interface EnhancedBranchContext extends BranchContext {
  karma: {
    alignment: number;
    redemption_arc: boolean;
  };
  total_sleight: number;
  party_deaths: number;
  party_strength: number;
  role_interactions: number;
  gremlin_interactions: number;
}

export class DynamicBranchingEngine {
  private readonly routeCache = new Map<string, DynamicSceneRoute[]>();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.registerRoutes('1.7', [
      {
        sceneId: '2.1.dev',
        conditions: [
          { type: 'role', field: 'selected_role', operator: 'eq', value: 'dev' },
          { type: 'stat', field: 'sleight', operator: 'gte', value: 10 }
        ],
        weight: 100,
        tags: ['role_specific', 'dev_path']
      },
      {
        sceneId: '2.1.trader',
        conditions: [
          { type: 'role', field: 'selected_role', operator: 'eq', value: 'trader' },
          { type: 'stat', field: 'coins', operator: 'gte', value: 5000 }
        ],
        weight: 100,
        tags: ['role_specific', 'trader_path']
      },
      {
        sceneId: '2.1.whale',
        conditions: [
          { type: 'role', field: 'selected_role', operator: 'eq', value: 'whale' },
          { type: 'item', field: 'legendary_count', operator: 'gte', value: 2 }
        ],
        weight: 100,
        tags: ['role_specific', 'whale_path']
      },
      {
        sceneId: '2.1.karma_good',
        conditions: [{ type: 'karma', field: 'alignment', operator: 'gte', value: 5 }],
        weight: 90,
        tags: ['moral_path', 'good_karma']
      },
      {
        sceneId: '2.1.karma_evil',
        conditions: [{ type: 'karma', field: 'alignment', operator: 'lte', value: -5 }],
        weight: 90,
        tags: ['moral_path', 'evil_karma']
      },
      {
        sceneId: '2.1',
        conditions: [],
        weight: 1,
        tags: ['default']
      }
    ]);

    this.registerRoutes('3.7', [
      {
        sceneId: 'boss.custodian',
        conditions: [
          { type: 'flag', field: 'custodian_key', operator: 'eq', value: true },
          { type: 'stat', field: 'party_strength', operator: 'gte', value: 100 }
        ],
        weight: 100,
        tags: ['boss', 'custodian']
      },
      {
        sceneId: 'boss.gremlin_king',
        conditions: [
          { type: 'flag', field: 'gremlin_alliance', operator: 'eq', value: true },
          { type: 'history', field: 'gremlin_interactions', operator: 'gte', value: 10 }
        ],
        weight: 100,
        tags: ['boss', 'gremlin']
      },
      {
        sceneId: 'boss.shadow_ledger',
        conditions: [{ type: 'flag', field: 'corrupted_path', operator: 'eq', value: true }],
        weight: 100,
        tags: ['boss', 'corruption']
      }
    ]);

    this.registerRoutes('4.7', [
      {
        sceneId: 'ending.transcendence',
        conditions: [
          { type: 'stat', field: 'total_sleight', operator: 'gte', value: 100 },
          { type: 'flag', field: 'perfect_run', operator: 'eq', value: true }
        ],
        weight: 200,
        tags: ['ending', 'perfect']
      },
      {
        sceneId: 'ending.redemption',
        conditions: [
          { type: 'karma', field: 'redemption_arc', operator: 'eq', value: true },
          { type: 'flag', field: 'saved_party', operator: 'eq', value: true }
        ],
        weight: 150,
        tags: ['ending', 'redemption']
      },
      {
        sceneId: 'ending.corruption',
        conditions: [
          { type: 'flag', field: 'embraced_darkness', operator: 'eq', value: true },
          { type: 'stat', field: 'party_deaths', operator: 'gte', value: 2 }
        ],
        weight: 150,
        tags: ['ending', 'dark']
      },
      {
        sceneId: 'ending.neutral',
        conditions: [],
        weight: 50,
        tags: ['ending', 'neutral']
      }
    ]);
  }

  registerRoutes(fromScene: string, routes: DynamicSceneRoute[]) {
    const sorted = [...routes].sort((a, b) => b.weight - a.weight);
    this.routeCache.set(fromScene, sorted);
  }

  async determineNextScene(runId: string, currentScene: string): Promise<string> {
    const context = await this.buildEnhancedContext(runId);
    const routes = this.routeCache.get(currentScene) ?? [];

    for (const route of routes) {
      if (this.evaluateAllConditions(route.conditions, context)) {
        this.logBranchDecision(runId, currentScene, route.sceneId, route.tags, context);
        return route.sceneId;
      }
    }

    return this.getDefaultNextScene(currentScene);
  }

  private async buildEnhancedContext(runId: string): Promise<EnhancedBranchContext> {
    const baseContext = buildBranchContext(runId);

    const karmaEvents = db
      .prepare(
        `SELECT payload_json FROM events
         WHERE run_id=? AND type='moral_choice'
         ORDER BY ts DESC`
      )
      .all(runId)
      .map((row: { payload_json: string }) => JSON.parse(row.payload_json) as { choice?: string });

    const karmaAlignment = karmaEvents.reduce((sum: number, evt: { choice?: string }) => {
      if (evt.choice === 'good') return sum + 1;
      if (evt.choice === 'evil') return sum - 1;
      return sum;
    }, 0);

    const totalSleightRow = db
      .prepare(`SELECT SUM(sleight_score) as total FROM runs WHERE run_id=?`)
      .get(runId) as { total: number | null } | undefined;

    const partyIds = baseContext.players.map((player) => player.id);
    const partyDeaths = partyIds.filter((id) => {
      const prof = db
        .prepare('SELECT downed_at FROM profiles WHERE user_id=?')
        .get(id) as { downed_at?: number | null } | undefined;
      return prof?.downed_at != null;
    }).length;

    const roleInteractionRow = db
      .prepare(
        `SELECT COUNT(*) as count FROM events
         WHERE run_id=? AND type='role_specific_action'`
      )
      .get(runId) as { count: number | null } | undefined;

    const enhanced: EnhancedBranchContext = {
      ...baseContext,
      karma: {
        alignment: karmaAlignment,
        redemption_arc:
          karmaAlignment < -3 && karmaEvents.slice(0, 3).every((event: { choice?: string }) => event.choice === 'good')
      },
      total_sleight: totalSleightRow?.total ?? 0,
      party_deaths: partyDeaths,
      party_strength: this.calculatePartyStrength(baseContext),
      role_interactions: roleInteractionRow?.count ?? 0,
      gremlin_interactions: baseContext.choiceHistory.filter((entry) =>
        entry.tags?.includes('gremlin')
      ).length
    };

    return enhanced;
  }

  private calculatePartyStrength(context: BranchContext): number {
    return context.players.reduce((sum, player) => {
      const currentHp = player?.hp ?? 0;
      const hpRatio = currentHp > 0 ? Math.min(currentHp / 20, 1) : 0;
      const level = player.level || 1;
      return sum + hpRatio * level * 10;
    }, 0);
  }

  private evaluateAllConditions(conditions: BranchCondition[], context: EnhancedBranchContext): boolean {
    if (conditions.length === 0) return true;
    return conditions.every((condition) => this.evaluateCondition(condition, context));
  }

  private evaluateCondition(condition: BranchCondition, context: EnhancedBranchContext): boolean {
    const value = this.getContextValue(condition.type, condition.field, context);
    const target = condition.value as number | string | boolean;

    switch (condition.operator) {
      case 'eq':
        return value === target;
      case 'neq':
        return value !== target;
      case 'gt':
        return typeof value === 'number' && value > (target as number);
      case 'gte':
        return typeof value === 'number' && value >= (target as number);
      case 'lt':
        return typeof value === 'number' && value < (target as number);
      case 'lte':
        return typeof value === 'number' && value <= (target as number);
      case 'contains':
        return Array.isArray(value) && value.includes(target);
      default:
        return false;
    }
  }

  private getContextValue(type: BranchConditionType, field: string, context: EnhancedBranchContext): unknown {
    switch (type) {
      case 'stat':
        if (field === 'sleight') return context.sleight;
        if (field === 'total_sleight') return context.total_sleight;
        if (field === 'party_strength') return context.party_strength;
        if (field === 'party_deaths') return context.party_deaths;
        if (field === 'coins') {
          const prof = db
            .prepare('SELECT coins FROM profiles WHERE user_id=?')
            .get(context.activePlayer) as { coins?: number } | undefined;
          return prof?.coins ?? 0;
        }
        return 0;
      case 'item':
        if (field === 'legendary_count') {
          return context.items.filter((item) => item.rarity === 'legendary').length;
        }
        return context.items.some((item) => item.id === field);
      case 'flag':
        return context.flags[field];
      case 'history':
        if (field === 'gremlin_interactions') return context.gremlin_interactions;
        if (field === 'role_interactions') return context.role_interactions;
        return 0;
      case 'role': {
        const player = context.players.find((p) => p.id === context.activePlayer);
        return player ? (player as Record<string, unknown>)[field] : undefined;
      }
      case 'karma':
        if (field === 'alignment') return context.karma.alignment;
        if (field === 'redemption_arc') return context.karma.redemption_arc;
        return 0;
      default:
        return undefined;
    }
  }

  private getDefaultNextScene(currentScene: string): string {
    if (currentScene.startsWith('boss.')) {
      return '4.1';
    }

    if (currentScene.startsWith('ending.')) {
      return 'credits';
    }

    const [majorRaw, minorRaw] = currentScene.split('.');
    const major = Number(majorRaw);
    const minor = Number(minorRaw);

    if (!Number.isNaN(minor) && minor < 7) {
      return `${major}.${minor + 1}`;
    }

    if (!Number.isNaN(major)) {
      return `${major + 1}.1`;
    }

    return currentScene;
  }

  private logBranchDecision(
    runId: string,
    from: string,
    to: string,
    tags: string[],
    context: EnhancedBranchContext
  ) {
    const payload = {
      from,
      to,
      tags,
      context_snapshot: {
        karma: context.karma.alignment,
        total_sleight: context.total_sleight,
        party_strength: context.party_strength,
        party_deaths: context.party_deaths
      }
    };

    db.prepare(
      'INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)'
    ).run(
      `branch_${Date.now()}`,
      runId,
      context.activePlayer,
      'scene.branch.dynamic',
      JSON.stringify(payload),
      Date.now()
    );
  }
}

export const dynamicBranchingEngine = new DynamicBranchingEngine();
