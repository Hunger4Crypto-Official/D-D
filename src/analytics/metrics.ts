export interface SceneCompletionMetric {
  scene: string;
  outcome: string;
  party: string[];
  timestamp: number;
}

export interface ItemUsageMetric {
  item: string;
  effectiveness: number;
  timestamp: number;
}

export interface RetentionMetric {
  cohort: string;
  retained: number;
  sample: number;
  timestamp: number;
}

export interface BalanceReport {
  scenes_played: Record<string, number>;
  average_effectiveness: Record<string, number>;
  retention_rates: Record<string, number>;
}

export class MetricsCollector {
  private sceneCompletions: SceneCompletionMetric[] = [];
  private itemUsage: ItemUsageMetric[] = [];
  private retention: RetentionMetric[] = [];

  trackSceneCompletion(scene: string, outcome: string, party: string[]): void {
    this.sceneCompletions.push({ scene, outcome, party, timestamp: Date.now() });
  }

  trackItemUsage(item: string, effectiveness: number): void {
    this.itemUsage.push({ item, effectiveness, timestamp: Date.now() });
  }

  trackPlayerRetention(cohort: string, retained = 0, sample = 0): void {
    this.retention.push({ cohort, retained, sample, timestamp: Date.now() });
  }

  generateBalanceReport(): BalanceReport {
    const scenes_played: Record<string, number> = {};
    const average_effectiveness: Record<string, number> = {};
    const effectivenessCounts: Record<string, number> = {};
    const retention_rates: Record<string, number> = {};

    for (const completion of this.sceneCompletions) {
      scenes_played[completion.scene] = (scenes_played[completion.scene] ?? 0) + 1;
    }

    for (const usage of this.itemUsage) {
      average_effectiveness[usage.item] = (average_effectiveness[usage.item] ?? 0) + usage.effectiveness;
      effectivenessCounts[usage.item] = (effectivenessCounts[usage.item] ?? 0) + 1;
    }

    for (const item of Object.keys(average_effectiveness)) {
      average_effectiveness[item] = average_effectiveness[item] / (effectivenessCounts[item] ?? 1);
    }

    for (const cohortMetric of this.retention) {
      if (cohortMetric.sample > 0) {
        retention_rates[cohortMetric.cohort] = cohortMetric.retained / cohortMetric.sample;
      }
    }

    return { scenes_played, average_effectiveness, retention_rates };
  }
}
