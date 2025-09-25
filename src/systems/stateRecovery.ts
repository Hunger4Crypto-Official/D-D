import type { Checkpoint, RunId } from '../models.js';

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

export interface CheckpointRecord {
  checkpoint: Checkpoint;
  storedAt: number;
}

export class StateRecoverySystem {
  private checkpoints = new Map<string, CheckpointRecord>();

  createCheckpoint(runId: string, checkpoint: Partial<Checkpoint> = {}): Checkpoint {
    const nextCheckpoint: Checkpoint = {
      run_id: runId as RunId,
      guild_id: checkpoint.guild_id ?? 'unknown',
      channel_id: checkpoint.channel_id ?? 'unknown',
      party_id: checkpoint.party_id ?? 'unknown',
      content_id: checkpoint.content_id ?? 'genesis',
      content_version: checkpoint.content_version ?? '1.0',
      scene_id: checkpoint.scene_id ?? '1.1',
      round_id: checkpoint.round_id ?? 'R1',
      micro_ix: checkpoint.micro_ix ?? 0,
      rng_seed: checkpoint.rng_seed ?? 'seed',
      flags_json: checkpoint.flags_json ?? {},
      sleight_score: checkpoint.sleight_score ?? 0,
      updated_at: Date.now()
    };
    const record: CheckpointRecord = {
      checkpoint: nextCheckpoint,
      storedAt: Date.now()
    };
    this.checkpoints.set(nextCheckpoint.run_id, record);
    return record.checkpoint;
  }

  rollbackToCheckpoint(checkpointId: string): Checkpoint | null {
    const record = this.checkpoints.get(checkpointId as RunId);
    if (!record) return null;
    return { ...record.checkpoint, updated_at: Date.now() };
  }

  validateStateIntegrity(runId: string): ValidationResult {
    const record = this.checkpoints.get(runId);
    if (!record) {
      return { ok: false, issues: ['missing_checkpoint'] };
    }

    const issues: string[] = [];
    const { checkpoint } = record;

    if (!checkpoint.flags_json) {
      issues.push('missing_flags');
    }
    if (checkpoint.sleight_score < 0) {
      issues.push('invalid_sleight_score');
    }
    if (!checkpoint.scene_id) {
      issues.push('missing_scene');
    }

    return { ok: issues.length === 0, issues };
  }
}
