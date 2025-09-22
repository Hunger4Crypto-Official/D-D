import db from '../persistence/db.js';

export function attemptSelfReboot(user_id: string) {
  const prof = db
    .prepare('SELECT hp, hp_max, focus, focus_max, coins, fragments, downed_at FROM profiles WHERE user_id=?')
    .get(user_id) as {
      hp: number;
      hp_max: number;
      focus: number;
      focus_max: number;
      coins: number;
      fragments: number;
      downed_at?: number;
    } | undefined;
  if (!prof?.downed_at) {
    return { success: false, message: '✅ You are already standing.' };
  }

  const coinCost = 250;
  const fragmentCost = 25;

  if (prof.coins >= coinCost) {
    db.prepare('UPDATE profiles SET coins=coins-?, hp=?, focus=?, downed_at=NULL WHERE user_id=?')
      .run(coinCost, Math.ceil(prof.hp_max * 0.5), Math.ceil(prof.focus_max * 0.5), user_id);
    return { success: true, message: `🔁 Rebooted for ${coinCost} coins. HP and Focus restored to 50%.` };
  }

  if (prof.fragments >= fragmentCost) {
    db.prepare('UPDATE profiles SET fragments=fragments-?, hp=?, focus=?, downed_at=NULL WHERE user_id=?')
      .run(fragmentCost, Math.ceil(prof.hp_max * 0.4), Math.ceil(prof.focus_max * 0.4), user_id);
    return { success: true, message: `🔁 Rebooted for ${fragmentCost} fragments. HP and Focus restored to 40%.` };
  }

  return { success: false, message: '❌ Not enough coins or fragments to reboot. Ask an ally to revive you!' };
}

export function attemptAllyRevive(actor_id: string, target_id: string) {
  if (actor_id === target_id) {
    return { success: false, message: '❌ Use reboot to revive yourself.' };
  }
  const target = db
    .prepare('SELECT hp, hp_max, focus, focus_max, downed_at FROM profiles WHERE user_id=?')
    .get(target_id) as { hp: number; hp_max: number; focus: number; focus_max: number; downed_at?: number } | undefined;
  if (!target?.downed_at) {
    return { success: false, message: '✅ That adventurer is already up.' };
  }

  const actor = db
    .prepare('SELECT fragments, coins FROM profiles WHERE user_id=?')
    .get(actor_id) as { fragments: number; coins: number } | undefined;

  const costCoins = 150;
  if ((actor?.fragments ?? 0) >= 15) {
    db.prepare('UPDATE profiles SET fragments=fragments-15 WHERE user_id=?').run(actor_id);
    db.prepare('UPDATE profiles SET hp=?, focus=?, downed_at=NULL WHERE user_id=?')
      .run(Math.ceil(target.hp_max * 0.6), Math.ceil(target.focus_max * 0.6), target_id);
    return { success: true, message: `✨ Revived ally using 15 fragments! <@${target_id}> is back at 60% strength.` };
  }
  if ((actor?.coins ?? 0) >= costCoins) {
    db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(costCoins, actor_id);
    db.prepare('UPDATE profiles SET hp=?, focus=?, downed_at=NULL WHERE user_id=?')
      .run(Math.ceil(target.hp_max * 0.4), Math.ceil(target.focus_max * 0.4), target_id);
    return { success: true, message: `✨ Revived ally for ${costCoins} coins! <@${target_id}> returns with 40% HP.` };
  }

  return { success: false, message: '❌ Not enough resources to revive. Need 15 fragments or 150 coins.' };
}
