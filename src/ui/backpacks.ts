import db from '../persistence/db.js';
import { loadDropTable } from '../content/contentLoader.js';
import { nanoid } from 'nanoid';

function weightedPick(weights:Record<string,number>){
  const total = Object.values(weights).reduce((a,b)=>a+b,0);
  let r = Math.random()*total;
  for (const [rarity, w] of Object.entries(weights)){
    if ((r-=w) <= 0) return rarity;
  }
  return Object.keys(weights)[0];
}

function pityAdjustedRarity(user_id:string, pack_id:string, weights:Record<string,number>, rare_after=10, epic_after=30){
  const row = db.prepare('SELECT opened, last_rarity FROM pity WHERE user_id=? AND pack_id=?').get(user_id, pack_id);
  const opened = row?.opened || 0;
  // Guarantee rare+ after rare_after opens, epic+ after epic_after
  if (opened >= epic_after) return 'epic';
  if (opened >= rare_after) return 'rare';
  return weightedPick(weights);
}

export function openPack(user_id:string, pack_id='Genesis'){
  const dt = loadDropTable('packs_genesis.json');
  if (dt.pack_id !== pack_id) throw new Error('Unknown pack');
  const costCoins = dt.cost.coins||0;
  const prof = db.prepare('SELECT coins FROM profiles WHERE user_id=?').get(user_id);
  if ((prof?.coins||0) < costCoins) throw new Error('Not enough coins');

  db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(costCoins, user_id);

  const pity = db.prepare('SELECT opened, last_rarity FROM pity WHERE user_id=? AND pack_id=?').get(user_id, pack_id) || {opened:0,last_rarity:null};
  const rarity = pityAdjustedRarity(user_id, pack_id, dt.weights, dt.pity?.rare_after||10, dt.pity?.epic_after||30);
  const pool = dt.pools[rarity] || [];
  const pick = pool[Math.floor(Math.random()*pool.length)] || {kind:'cosmetic', id:'cosmetic_confetti', rarity};

  const txn_id = `txn_${nanoid(8)}`;
  db.prepare('INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)')
    .run(txn_id, user_id, 'pack_open', costCoins, 'coins_spent', JSON.stringify({pack_id}), Date.now());

  db.prepare('INSERT INTO inventories (user_id,item_id,kind,rarity,qty,meta_json) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET qty=qty+1')
    .run(user_id, pick.id, pick.kind, rarity, 1, '{}');

  db.prepare('INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)')
    .run(`txn_${nanoid(8)}`, user_id, 'drop_grant', 1, 'pack_drop', JSON.stringify({pack_id, rarity, id: pick.id}), Date.now());

  // update pity
  const opened = (pity.opened||0) + 1
  let newOpened = opened;
  if ((dt.pity?.epic_after && opened >= dt.pity.epic_after) or (dt.pity?.rare_after and opened >= dt.pity.rare_after)):
      pass
  db.prepare('INSERT INTO pity (user_id, pack_id, opened, last_rarity) VALUES (?,?,?,?) ON CONFLICT(user_id,pack_id) DO UPDATE SET opened=opened+1, last_rarity=?')
    .run(user_id, pack_id, opened, rarity, rarity);

  return { rarity, drop: pick };
}
