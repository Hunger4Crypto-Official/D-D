import db from '../persistence/db.js';
import { loadDropTable } from '../content/contentLoader.js';
import { nanoid } from 'nanoid';

type RarityWeights = Record<string, number>;

interface OpenPackOptions {
  skipCost?: boolean;
  spendAmountOverride?: number;
  packIdOverride?: string;
}

function weightedPick(weights: RarityWeights): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [rarity, weight] of Object.entries(weights)) {
    r -= weight;
    if (r <= 0) return rarity;
  }
  return Object.keys(weights)[0];
}

function pityAdjustedRarity(
  opened: number,
  weights: RarityWeights,
  rareAfter = 10,
  epicAfter = 30
): string {
  if (opened >= epicAfter) return 'epic';
  if (opened >= rareAfter) return 'rare';
  return weightedPick(weights);
}

const PACK_FILES: Record<string, string> = {
  Genesis: 'packs_genesis.json',
};

const FRAGMENT_VALUES: Record<string, number> = {
  common: 5,
  uncommon: 10,
  rare: 25,
  epic: 40,
  legendary: 60,
  mythic: 100,
};

export function openPack(user_id: string, packIdentifier = 'Genesis', options: OpenPackOptions = {}) {
  const isFile = packIdentifier.endsWith('.json');
  const pack_id = options.packIdOverride ?? (isFile ? 'Genesis' : packIdentifier);
  const tableFile = isFile ? packIdentifier : PACK_FILES[packIdentifier] ?? 'packs_genesis.json';
  const dt = loadDropTable(tableFile);

  const costCoins = dt.cost.coins ?? 0;
  const spendAmount = options.spendAmountOverride ?? costCoins;

  if (!options.skipCost && costCoins > 0) {
    const prof = db
      .prepare('SELECT coins FROM profiles WHERE user_id=?')
      .get(user_id) as { coins?: number } | undefined;
    if ((prof?.coins ?? 0) < costCoins) throw new Error('Not enough coins');
    db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(costCoins, user_id);
  }

  const pityRow = db
    .prepare('SELECT opened, last_rarity FROM pity WHERE user_id=? AND pack_id=?')
    .get(user_id, pack_id) as { opened?: number; last_rarity?: string } | undefined;

  const rarity = pityAdjustedRarity(
    pityRow?.opened ?? 0,
    dt.weights,
    dt.pity?.rare_after,
    dt.pity?.epic_after
  );
  const pool = dt.pools[rarity] ?? [];
  const pick =
    pool[Math.floor(Math.random() * pool.length)] ?? ({
      kind: 'cosmetic',
      id: 'cosmetic_confetti',
      rarity,
    } as { kind: string; id: string; rarity?: string });

  if (spendAmount > 0) {
    db.prepare(
      'INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)'
    ).run(
      `txn_${nanoid(8)}`,
      user_id,
      'pack_open',
      spendAmount,
      'coins_spent',
      JSON.stringify({ pack_id }),
      Date.now()
    );
  }

  const existing = db
    .prepare('SELECT qty FROM inventories WHERE user_id=? AND item_id=?')
    .get(user_id, pick.id) as { qty?: number } | undefined;

  let duplicate = false;
  if (existing?.qty) {
    duplicate = true;
    const fragments = FRAGMENT_VALUES[rarity] ?? 5;
    db.prepare('UPDATE profiles SET fragments=fragments+? WHERE user_id=?').run(fragments, user_id);
  } else {
    db.prepare(
      'INSERT INTO inventories (user_id,item_id,kind,rarity,qty,meta_json) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET qty=qty+excluded.qty'
    ).run(user_id, pick.id, pick.kind, rarity, 1, '{}');
  }

  db.prepare(
    'INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)'
  ).run(
    `txn_${nanoid(8)}`,
    user_id,
    'drop_grant',
    1,
    'pack_drop',
    JSON.stringify({ pack_id, rarity, id: pick.id }),
    Date.now()
  );

  const newOpened = (pityRow?.opened ?? 0) + 1;

  db.prepare(
    `INSERT INTO pity (user_id, pack_id, opened, last_rarity)
     VALUES (?,?,?,?)
     ON CONFLICT(user_id,pack_id) DO UPDATE SET opened=excluded.opened, last_rarity=excluded.last_rarity`
  ).run(user_id, pack_id, newOpened, rarity);

  return { rarity, drop: pick, duplicate };
}
