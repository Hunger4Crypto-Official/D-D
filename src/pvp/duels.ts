import { nanoid } from 'nanoid';
import db from '../persistence/db.js';

type PvPMode = '1v1' | '2v2';

interface MatchState {
  matchId: string;
  mode: PvPMode;
  participants: string[];
  turnIndex: number;
  scores: Record<string, number>;
  createdAt: number;
}

const queue: Record<PvPMode, string[]> = {
  '1v1': [],
  '2v2': [],
};

const activeMatches = new Map<string, MatchState>();

function storeMatch(state: MatchState) {
  db.prepare(
    `INSERT OR REPLACE INTO pvp_matches (match_id,kind,status,participants_json,created_at,updated_at,result_json)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    state.matchId,
    state.mode,
    'active',
    JSON.stringify(state.participants),
    state.createdAt,
    Date.now(),
    '{}'
  );
}

export function queueForMatch(user_id: string, mode: PvPMode = '1v1') {
  const list = queue[mode];
  if (list.includes(user_id)) {
    return { message: 'Already in queue.' };
  }
  list.push(user_id);
  if ((mode === '1v1' && list.length >= 2) || (mode === '2v2' && list.length >= 4)) {
    const players = mode === '1v1' ? list.splice(0, 2) : list.splice(0, 4);
    const matchId = `pvp_${nanoid(6)}`;
    const state: MatchState = {
      matchId,
      mode,
      participants: players,
      turnIndex: 0,
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      createdAt: Date.now(),
    };
    activeMatches.set(matchId, state);
    storeMatch(state);
    return { message: `Match ${matchId} ready: ${players.map((p) => `<@${p}>`).join(' vs ')}`, matchId };
  }
  return { message: `Queued for ${mode}. Waiting for more challengers.` };
}

export function recordPvPAction(matchId: string, user_id: string, result: 'win' | 'loss' | 'draw') {
  const match = activeMatches.get(matchId);
  if (!match) return { success: false, message: 'Match not active.' };
  if (!match.participants.includes(user_id)) {
    return { success: false, message: 'You are not part of this match.' };
  }
  if (result === 'win') match.scores[user_id] += 1;
  if (result === 'loss') match.scores[user_id] -= 1;
  match.turnIndex = (match.turnIndex + 1) % match.participants.length;
  storeMatch(match);
  return { success: true, message: `Score updated for ${matchId}.` };
}

export function concludeMatch(matchId: string) {
  const match = activeMatches.get(matchId);
  if (!match) return { success: false };
  const sorted = Object.entries(match.scores).sort((a, b) => b[1] - a[1]);
  const winner = sorted[0]?.[0];
  db.prepare('UPDATE pvp_matches SET status=?, updated_at=?, result_json=? WHERE match_id=?')
    .run('completed', Date.now(), JSON.stringify({ scores: match.scores, winner }), matchId);
  activeMatches.delete(matchId);
  return { success: true, winner };
}

export function listActiveMatches() {
  return Array.from(activeMatches.values()).map((m) => ({
    matchId: m.matchId,
    mode: m.mode,
    participants: m.participants,
    scores: m.scores,
  }));
}
