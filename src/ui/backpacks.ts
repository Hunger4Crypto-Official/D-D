import { nanoid } from 'nanoid';
import db from '../persistence/db.js';
import { loadDropTable } from '../content/contentLoader.js';
import { DropTable } from '../models.js';

type Rarity = string;

type RarityWeights = Record<Rarity, number>;

interface OpenPackOptions {
  /** Skip deducting the drop table's listed cost. */
  skipCost?: boolean;
  /** Override the amount logged to the economy ledger when skipCost is used. */
  spendAmountOverride?: number;
  /** Force the pack identifier that should be tracked for pity. */
  packIdOverride?: string;
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

function weightedPick(weights: RarityWeights): Rarity {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return Object.keys(weights)[0] ?? 'common';
  }

  let cursor = Math.random() * total;
  for (const [rarity, weight] of Object.entries(weights)) {
    cursor -= weight;
    if (cursor <= 0) return rarity;
  }
  return Object.keys(weights)[0] ?? 'common';
}

function pityAdjustedRarity(
  opened: number,
  weights: RarityWeights,
  rareAfter = 10,
  epicAfter = 30
): Rarity {
  if (opened >= epicAfter) return 'epic';
  if (opened >= rareAfter) return 'rare';
  return weightedPick(weights);
}

function resolveTableFile(identifier: string): { file: string; inferredId: string } {
  const isFile = identifier.endsWith('.json');
  if (isFile) {
    const inferredId = identifier.replace(/\.json$/i, '');
    return { file: identifier, inferredId };
  }
  const file = PACK_FILES[identifier] ?? 'packs_genesis.json';
  return { file, inferredId: identifier };
}

function randomDrop(table: DropTable, rarity: Rarity) {
  const pool = table.pools[rarity] ?? [];
  if (!pool.length) {
    throw new Error(`Drop table ${table.pack_id} is missing entries for rarity ${rarity}`);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function openPack(user_id: string, packIdentifier = 'Genesis', options: OpenPackOptions = {}) {
  const { file, inferredId } = resolveTableFile(packIdentifier);
  const table = loadDropTable(file);

  const packId = options.packIdOverride ?? table.pack_id ?? inferredId;
  const costCoins = table.cost.coins ?? 0;
  const costGems = table.cost.gems ?? 0;

  if (!options.skipCost && (costCoins > 0 || costGems > 0)) {
    const profile =
      (db.prepare('SELECT coins, gems FROM profiles WHERE user_id=?').get(user_id) as
        | { coins?: number; gems?: number }
        | undefined) ?? {};
    const coins = profile.coins ?? 0;
    const gems = profile.gems ?? 0;

    if (costCoins > 0 && coins < costCoins) throw new Error('Not enough coins');
    if (costGems > 0 && gems < costGems) throw new Error('Not enough gems');

    if (costCoins > 0) {
      db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(costCoins, user_id);
      db.prepare(
        'INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)'
      ).run(
        `txn_${nanoid(8)}`,
        user_id,
        'pack_open',
        costCoins,
        'coins_spent',
        JSON.stringify({ pack_id: packId }),
        Date.now()
      );
    }

    if (costGems > 0) {
      db.prepare('UPDATE profiles SET gems=gems-? WHERE user_id=?').run(costGems, user_id);
      db.prepare(
        'INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)'
      ).run(
        `txn_${nanoid(8)}`,
        user_id,
        'pack_open',
        costGems,
        'gems_spent',
        JSON.stringify({ pack_id: packId }),
        Date.now()
      );
    }
  }

  const pityRow = db
    .prepare('SELECT opened, last_rarity FROM pity WHERE user_id=? AND pack_id=?')
    .get(user_id, packId) as { opened?: number; last_rarity?: string } | undefined;

  const rarity = pityAdjustedRarity(pityRow?.opened ?? 0, table.weights, table.pity?.rare_after, table.pity?.epic_after);
  const drop = randomDrop(table, rarity);
  const rarityTag = drop.rarity ?? rarity;

  const existing = db
    .prepare('SELECT qty FROM inventories WHERE user_id=? AND item_id=?')
    .get(user_id, drop.id) as { qty?: number } | undefined;

  const duplicate = (existing?.qty ?? 0) > 0;
  if (duplicate) {
    const fragments = FRAGMENT_VALUES[rarityTag] ?? FRAGMENT_VALUES[rarity] ?? 5;
    db.prepare('UPDATE profiles SET fragments=fragments+? WHERE user_id=?').run(fragments, user_id);
  }

  db.prepare(
    'INSERT INTO inventories (user_id,item_id,kind,rarity,qty,meta_json) VALUES (?,?,?,?,?,?) ' +
      'ON CONFLICT(user_id,item_id) DO UPDATE SET qty=qty+excluded.qty'
  ).run(user_id, drop.id, drop.kind, rarityTag, 1, JSON.stringify({ source: 'pack', pack_id: packId }));

  db.prepare(
    'INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)'
  ).run(
    `txn_${nanoid(8)}`,
    user_id,
    'drop_grant',
    1,
    'pack_drop',
    JSON.stringify({ pack_id: packId, rarity: rarityTag, id: drop.id }),
    Date.now()
  );

  const opened = (pityRow?.opened ?? 0) + 1;
  db.prepare(
    `INSERT INTO pity (user_id, pack_id, opened, last_rarity)
     VALUES (?,?,?,?)
     ON CONFLICT(user_id,pack_id) DO UPDATE SET opened=excluded.opened, last_rarity=excluded.last_rarity`
  ).run(user_id, packId, opened, rarityTag);

  return { rarity: rarityTag, drop, duplicate };
}
