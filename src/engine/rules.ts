import { Effect, Outcome } from '../models.js';

export function phiD20(dcBase:number, dcOffset:number){
  const roll = Math.ceil(Math.random()*20);
  const dc = dcBase + dcOffset;
  if (roll >= 20) return { kind:'crit_success' as const, roll, dc };
  if (roll === 1) return { kind:'crit_fail' as const, roll, dc };
  if (roll >= dc) return { kind:'success' as const, roll, dc };
  return { kind:'fail' as const, roll, dc };
}

export function applyEffects(effects: Effect[], state: any, userId: string){
  const summary: string[] = [];
  for (const e of effects || []) {
    switch (e.type) {
      case 'hp': {
        const d = (e.op === '-') ? -(e.value as number) : (e.value as number);
        state.hp[userId] = Math.max(0, (state.hp[userId] ?? 20) + d);
        summary.push(`HP ${d>=0?'+':''}${d}`);
        break;
      }
      case 'focus': {
        const d = (e.op === '-') ? -(e.value as number) : (e.value as number);
        state.focus[userId] = Math.max(0, (state.focus[userId] ?? 10) + d);
        summary.push(`Focus ${d>=0?'+':''}${d}`);
        break;
      }
      case 'coins': {
        const d = (e.op === '-') ? -(e.value as number) : (e.value as number);
        state._coins[userId] = (state._coins[userId]||0) + d;
        summary.push(`Coins ${d>=0?'+':''}${d}`);
        break;
      }
      case 'xp': {
        const d = (e.value as number);
        state._xp[userId] = (state._xp[userId]||0) + d;
        summary.push(`XP +${d}`);
        break;
      }
      case 'flag': {
        state.flags[e.id||''] = e.value;
        summary.push(`Flag ${e.id}=${String(e.value)}`);
        break;
      }
      case 'fragment': {
        state._fragments[userId] = (state._fragments[userId]||0) + (e.value as number);
        summary.push(`Fragment +${e.value}`);
        break;
      }
      case 'item': {
        state._items[userId] = [...(state._items[userId]||[]), e.id];
        summary.push(`Item +${e.id}`);
        break;
      }
      case 'buff': {
        state._buffs[userId] = [...(state._buffs[userId]||[]), e.id];
        summary.push(`Buff +${e.id}`);
        break;
      }
      case 'debuff': {
        state._debuffs[userId] = [...(state._debuffs[userId]||[]), e.id];
        summary.push(`Debuff +${e.id}`);
        break;
      }
      case 'gem': {
        state._gems[userId] = (state._gems[userId]||0) + (e.value as number);
        summary.push(`Gems +${e.value}`);
        break;
      }
    }
  }
  return summary.join(', ');
}

export function pickOutcome(outcomes: any, kind: 'crit_success'|'success'|'fail'|'crit_fail') {
  return outcomes?.[kind] || outcomes?.success || outcomes?.fail || { effects: [] };
}
