import type { SceneDef } from '../models.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export class ContentValidator {
  validateScene(scene: SceneDef): ValidationResult {
    const issues: ValidationIssue[] = [];

    scene.rounds.forEach((round, roundIndex) => {
      if (!round.actions || round.actions.length === 0) {
        issues.push({ path: `${scene.scene_id}.rounds[${roundIndex}]`, message: 'round has no actions' });
      }

      round.actions.forEach((action, actionIndex) => {
        const requiredOutcomes: Array<keyof typeof action.outcomes> = ['success', 'fail'];
        for (const key of requiredOutcomes) {
          if (!action.outcomes[key]) {
            issues.push({
              path: `${scene.scene_id}.rounds[${roundIndex}].actions[${actionIndex}].outcomes.${String(key)}`,
              message: 'missing outcome definition'
            });
          }
        }

        for (const [outcomeKey, outcome] of Object.entries(action.outcomes)) {
          if (!outcome?.effects || outcome.effects.length === 0) {
            issues.push({
              path: `${scene.scene_id}.rounds[${roundIndex}].actions[${actionIndex}].outcomes.${outcomeKey}`,
              message: 'outcome has no effects'
            });
          }
        }
      });
    });

    if (scene.arrivals) {
      scene.arrivals.forEach((arrival, index) => {
        if (!arrival.goto) {
          issues.push({ path: `${scene.scene_id}.arrivals[${index}]`, message: 'arrival missing goto reference' });
        }
      });
    }

    if (scene.threshold_rewards) {
      scene.threshold_rewards.forEach((reward, index) => {
        if (!reward.rewards || reward.rewards.length === 0) {
          issues.push({ path: `${scene.scene_id}.threshold_rewards[${index}]`, message: 'reward has no effects' });
        }
      });
    }

    return { ok: issues.length === 0, issues };
  }
}
