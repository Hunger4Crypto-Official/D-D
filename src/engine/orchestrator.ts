import { nanoid } from 'nanoid';
import db from '../persistence/db.js';
import { loadScene, loadManifest } from '../content/contentLoader.js';
import { phiD20, pickOutcome, applyEffects } from './rules.js';
import { thresholdRewards } from './rewards.js';
import { computeHiddenTier, flavorForTier } from './difficulty.js';
import { SceneDef } from '../models.js';

export function startRun(guild_id:string, channel_id:string, party_ids:string[], content_id='genesis', scene_id='1.1'){
  const manifest = loadManifest(content_id);
  const run_id = `run_${nanoid(8)}`;
  const rng_seed = nanoid(12);
  const flags = {};
  const now = Date.now();
  db.prepare(`INSERT INTO runs (run_id,guild_id,channel_id,party_id,content_id,content_version,scene_id,round_id,micro_ix,rng_seed,flags_json,sleight_score,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(run_id, guild_id, channel_id, party_ids.sort().join(','), content_id, manifest.version, scene_id, '1.1-R1', 1, rng_seed, JSON.stringify(flags), 0, now, now);
  return run_id;
}

export function getRun(run_id:string){
  return db.prepare('SELECT * FROM runs WHERE run_id=?').get(run_id);
}

export function saveRun(run:any){
  db.prepare(`UPDATE runs SET scene_id=?, round_id=?, micro_ix=?, flags_json=?, sleight_score=?, updated_at=? WHERE run_id=?`)
    .run(run.scene_id, run.round_id, run.micro_ix, run.flags_json, run.sleight_score, Date.now(), run.run_id);
}

export function sceneState(run:any): SceneDef {
  return loadScene(run.content_id, run.scene_id);
}

export function handleAction(run_id:string, user_id:string, action_id:string){
  const run = getRun(run_id);
  const scene = loadScene(run.content_id, run.scene_id);
  const round = scene.rounds.find((r:any) => r.round_id === run.round_id);
  if (!round) throw new Error('Round not found');
  const act = round.actions.find((a:any) => a.id === action_id);
  if (!act) throw new Error('Action not found');

  // Hidden difficulty snapshot (toy avg levels)
  const avgLevel = 10, avgPower = 1200, debuff = 0;
  const { dcOffset, tier } = computeHiddenTier(avgLevel, avgPower, debuff);
  const roll = act.roll ? phiD20(13, dcOffset) : { kind:'success', roll: 20, dc:13 } as any;

  const outcome = pickOutcome(act.outcomes, roll.kind as any);
  const state = {
    hp: {}, focus: {}, flags: JSON.parse(run.flags_json||'{}'),
    _coins:{}, _xp:{}, _fragments:{}, _items:{}, _buffs:{}, _debuffs:{}, _gems:{}
  };
  const summary = applyEffects(outcome.effects||[], state, user_id);

  const newFlags = { ...(JSON.parse(run.flags_json||'{}')), ...(state.flags||{}) };
  run.flags_json = JSON.stringify(newFlags);

  if (roll.kind === 'crit_success') run.sleight_score += 2;
  else if (roll.kind === 'success') run.sleight_score += 1;
  else if (roll.kind === 'crit_fail') run.sleight_score -= 1;

  const rounds = scene.rounds.map(r=>r.round_id);
  const idx = rounds.indexOf(run.round_id);
  if (idx < rounds.length - 1){
    run.round_id = rounds[idx+1];
  } else {
    const rewards = thresholdRewards(run.sleight_score, scene.threshold_rewards);
    applyEffects(rewards, state, user_id);
    const arr = scene.arrivals||[];
    const next = arr.find(a => a.when.startsWith('flags') && (newFlags as any)[a.when.split('.')[1]])?.goto || arr.find(a=>a.when==='else')?.goto || '2B';
    const sceneMap: Record<'A'|'B'|'C'|'D', string> = { A: '2.1', B: '2.1', C: '2.1', D: '2.1' };
    run.scene_id = (''+next)
      .replace(/^\s*→?\s*/,'')
      .replace(/^Scene\s*/,'')
      .replace(/^2([A-D])$/,(m, p: 'A'|'B'|'C'|'D')=> sceneMap[p]);
    run.round_id = `${run.scene_id}-R1`;
    run.micro_ix += 1;
    run.sleight_score = 0;
  }

  db.prepare(`INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)`)
    .run(`${run_id}:${Date.now()}`, run_id, user_id, 'scene.choice', JSON.stringify({ action_id, roll, outcome, summary, tierFlavor: flavorForTier(tier) }), Date.now());

  saveRun(run);
  db.prepare('UPDATE user_runs SET scene_id=?, updated_at=? WHERE run_id=? AND user_id=?')
    .run(run.scene_id, Date.now(), run_id, user_id);
  return { roll, outcome, summary, tier };
}
