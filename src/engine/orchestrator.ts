import { nanoid } from 'nanoid';
import db from '../persistence/db.js';
import { loadScene, loadManifest } from '../content/contentLoader.js';
import { phiD20, pickOutcome, applyEffects } from './rules.js';
import { thresholdRewards, groupBonusAllSurvive, loneSurvivor } from './rewards.js';
import { computeHiddenTier, flavorForTier } from './difficulty.js';
import { calculatePartyDifficultyInputs } from './partyStrength.js';
import { SceneDef } from '../models.js';
import {
  equipmentAdvantageState,
  loadoutSleightBonus,
  neutralizesCritFail,
  shouldRerollFails,
  tickDurability,
  EquipmentSlot,
  hasCoinLossProtection,
  fragmentsBoost,
} from '../ui/equipment.js';
import { randomCompliment } from '../ui/compliments.js';
import { getGuildSettings } from '../persistence/settings.js';

const TURN_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function prepareTurnOrder(party_ids: string[]) {
  const deduped = Array.from(new Set(party_ids));
  return deduped.length ? deduped : [...party_ids];
}

export function startRun(
  guild_id: string,
  channel_id: string,
  party_ids: string[],
  content_id = 'genesis',
  scene_id = '1.1'
) {
  const manifest = loadManifest(content_id);
  const run_id = `run_${nanoid(8)}`;
  const rng_seed = nanoid(12);
  const flags = {};
  const now = Date.now();
  const turnOrder = prepareTurnOrder(party_ids);
  const active = turnOrder[0] ?? null;
  db.prepare(`INSERT INTO runs (run_id,guild_id,channel_id,party_id,content_id,content_version,scene_id,round_id,micro_ix,rng_seed,flags_json,sleight_score,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      run_id,
      guild_id,
      channel_id,
      party_ids.sort().join(','),
      content_id,
      manifest.version,
      scene_id,
      '1.1-R1',
      1,
      rng_seed,
      JSON.stringify(flags),
      0,
      now,
      now
    );
  db.prepare('UPDATE runs SET turn_order_json=?, active_user_id=?, turn_expires_at=? WHERE run_id=?')
    .run(JSON.stringify(turnOrder), active, active ? now + TURN_TIMEOUT_MS : null, run_id);
  db.prepare('UPDATE runs SET ui_channel_id=? WHERE run_id=?').run(channel_id, run_id);
  return run_id;
}

export function getRun(run_id: string) {
  return db.prepare('SELECT * FROM runs WHERE run_id=?').get(run_id);
}

export function saveRun(run: any) {
  db.prepare(
    `UPDATE runs SET scene_id=?, round_id=?, micro_ix=?, flags_json=?, sleight_score=?, sleight_history_json=?, active_user_id=?, turn_order_json=?, turn_expires_at=?, afk_tracker_json=?, updated_at=? WHERE run_id=?`
  )
    .run(
      run.scene_id,
      run.round_id,
      run.micro_ix,
      run.flags_json,
      run.sleight_score,
      run.sleight_history_json ?? '[]',
      run.active_user_id ?? null,
      run.turn_order_json ?? '[]',
      run.turn_expires_at ?? null,
      run.afk_tracker_json ?? '{}',
      Date.now(),
      run.run_id
    );
}

export function sceneState(run: any): SceneDef {
  return loadScene(run.content_id, run.scene_id);
}

type CommitState = {
  hp: Record<string, number>;
  focus: Record<string, number>;
  flags: Record<string, any>;
  _coins: Record<string, number>;
  _xp: Record<string, number>;
  _fragments: Record<string, number>;
  _items: Record<string, string[]>;
  _buffs: Record<string, string[]>;
  _debuffs: Record<string, string[]>;
  _gems: Record<string, number>;
};

function commitState(user_id: string, state: CommitState) {
  if (state.hp[user_id] !== undefined || state.focus[user_id] !== undefined) {
    const prof = db
      .prepare('SELECT hp, hp_max, focus, focus_max FROM profiles WHERE user_id=?')
      .get(user_id) as { hp: number; hp_max: number; focus: number; focus_max: number } | undefined;
    const hpMax = prof?.hp_max ?? 20;
    const focusMax = prof?.focus_max ?? 10;
    const hp = Math.max(0, Math.min(state.hp[user_id] ?? prof?.hp ?? 20, hpMax));
    const focus = Math.max(0, Math.min(state.focus[user_id] ?? prof?.focus ?? 10, focusMax));
    const downed_at = hp <= 0 ? Date.now() : null;
    db.prepare('UPDATE profiles SET hp=?, focus=?, downed_at=? WHERE user_id=?')
      .run(hp, focus, downed_at, user_id);
  }

  if (state._coins[user_id]) {
    const delta = state._coins[user_id];
    if (delta < 0 && hasCoinLossProtection(user_id)) {
      // Prevent dipping below zero when protection is active.
      const current = db.prepare('SELECT coins FROM profiles WHERE user_id=?').get(user_id) as { coins: number } | undefined;
      const protectedDelta = Math.max(-(current?.coins ?? 0), delta);
      db.prepare('UPDATE profiles SET coins=coins+? WHERE user_id=?').run(protectedDelta, user_id);
    } else {
      db.prepare('UPDATE profiles SET coins=coins+? WHERE user_id=?').run(delta, user_id);
    }
  }

  if (state._xp[user_id]) {
    db.prepare('UPDATE profiles SET xp=xp+? WHERE user_id=?').run(state._xp[user_id], user_id);
  }

  if (state._fragments[user_id]) {
    const bonus = fragmentsBoost(user_id);
    const total = (state._fragments[user_id] ?? 0) + bonus;
    db.prepare('UPDATE profiles SET fragments=fragments+? WHERE user_id=?').run(total, user_id);
  }

  if (state._gems[user_id]) {
    db.prepare('UPDATE profiles SET gems=gems+? WHERE user_id=?').run(state._gems[user_id], user_id);
  }

  if (state._items[user_id]?.length) {
    const stmt = db.prepare(
      'INSERT INTO inventories (user_id,item_id,kind,rarity,qty,meta_json) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET qty=qty+excluded.qty'
    );
    for (const id of state._items[user_id]) {
      stmt.run(user_id, id, 'reward', 'unknown', 1, '{}');
    }
  }
}

function appendSleightHistory(run: any, entry: any) {
  const history: any[] = JSON.parse(run.sleight_history_json || '[]');
  history.push(entry);
  run.sleight_history_json = JSON.stringify(history.slice(-50));
}

function advanceTurn(run: any, { skipActiveCheck = false } = {}) {
  const order: string[] = JSON.parse(run.turn_order_json || '[]');
  if (!order.length) return;
  let currentIndex = order.indexOf(run.active_user_id ?? order[0]);
  if (currentIndex === -1) currentIndex = 0;
  let nextIndex = (currentIndex + 1) % order.length;
  let loops = order.length;
  while (loops-- > 0) {
    const candidate = order[nextIndex];
    if (!candidate) break;
    const prof = db
      .prepare('SELECT downed_at FROM profiles WHERE user_id=?')
      .get(candidate) as { downed_at?: number } | undefined;
    if (!prof?.downed_at) {
      run.active_user_id = candidate;
      run.turn_expires_at = Date.now() + TURN_TIMEOUT_MS;
      saveRun(run);
      return;
    }
    nextIndex = (nextIndex + 1) % order.length;
  }
  if (skipActiveCheck) {
    run.active_user_id = order[currentIndex];
    run.turn_expires_at = Date.now() + TURN_TIMEOUT_MS;
    saveRun(run);
  }
}

function applyThresholdRewards(run: any, user_id: string, scene: SceneDef, state: CommitState) {
  const rewards = thresholdRewards(run.sleight_score, scene.threshold_rewards);
  if (rewards?.length) {
    applyEffects(rewards, state as any, user_id);
    commitState(user_id, state);
  }

  const party = (run.party_id as string)?.split(',').filter(Boolean) ?? [];
  if (!party.length) return;
  const downed = party.filter((p) => {
    const prof = db.prepare('SELECT downed_at FROM profiles WHERE user_id=?').get(p) as { downed_at?: number } | undefined;
    return Boolean(prof?.downed_at);
  });
  if (downed.length === 0) {
    const bonus = groupBonusAllSurvive();
    applyEffects(bonus, state as any, user_id);
    commitState(user_id, state);
  } else if (downed.length === party.length - 1) {
    const survivor = party.find((p) => !downed.includes(p));
    if (survivor) {
      const bonus = loneSurvivor();
      applyEffects(bonus, state as any, survivor);
      commitState(survivor, state);
    }
  }
}

export function handleAction(
  run_id: string,
  user_id: string,
  action_id: string,
  opts: { forcedKind?: 'crit_success' | 'success' | 'fail' | 'crit_fail'; autop?: boolean; reason?: string } = {}
) {
  const run = getRun(run_id);
  if (!run) throw new Error('Run not found');
  const scene = loadScene(run.content_id, run.scene_id);
  const round = scene.rounds.find((r: any) => r.round_id === run.round_id);
  if (!round) throw new Error('Round not found');
  const act = round.actions.find((a: any) => a.id === action_id);
  if (!act) throw new Error('Action not found');

  if (run.active_user_id && run.active_user_id !== user_id && !opts.autop) {
    throw new Error('It is not your turn.');
  }

  const prof = db
    .prepare('SELECT hp, focus, downed_at FROM profiles WHERE user_id=?')
    .get(user_id) as { hp: number; focus: number; downed_at?: number } | undefined;
  if (prof?.downed_at && !opts.autop) {
    throw new Error('You are downed! Use a reboot or wait for a revive.');
  }

  const tags: string[] = act.roll?.tags ?? [];
  const { advantage, disadvantage, dcShift, dcOffset, focusBonus, hpBonus } = equipmentAdvantageState(user_id, tags);
  const difficultyInputs = calculatePartyDifficultyInputs(run);
  const settings = getGuildSettings(run.guild_id);
  const { dcOffset: hiddenOffset, tier } = computeHiddenTier(
    difficultyInputs.avgLevel,
    difficultyInputs.avgPower,
    difficultyInputs.debuffBias,
    settings.difficulty_bias
  );
  db.prepare(
    'INSERT INTO difficulty_snapshots (run_id, scene_id, snapshot_ts, tier, dc_offset, inputs_json) VALUES (?,?,?,?,?,?)'
  ).run(
    run_id,
    run.scene_id,
    Date.now(),
    tier,
    hiddenOffset,
    JSON.stringify({
      avgLevel: difficultyInputs.avgLevel,
      avgPower: difficultyInputs.avgPower,
      debuffBias: difficultyInputs.debuffBias,
      bias: settings.difficulty_bias,
      members: difficultyInputs.members,
    })
  );

  const baseDc = 13 + dcShift;
  const totalOffset = hiddenOffset + dcOffset;
  let roll = act.roll
    ? phiD20(baseDc, totalOffset)
    : ({ kind: 'success', roll: 20, dc: baseDc + totalOffset } as any);

  if (act.roll) {
    if (advantage && !disadvantage) {
      const contender = phiD20(baseDc, totalOffset);
      roll = contender.roll >= roll.roll ? contender : roll;
    } else if (disadvantage && !advantage) {
      const contender = phiD20(baseDc, totalOffset);
      roll = contender.roll <= roll.roll ? contender : roll;
    }
  }

  if (opts.forcedKind) {
    roll = { kind: opts.forcedKind, roll: 0, dc: baseDc + totalOffset } as any;
  }

  if (roll.kind === 'crit_fail' && neutralizesCritFail(user_id)) {
    roll = { ...roll, kind: 'fail' };
  }

  const rerollAllowed = shouldRerollFails(user_id) && (roll.kind === 'fail' || roll.kind === 'crit_fail') && !opts.autop;
  if (rerollAllowed) {
    const contender = phiD20(baseDc, totalOffset);
    if (contender.roll > roll.roll) {
      roll = contender;
    }
  }

  const outcome = pickOutcome(act.outcomes, roll.kind as any);
  const state: CommitState = {
    hp: { [user_id]: prof?.hp ?? 20 },
    focus: { [user_id]: prof?.focus ?? 10 },
    flags: JSON.parse(run.flags_json || '{}'),
    _coins: {},
    _xp: {},
    _fragments: {},
    _items: {},
    _buffs: {},
    _debuffs: {},
    _gems: {},
  };

  if (focusBonus) {
    state.focus[user_id] = (state.focus[user_id] ?? prof?.focus ?? 10) + focusBonus;
  }
  if (hpBonus && (state.hp[user_id] ?? 0) > 0) {
    state.hp[user_id] = (state.hp[user_id] ?? prof?.hp ?? 20) + hpBonus;
  }

  const summary = applyEffects(outcome.effects || [], state as any, user_id);
  commitState(user_id, state);

  const newFlags = { ...(JSON.parse(run.flags_json || '{}')), ...(state.flags || {}) };
  run.flags_json = JSON.stringify(newFlags);

  let sleightDelta = 0;
  if (roll.kind === 'crit_success') sleightDelta = 2;
  else if (roll.kind === 'success') sleightDelta = 1;
  else if (roll.kind === 'crit_fail') sleightDelta = -1;
  sleightDelta += loadoutSleightBonus(user_id, roll.kind);
  run.sleight_score += sleightDelta;
  appendSleightHistory(run, { user_id, delta: sleightDelta, reason: roll.kind, ts: Date.now() });

  const rounds = scene.rounds.map((r: any) => r.round_id);
  const idx = rounds.indexOf(run.round_id);
  let completedScene = false;
  if (idx < rounds.length - 1) {
    run.round_id = rounds[idx + 1];
  } else {
    completedScene = true;
    applyThresholdRewards(run, user_id, scene, state);
    const arr = scene.arrivals || [];
    const next =
      arr.find((a) => a.when.startsWith('flags') && (newFlags as any)[a.when.split('.')[1]])?.goto ||
      arr.find((a) => a.when === 'else')?.goto ||
      '2B';
    const sceneMap: Record<'A' | 'B' | 'C' | 'D', string> = { A: '2.1', B: '2.1', C: '2.1', D: '2.1' };
    run.scene_id = ('' + next)
      .replace(/^\s*→?\s*/, '')
      .replace(/^Scene\s*/, '')
      .replace(/^2([A-D])$/, (m, p: 'A' | 'B' | 'C' | 'D') => sceneMap[p]);
    run.round_id = `${run.scene_id}-R1`;
    run.micro_ix += 1;
    run.sleight_score = 0;
  }

  const tracker = JSON.parse(run.afk_tracker_json || '{}');
  tracker[user_id] = 0;
  run.afk_tracker_json = JSON.stringify(tracker);

  tickDurability(user_id, ['weapon', 'armor', 'helm', 'trinket', 'deck'] as EquipmentSlot[], 1);

  const compliment = roll.kind === 'crit_success' || roll.kind === 'success' ? randomCompliment() : undefined;

  db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)')
    .run(
      `${run_id}:${Date.now()}`,
      run_id,
      user_id,
      opts.autop ? 'scene.force_choice' : 'scene.choice',
      JSON.stringify({
        action_id,
        roll,
        outcome,
        summary,
        compliment,
        tierFlavor: flavorForTier(tier),
        reason: opts.reason,
      }),
      Date.now()
    );

  advanceTurn(run, { skipActiveCheck: completedScene });
  saveRun(run);
  db.prepare('UPDATE user_runs SET scene_id=?, updated_at=? WHERE run_id=? AND user_id=?')
    .run(run.scene_id, Date.now(), run_id, user_id);
  return { roll, outcome, summary, tier, compliment, completedScene };
}

export function processAfkTimeouts(now = Date.now()) {
  const timedOut = db
    .prepare('SELECT * FROM runs WHERE turn_expires_at IS NOT NULL AND turn_expires_at <= ?')
    .all(now) as any[];
  const events: { run_id: string; user_id: string; action_id: string; message: string; channel_id: string; refresh?: boolean }[] = [];
  for (const run of timedOut) {
    if (!run.active_user_id) continue;
    const scene = loadScene(run.content_id, run.scene_id);
    const round = scene.rounds.find((r: any) => r.round_id === run.round_id);
    if (!round) continue;
    const fallback =
      round.actions.find((a: any) => a.telemetry_tags?.includes('neutral')) || round.actions[0];
    if (!fallback) continue;
    try {
      handleAction(run.run_id, run.active_user_id, fallback.id, {
        forcedKind: 'fail',
        autop: true,
        reason: 'timeout',
      });
      const tracker = JSON.parse(run.afk_tracker_json || '{}');
      tracker[run.active_user_id] = (tracker[run.active_user_id] ?? 0) + 1;
      run.afk_tracker_json = JSON.stringify(tracker);
      saveRun(run);
      events.push({
        run_id: run.run_id,
        user_id: run.active_user_id,
        action_id: fallback.id,
        message: `⏱️ Forced a neutral outcome for <@${run.active_user_id}> (timeout).`,
        channel_id: run.channel_id,
        refresh: true,
      });
    } catch (err) {
      console.error('Failed to resolve timeout', err);
    }
  }
  return events;
}
