import { nanoid } from 'nanoid';
import db from '../persistence/db.js';

export type PvPMode = '1v1' | '2v2';

interface MatchState {
  matchId: string;
  mode: PvPMode;
  participants: string[];
  turnIndex: number;
  scores: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

interface LeaderboardEntry {
  user_id: string;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  updated_at: number;
}

const queue: Record<PvPMode, string[]> = {
  '1v1': [],
  '2v2': [],
};

const activeMatches = new Map<string, MatchState>();

const WIN_REWARD = 750;
const DRAW_REWARD = 350;
const LOSS_REWARD = 200;

function ensureProfile(userId: string) {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO users (user_id, discord_id, created_at) VALUES (?,?,?)').run(userId, userId, now);
  db.prepare('INSERT OR IGNORE INTO profiles (user_id, coins, gems) VALUES (?,?,?)').run(userId, 0, 0);
}

function logEvent(type: string, payload: any) {
  db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)')
    .run(`pvp_${type}_${Date.now()}_${nanoid(6)}`, null, null, type, JSON.stringify(payload), Date.now());
}

function persistMatch(state: MatchState) {
  db.prepare(
    `INSERT INTO pvp_matches (match_id,kind,status,participants_json,created_at,updated_at,result_json)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(match_id) DO UPDATE SET kind=excluded.kind, status=excluded.status, participants_json=excluded.participants_json,
       updated_at=excluded.updated_at, result_json=excluded.result_json`
  ).run(
    state.matchId,
    state.mode,
    'active',
    JSON.stringify(state.participants),
    state.createdAt,
    state.updatedAt,
    JSON.stringify({ scores: state.scores, turnIndex: state.turnIndex })
  );
}

function removeMatch(matchId: string, result: any) {
  db.prepare('UPDATE pvp_matches SET status=?, updated_at=?, result_json=? WHERE match_id=?')
    .run('completed', Date.now(), JSON.stringify(result), matchId);
  activeMatches.delete(matchId);
}

function loadActiveMatchesFromDb() {
  const rows = db.prepare('SELECT * FROM pvp_matches WHERE status=?').all('active') as any[];
  for (const row of rows) {
    try {
      const result = JSON.parse(row.result_json || '{}') as { scores?: Record<string, number>; turnIndex?: number };
      const participants = JSON.parse(row.participants_json || '[]') as string[];
      const state: MatchState = {
        matchId: row.match_id,
        mode: row.kind as PvPMode,
        participants,
        turnIndex: Number(result?.turnIndex ?? 0),
        scores: result?.scores ?? Object.fromEntries(participants.map((p) => [p, 0])),
        createdAt: row.created_at ?? Date.now(),
        updatedAt: row.updated_at ?? Date.now(),
      };
      activeMatches.set(state.matchId, state);
    } catch (err) {
      console.error('Failed to restore PvP match', err);
    }
  }
}

export function initializePvP() {
  loadActiveMatchesFromDb();
}

function awardCoins(userId: string, amount: number, reason: string) {
  if (!amount) return;
  ensureProfile(userId);
  db.prepare('UPDATE profiles SET coins=coins+? WHERE user_id=?').run(amount, userId);
  db.prepare(
    'INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)'
  ).run(`pvp_${Date.now()}_${nanoid(4)}`, userId, 'pvp_reward', amount, reason, '{}', Date.now());
}

function updateLeaderboard(userId: string, outcome: 'win' | 'loss' | 'draw') {
  const existing = db
    .prepare('SELECT wins, losses, draws, rating FROM pvp_records WHERE user_id=?')
    .get(userId) as { wins: number; losses: number; draws: number; rating: number } | undefined;
  const wins = (existing?.wins ?? 0) + (outcome === 'win' ? 1 : 0);
  const losses = (existing?.losses ?? 0) + (outcome === 'loss' ? 1 : 0);
  const draws = (existing?.draws ?? 0) + (outcome === 'draw' ? 1 : 0);
  let rating = existing?.rating ?? 1200;
  if (outcome === 'win') rating += 25;
  if (outcome === 'loss') rating -= 15;
  if (outcome === 'draw') rating += 5;
  rating = Math.max(0, rating);
  db.prepare(
    `INSERT INTO pvp_records (user_id, wins, losses, draws, rating, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET wins=excluded.wins, losses=excluded.losses, draws=excluded.draws, rating=excluded.rating, updated_at=excluded.updated_at`
  ).run(userId, wins, losses, draws, rating, Date.now());
}

function ensureMatchExists(state: MatchState) {
  if (!activeMatches.has(state.matchId)) {
    activeMatches.set(state.matchId, state);
  }
}

export function queueForMatch(userId: string, mode: PvPMode = '1v1') {
  ensureProfile(userId);
  const list = queue[mode];
  if (list.includes(userId)) {
    return { message: 'Already in queue.' };
  }
  list.push(userId);
  if ((mode === '1v1' && list.length >= 2) || (mode === '2v2' && list.length >= 4)) {
    const players = mode === '1v1' ? list.splice(0, 2) : list.splice(0, 4);
    players.forEach(ensureProfile);
    const matchId = `pvp_${nanoid(6)}`;
    const state: MatchState = {
      matchId,
      mode,
      participants: players,
      turnIndex: 0,
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    ensureMatchExists(state);
    persistMatch(state);
    logEvent('pvp.match_created', { matchId, mode, participants: players });
    return { message: `Match ${matchId} ready: ${players.map((p) => `<@${p}>`).join(' vs ')}`, matchId };
  }
  return { message: `Queued for ${mode}. Waiting for more challengers.` };
}

export function recordPvPAction(matchId: string, userId: string, result: 'win' | 'loss' | 'draw') {
  const match = activeMatches.get(matchId);
  if (!match) return { success: false, message: 'Match not active.' };
  if (!match.participants.includes(userId)) {
    return { success: false, message: 'You are not part of this match.' };
  }
  if (result === 'win') match.scores[userId] = (match.scores[userId] ?? 0) + 1;
  if (result === 'loss') match.scores[userId] = (match.scores[userId] ?? 0) - 1;
  match.turnIndex = (match.turnIndex + 1) % match.participants.length;
  match.updatedAt = Date.now();
  persistMatch(match);
  logEvent('pvp.action_recorded', { matchId, userId, result, scores: match.scores });
  return { success: true, message: `Score updated for ${matchId}.` };
}

export function concludeMatch(matchId: string) {
  const match = activeMatches.get(matchId);
  if (!match) return { success: false, message: 'Match not active.' };
  const sorted = Object.entries(match.scores).sort((a, b) => b[1] - a[1]);
  const topScore = sorted[0]?.[1] ?? 0;
  const topPlayers = sorted.filter(([, score]) => score === topScore).map(([player]) => player);
  const tie = topPlayers.length > 1;
  const winners = tie ? [] : topPlayers;
  const draws = tie ? topPlayers : [];
  const losers = match.participants.filter((p) => !topPlayers.includes(p));

  for (const winner of winners) {
    awardCoins(winner, WIN_REWARD, 'pvp_win');
    updateLeaderboard(winner, 'win');
  }
  for (const draw of draws) {
    awardCoins(draw, DRAW_REWARD, 'pvp_draw');
    updateLeaderboard(draw, 'draw');
  }
  for (const loser of losers) {
    awardCoins(loser, LOSS_REWARD, 'pvp_loss');
    updateLeaderboard(loser, 'loss');
  }

  const resultPayload = {
    matchId,
    mode: match.mode,
    scores: match.scores,
    winners,
    draws,
    losers,
  };
  removeMatch(matchId, resultPayload);
  logEvent('pvp.match_completed', resultPayload);
  return { success: true, winners: winners.length ? winners : draws };
}

export function listActiveMatches() {
  return Array.from(activeMatches.values()).map((match) => ({
    matchId: match.matchId,
    mode: match.mode,
    participants: match.participants,
    scores: match.scores,
    updatedAt: match.updatedAt,
  }));
}

export function getPvPLeaderboard(limit = 10): LeaderboardEntry[] {
  return db
    .prepare('SELECT * FROM pvp_records ORDER BY rating DESC, wins DESC LIMIT ?')
    .all(limit) as LeaderboardEntry[];
}

export function getPvPRecord(userId: string): LeaderboardEntry | null {
  const row = db.prepare('SELECT * FROM pvp_records WHERE user_id=?').get(userId) as LeaderboardEntry | undefined;
  return row ?? null;
}
