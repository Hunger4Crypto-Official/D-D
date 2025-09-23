import db from '../persistence/db.js';
import { SceneDef } from '../models.js';
import { loadScene } from '../content/contentLoader.js';

export interface BranchCondition {
  type: 'flag' | 'sleight' | 'item' | 'stat' | 'choice_history' | 'party_size' | 'class' | 'combined';
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'has' | 'lacks' | 'and' | 'or';
  value: any;
  field?: string;
  conditions?: BranchCondition[]; // For combined conditions
}

export interface SceneBranch {
  id: string;
  priority: number; // Higher priority evaluated first
  conditions: BranchCondition[];
  goto: string;
  description?: string; // For debugging
}

export class BranchingEngine {
  private branchRegistry = new Map<string, SceneBranch[]>();

  constructor() {
    this.initializeBranches();
  }

  private initializeBranches() {
    // Scene 1.1 -> 2.X branches
    this.registerBranch('1.1', [
      {
        id: 'trust_path',
        priority: 100,
        conditions: [
          { type: 'flag', field: 'trustful', operator: 'eq', value: true },
          { type: 'sleight', operator: 'gte', value: 8 }
        ],
        goto: '2A',
        description: 'High trust and performance leads to cooperative path'
      },
      {
        id: 'insight_path',
        priority: 90,
        conditions: [
          { type: 'flag', field: 'insight', operator: 'eq', value: true },
          { type: 'flag', field: 'harmony', operator: 'eq', value: true }
        ],
        goto: '2C',
        description: 'Wisdom and harmony leads to enlightened path'
      },
      {
        id: 'gremlin_chaos',
        priority: 85,
        conditions: [
          { type: 'flag', field: 'gremlin', operator: 'eq', value: true },
          { type: 'choice_history', field: 'chaos_count', operator: 'gte', value: 2 }
        ],
        goto: '2D',
        description: 'Gremlin alliance and chaos leads to mischief path'
      },
      {
        id: 'lone_wolf',
        priority: 80,
        conditions: [
          { type: 'flag', field: 'shy', operator: 'eq', value: true },
          { type: 'party_size', operator: 'eq', value: 1 }
        ],
        goto: '2B',
        description: 'Solo cautious player gets introspective path'
      },
      {
        id: 'validator_special',
        priority: 75,
        conditions: [
          { type: 'class', field: 'selected_role', operator: 'eq', value: 'validator' },
          { type: 'flag', field: 'integrity_boost', operator: 'eq', value: true }
        ],
        goto: '2A-V',
        description: 'Validator with high integrity gets special variant'
      },
      {
        id: 'default_balanced',
        priority: 1,
        conditions: [],
        goto: '2B',
        description: 'Default balanced path'
      }
    ]);

    // Scene 2.X -> 3.X branches (more complex)
    this.registerBranch('2A', [
      {
        id: 'trust_maintained',
        priority: 100,
        conditions: [
          { type: 'flag', field: 'betrayed_trust', operator: 'neq', value: true },
          { type: 'sleight', operator: 'gte', value: 12 }
        ],
        goto: '3A',
        description: 'Maintained trust through challenges'
      },
      {
        id: 'trust_broken',
        priority: 90,
        conditions: [
          { type: 'flag', field: 'betrayed_trust', operator: 'eq', value: true }
        ],
        goto: '3C',
        description: 'Betrayal leads to redemption path'
      }
    ]);

    // Multi-condition complex branches
    this.registerBranch('3.1', [
      {
        id: 'perfect_run',
        priority: 200,
        conditions: [
          { 
            type: 'combined',
            operator: 'and',
            value: null,
            conditions: [
              { type: 'stat', field: 'hp_percentage', operator: 'gte', value: 80 },
              { type: 'sleight', operator: 'gte', value: 15 },
              { type: 'flag', field: 'no_deaths', operator: 'eq', value: true },
              { type: 'item', field: 'legendary_count', operator: 'gte', value: 1 }
            ]
          }
        ],
        goto: '4.GOLDEN',
        description: 'Perfect performance unlocks golden path'
      },
      {
        id: 'struggle_path',
        priority: 150,
        conditions: [
          {
            type: 'combined',
            operator: 'or',
            value: null,
            conditions: [
              { type: 'stat', field: 'hp_percentage', operator: 'lt', value: 30 },
              { type: 'flag', field: 'party_wiped', operator: 'eq', value: true }
            ]
          }
        ],
        goto: '4.DARK',
        description: 'Struggling party gets darker path'
      }
    ]);
  }

  registerBranch(fromScene: string, branches: SceneBranch[]) {
    // Sort by priority descending
    branches.sort((a, b) => b.priority - a.priority);
    this.branchRegistry.set(fromScene, branches);
  }

  evaluateCondition(condition: BranchCondition, context: BranchContext): boolean {
    switch (condition.type) {
      case 'flag':
        return this.evaluateFlag(condition, context);
      case 'sleight':
        return this.evaluateNumeric(context.sleight, condition.operator, condition.value);
      case 'item':
        return this.evaluateItem(condition, context);
      case 'stat':
        return this.evaluateStat(condition, context);
      case 'choice_history':
        return this.evaluateChoiceHistory(condition, context);
      case 'party_size':
        return this.evaluateNumeric(context.partySize, condition.operator, condition.value);
      case 'class':
        return this.evaluateClass(condition, context);
      case 'combined':
        return this.evaluateCombined(condition, context);
      default:
        return false;
    }
  }

  private evaluateFlag(condition: BranchCondition, context: BranchContext): boolean {
    const flagValue = context.flags[condition.field!];
    if (condition.operator === 'eq') return flagValue === condition.value;
    if (condition.operator === 'neq') return flagValue !== condition.value;
    if (condition.operator === 'has') return flagValue !== undefined && flagValue !== null;
    if (condition.operator === 'lacks') return flagValue === undefined || flagValue === null;
    return false;
  }

  private evaluateNumeric(value: number, operator: string, target: number): boolean {
    switch (operator) {
      case 'eq': return value === target;
      case 'neq': return value !== target;
      case 'gt': return value > target;
      case 'gte': return value >= target;
      case 'lt': return value < target;
      case 'lte': return value <= target;
      default: return false;
    }
  }

  private evaluateItem(condition: BranchCondition, context: BranchContext): boolean {
    if (condition.field === 'legendary_count') {
      const count = context.items.filter(i => i.rarity === 'legendary').length;
      return this.evaluateNumeric(count, condition.operator, condition.value);
    }
    if (condition.operator === 'has') {
      return context.items.some(i => i.id === condition.value);
    }
    if (condition.operator === 'lacks') {
      return !context.items.some(i => i.id === condition.value);
    }
    return false;
  }

  private evaluateStat(condition: BranchCondition, context: BranchContext): boolean {
    if (condition.field === 'hp_percentage') {
      const percentage = (context.hp / context.hpMax) * 100;
      return this.evaluateNumeric(percentage, condition.operator, condition.value);
    }
    if (condition.field === 'focus_percentage') {
      const percentage = (context.focus / context.focusMax) * 100;
      return this.evaluateNumeric(percentage, condition.operator, condition.value);
    }
    return false;
  }

  private evaluateChoiceHistory(condition: BranchCondition, context: BranchContext): boolean {
    if (condition.field === 'chaos_count') {
      const chaosChoices = context.choiceHistory.filter(c => 
        c.tags?.includes('chaos') || c.tags?.includes('gremlin')
      ).length;
      return this.evaluateNumeric(chaosChoices, condition.operator, condition.value);
    }
    if (condition.field === 'moral_score') {
      const moralScore = context.choiceHistory.reduce((sum, choice) => {
        if (choice.tags?.includes('integrity')) return sum + 1;
        if (choice.tags?.includes('deception')) return sum - 1;
        return sum;
      }, 0);
      return this.evaluateNumeric(moralScore, condition.operator, condition.value);
    }
    return false;
  }

  private evaluateClass(condition: BranchCondition, context: BranchContext): boolean {
    const playerClass = context.players.find(p => p.id === context.activePlayer)?.class;
    if (condition.operator === 'eq') return playerClass === condition.value;
    if (condition.operator === 'neq') return playerClass !== condition.value;
    return false;
  }

  private evaluateCombined(condition: BranchCondition, context: BranchContext): boolean {
    if (!condition.conditions) return false;
    
    if (condition.operator === 'and') {
      return condition.conditions.every(c => this.evaluateCondition(c, context));
    }
    if (condition.operator === 'or') {
      return condition.conditions.some(c => this.evaluateCondition(c, context));
    }
    return false;
  }

  determineBranch(fromScene: string, context: BranchContext): string {
    const branches = this.branchRegistry.get(fromScene) || [];
    
    for (const branch of branches) {
      const allConditionsMet = branch.conditions.length === 0 || 
        branch.conditions.every(c => this.evaluateCondition(c, context));
      
      if (allConditionsMet) {
        console.log(`Branch selected: ${branch.id} -> ${branch.goto}`);
        this.logBranchDecision(fromScene, branch, context);
        return this.resolveSceneId(branch.goto);
      }
    }
    
    // Fallback to default progression
    return this.getDefaultNextScene(fromScene);
  }

  private resolveSceneId(goto: string): string {
    // Handle special scene codes
    const sceneMap: Record<string, string> = {
      '2A': '2.1', '2B': '2.2', '2C': '2.3', '2D': '2.4',
      '2A-V': '2.1.v', // Validator variant
      '3A': '3.1', '3B': '3.2', '3C': '3.3', '3D': '3.4',
      '4.GOLDEN': '4.golden', '4.DARK': '4.dark',
      'CUSTODIAN': 'boss.custodian',
      'GREMLIN_KING': 'boss.gremlin_king',
      'ENDING_HERO': 'ending.hero',
      'ENDING_VILLAIN': 'ending.villain',
      'ENDING_NEUTRAL': 'ending.neutral'
    };
    
    return sceneMap[goto] || goto;
  }

  private getDefaultNextScene(currentScene: string): string {
    // Simple increment for default progression
    const parts = currentScene.split('.');
    const major = parseInt(parts[0]);
    const minor = parseInt(parts[1]);
    
    if (minor < 7) {
      return `${major}.${minor + 1}`;
    } else {
      return `${major + 1}.1`;
    }
  }

  private logBranchDecision(fromScene: string, branch: SceneBranch, context: BranchContext) {
    db.prepare(
      'INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)'
    ).run(
      `branch_${Date.now()}`,
      context.runId,
      context.activePlayer,
      'scene.branch',
      JSON.stringify({
        from: fromScene,
        to: branch.goto,
        branch_id: branch.id,
        conditions_met: branch.conditions,
        context_snapshot: {
          flags: context.flags,
          sleight: context.sleight,
          party_size: context.partySize
        }
      }),
      Date.now()
    );
  }
}

export interface BranchContext {
  runId: string;
  activePlayer: string;
  flags: Record<string, any>;
  sleight: number;
  items: Array<{id: string; rarity: string}>;
  choiceHistory: Array<{action: string; outcome: string; tags?: string[]}>;
  partySize: number;
  players: Array<{id: string; class: string; hp: number; level: number}>;
  hp: number;
  hpMax: number;
  focus: number;
  focusMax: number;
}

// Helper to build context from run
export function buildBranchContext(run_id: string): BranchContext {
  const run = db.prepare('SELECT * FROM runs WHERE run_id=?').get(run_id) as any;
  const party = run.party_id.split(',');
  
  // Get choice history
  const choiceHistory = db.prepare(
    `SELECT payload_json FROM events 
     WHERE run_id=? AND type IN ('scene.choice', 'scene.force_choice')
     ORDER BY ts ASC`
  ).all(run_id).map((row: any) => {
    const payload = JSON.parse(row.payload_json);
    return {
      action: payload.action_id,
      outcome: payload.roll?.kind,
      tags: payload.action?.telemetry_tags
    };
  });

  // Get player details
  const players = party.map((user_id: string) => {
    const prof = db.prepare(
      'SELECT selected_role, hp, hp_max, focus, focus_max, level FROM profiles WHERE user_id=?'
    ).get(user_id) as any;
    return {
      id: user_id,
      class: prof.selected_role || 'normie',
      hp: prof.hp,
      level: prof.level || 1
    };
  });

  // Get items for active player
  const items = db.prepare(
    'SELECT item_id, rarity FROM inventories WHERE user_id=?'
  ).all(run.active_user_id || party[0]).map((row: any) => ({
    id: row.item_id,
    rarity: row.rarity
  }));

  const activePlayer = run.active_user_id || party[0];
  const activeProf = players.find((p: any) => p.id === activePlayer);

  return {
    runId: run_id,
    activePlayer,
    flags: JSON.parse(run.flags_json || '{}'),
    sleight: run.sleight_score || 0,
    items,
    choiceHistory,
    partySize: party.length,
    players,
    hp: activeProf?.hp || 20,
    hpMax: 20,
    focus: 10,
    focusMax: 10
  };
}

// Export singleton
export const branchingEngine = new BranchingEngine();
