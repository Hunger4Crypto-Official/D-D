import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ButtonStyle,
  EmbedBuilder,
  ButtonInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { nanoid } from 'nanoid';
import db from '../persistence/db.js';
import { openPack } from './backpacks.js';
import { craftItem, listCraftables } from './crafting.js';

interface ShopPack {
  id: string;
  name: string;
  category: 'normal' | 'era' | 'featured';
  cost: { coins?: number; gems?: number };
  stock?: number;
  emoji: string;
  dropTable: string;
}

const SHOP_PACKS: ShopPack[] = [
  { id: 'genesis_small', name: 'Small', category: 'normal', cost: { coins: 10000 }, emoji: '📦', dropTable: 'packs_genesis.json' },
  { id: 'genesis_medium', name: 'Medium', category: 'normal', cost: { coins: 20000 }, emoji: '📫', dropTable: 'packs_genesis.json' },
  { id: 'genesis_large', name: 'Large', category: 'normal', cost: { coins: 40000 }, emoji: '🎁', stock: 5, dropTable: 'packs_genesis.json' },
  { id: 'classic_era', name: 'Classic Era', category: 'era', cost: { gems: 100 }, emoji: '♦️', dropTable: 'packs_genesis.json' },
  { id: 'gremlin_era', name: 'Gremlin Era', category: 'era', cost: { gems: 120 }, emoji: '📢', dropTable: 'packs_genesis.json' },
  { id: 'frost_signal', name: 'Frost Signal', category: 'featured', cost: { coins: 25000 }, emoji: '❄️', dropTable: 'packs_genesis.json' }
];

interface RotationRecord {
  rotation_id: string;
  packs: string[];
  items: { id: string; cost: number; emoji: string }[];
  active_from: number;
  active_to: number;
}

function startOfWeek(now: Date) {
  const copy = new Date(now);
  const day = copy.getUTCDay();
  const diff = (day + 6) % 7; // Monday start
  copy.setUTCDate(copy.getUTCDate() - diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function ensureWeeklyRotation(force = false): RotationRecord {
  const now = Date.now();
  const row = db
    .prepare('SELECT * FROM shop_rotations WHERE active_from <= ? AND active_to >= ? ORDER BY active_from DESC LIMIT 1')
    .get(now, now) as { rotation_id: string; packs_json: string; items_json: string; active_from: number; active_to: number } | undefined;
  if (row && !force) {
    return {
      rotation_id: row.rotation_id,
      packs: JSON.parse(row.packs_json || '[]'),
      items: JSON.parse(row.items_json || '[]'),
      active_from: row.active_from,
      active_to: row.active_to,
    };
  }
  const base = startOfWeek(new Date());
  const active_from = base.getTime();
  const active_to = active_from + 7 * 24 * 60 * 60 * 1000;
  const rotation_id = `rot_${nanoid(6)}`;
  const featured = SHOP_PACKS.filter((p) => p.category !== 'normal').map((p) => p.id);
  const packs = featured.sort(() => Math.random() - 0.5).slice(0, 3);
  const items = [
    { id: 'cosmetic_spark_trail', cost: 180, emoji: '✨' },
    { id: 'gift_frostsigil', cost: 220, emoji: '❄️' }
  ];
  db.prepare(
    'INSERT INTO shop_rotations (rotation_id, active_from, active_to, packs_json, items_json) VALUES (?,?,?,?,?)'
  ).run(rotation_id, active_from, active_to, JSON.stringify(packs), JSON.stringify(items));
  return { rotation_id, packs, items, active_from, active_to };
}

function rotationLabel(rot: RotationRecord) {
  return `Rotation ${rot.rotation_id} • Ends <t:${Math.floor(rot.active_to / 1000)}:R>`;
}

function packById(id: string) {
  return SHOP_PACKS.find((p) => p.id === id);
}

function pityProgress(user_id: string, pack: ShopPack) {
  const row = db
    .prepare('SELECT opened, last_rarity FROM pity WHERE user_id=? AND pack_id=?')
    .get(user_id, pack.id) as { opened?: number; last_rarity?: string } | undefined;
  if (!row) return 'Fresh pity track';
  return `Opened ${row.opened} • Last ${row.last_rarity ?? 'none'}`;
}

function purchasePack(user_id: string, pack: ShopPack) {
  if (pack.stock !== undefined && pack.stock <= 0) {
    throw new Error('Out of stock');
  }
  const prof = db
    .prepare('SELECT coins, gems FROM profiles WHERE user_id=?')
    .get(user_id) as { coins?: number; gems?: number } | undefined;
  const coins = prof?.coins ?? 0;
  const gems = prof?.gems ?? 0;
  if (pack.cost.coins && coins < pack.cost.coins) throw new Error(`Need ${pack.cost.coins} coins`);
  if (pack.cost.gems && gems < pack.cost.gems) throw new Error(`Need ${pack.cost.gems} gems`);
  if (pack.cost.coins) {
    db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(pack.cost.coins, user_id);
  }
  if (pack.cost.gems) {
    db.prepare('UPDATE profiles SET gems=gems-? WHERE user_id=?').run(pack.cost.gems, user_id);
  }
  if (pack.cost.coins || pack.cost.gems) {
    db.prepare('INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)')
      .run(
        `txn_${nanoid(8)}`,
        user_id,
        'shop_purchase',
        pack.cost.coins ?? pack.cost.gems ?? 0,
        'pack_purchase',
        JSON.stringify({ pack_id: pack.id }),
        Date.now()
      );
  }
  const { rarity, drop, duplicate } = openPack(user_id, pack.dropTable, {
    skipCost: true,
    spendAmountOverride: pack.cost.coins ?? pack.cost.gems ?? 0,
    packIdOverride: pack.id,
  });
  if (pack.stock !== undefined) {
    db.prepare('UPDATE shop_rotations SET items_json=items_json WHERE rotation_id=?').run('noop'); // noop to ensure row exists
    pack.stock -= 1;
  }
  const pity = pityProgress(user_id, pack);
  const duplicateNote = duplicate ? ' (duplicate converted to fragments)' : '';
  return `🎁 ${pack.name} → **[${rarity.toUpperCase()}] ${drop.id}**${duplicateNote}\n${pity}`;
}

export async function renderEnhancedShop(user_id: string) {
  const profile =
    (db.prepare('SELECT coins, gems, fragments FROM profiles WHERE user_id=?').get(user_id) as
      | { coins: number; gems: number; fragments: number }
      | undefined) ?? { coins: 0, gems: 0, fragments: 0 };
  const rotation = ensureWeeklyRotation();
  const embed = new EmbedBuilder()
    .setTitle('🛒 Black Market')
    .setColor(0x2b2d31)
    .setDescription(
      `**Gold:** 🪙 ${profile.coins.toLocaleString()}\n**Gems:** 💎 ${profile.gems.toLocaleString()}\n**Fragments:** ✨ ${profile.fragments}\n${rotationLabel(
        rotation
      )}`
    );

  const normal = SHOP_PACKS.filter((p) => p.category === 'normal')
    .map((p) => `${p.emoji} **${p.name}** — ${p.cost.coins?.toLocaleString() ?? p.cost.gems} ${p.cost.coins ? '🪙' : '💎'}`)
    .join('\n');
  embed.addFields({ name: 'Normal Backpacks', value: normal || 'None', inline: false });

  const featured = rotation.packs
    .map((id) => packById(id))
    .filter(Boolean)
    .map((pack) => `${pack!.emoji} **${pack!.name}** — ${pityProgress(user_id, pack!)}`)
    .join('\n');
  embed.addFields({ name: 'Weekly Featured Packs', value: featured || 'Rotation warming up…', inline: false });

  const limitedItems = rotation.items
    .map((item) => `${item.emoji} ${item.id} — ${item.cost} fragments`)
    .join('\n');
  embed.addFields({ name: 'Limited Stock', value: limitedItems || 'Check back soon!', inline: false });

  const craftables = listCraftables()
    .map((craft) => `${craft.id} — ${craft.costFragments} fragments`)
    .join('\n');
  embed.addFields({ name: 'Crafting', value: craftables || 'No recipes yet.', inline: false });

  const packOptions = new StringSelectMenuBuilder()
    .setCustomId('shop:select')
    .setPlaceholder('Open a pack...')
    .addOptions(
      rotation.packs
        .map((id) => packById(id))
        .filter(Boolean)
        .map((pack) => ({
          label: pack!.name,
          description: `Open ${pack!.name}`,
          value: pack!.id,
          emoji: pack!.emoji,
        }))
    );

  const craftMenu = new StringSelectMenuBuilder()
    .setCustomId('shop:craft')
    .setPlaceholder('Craft gear...')
    .addOptions(
      listCraftables().map((craft) => ({
        label: craft.id,
        description: craft.description,
        value: craft.id,
        emoji: '🛠️',
      }))
    );

  const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(packOptions);
  const craftRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(craftMenu);
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('shop:refresh').setLabel('Refresh Rotation').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop:category:skins').setLabel('Seasonals').setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [actionRow, craftRow, buttons] };
}

export async function handleEnhancedShopInteraction(customId: string, user_id: string, values?: string[]) {
=======

interface ShopPack {
  id: string;
  name: string;
  category: 'normal' | 'era' | 'featured';
  cost: { coins?: number; gems?: number };
  stock?: number;
  emoji: string;
  dropTable: string;
}

const SHOP_PACKS: ShopPack[] = [
  { id: 'genesis_small', name: 'Small', category: 'normal', cost: { coins: 10000 }, emoji: '📦', dropTable: 'packs_genesis.json' },
  { id: 'genesis_medium', name: 'Medium', category: 'normal', cost: { coins: 20000 }, emoji: '📫', dropTable: 'packs_genesis.json' },
  { id: 'genesis_large', name: 'Large', category: 'normal', cost: { coins: 40000 }, emoji: '🎁', stock: 5, dropTable: 'packs_genesis.json' },
  { id: 'classic_era', name: 'Classic Era', category: 'era', cost: { gems: 100 }, emoji: '♦️', dropTable: 'packs_genesis.json' },
  { id: 'gremlin_era', name: 'Gremlin Era', category: 'era', cost: { gems: 120 }, emoji: '📢', dropTable: 'packs_genesis.json' },
  { id: 'frost_signal', name: 'Frost Signal', category: 'featured', cost: { coins: 25000 }, emoji: '❄️', dropTable: 'packs_genesis.json' }
];

interface RotationRecord {
  rotation_id: string;
  packs: string[];
  items: { id: string; cost: number; emoji: string }[];
  active_from: number;
  active_to: number;
}

function startOfWeek(now: Date) {
  const copy = new Date(now);
  const day = copy.getUTCDay();
  const diff = (day + 6) % 7; // Monday start
  copy.setUTCDate(copy.getUTCDate() - diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function ensureWeeklyRotation(force = false): RotationRecord {
  const now = Date.now();
  const row = db
    .prepare('SELECT * FROM shop_rotations WHERE active_from <= ? AND active_to >= ? ORDER BY active_from DESC LIMIT 1')
    .get(now, now) as { rotation_id: string; packs_json: string; items_json: string; active_from: number; active_to: number } | undefined;
  if (row && !force) {
    return {
      rotation_id: row.rotation_id,
      packs: JSON.parse(row.packs_json || '[]'),
      items: JSON.parse(row.items_json || '[]'),
      active_from: row.active_from,
      active_to: row.active_to,
    };
  }
  const base = startOfWeek(new Date());
  const active_from = base.getTime();
  const active_to = active_from + 7 * 24 * 60 * 60 * 1000;
  const rotation_id = `rot_${nanoid(6)}`;
  const featured = SHOP_PACKS.filter((p) => p.category !== 'normal').map((p) => p.id);
  const packs = featured.sort(() => Math.random() - 0.5).slice(0, 3);
  const items = [
    { id: 'cosmetic_spark_trail', cost: 180, emoji: '✨' },
    { id: 'gift_frostsigil', cost: 220, emoji: '❄️' }
  ];
  db.prepare(
    'INSERT INTO shop_rotations (rotation_id, active_from, active_to, packs_json, items_json) VALUES (?,?,?,?,?)'
  ).run(rotation_id, active_from, active_to, JSON.stringify(packs), JSON.stringify(items));
  return { rotation_id, packs, items, active_from, active_to };
}

function rotationLabel(rot: RotationRecord) {
  return `Rotation ${rot.rotation_id} • Ends <t:${Math.floor(rot.active_to / 1000)}:R>`;
}

function packById(id: string) {
  return SHOP_PACKS.find((p) => p.id === id);
}

function pityProgress(user_id: string, pack: ShopPack) {
  const row = db
    .prepare('SELECT opened, last_rarity FROM pity WHERE user_id=? AND pack_id=?')
    .get(user_id, pack.id) as { opened?: number; last_rarity?: string } | undefined;
  if (!row) return 'Fresh pity track';
  return `Opened ${row.opened} • Last ${row.last_rarity ?? 'none'}`;
}

function purchasePack(user_id: string, pack: ShopPack) {
  if (pack.stock !== undefined && pack.stock <= 0) {
    throw new Error('Out of stock');
  }
  const prof = db
    .prepare('SELECT coins, gems FROM profiles WHERE user_id=?')
    .get(user_id) as { coins?: number; gems?: number } | undefined;
  const coins = prof?.coins ?? 0;
  const gems = prof?.gems ?? 0;
  if (pack.cost.coins && coins < pack.cost.coins) throw new Error(`Need ${pack.cost.coins} coins`);
  if (pack.cost.gems && gems < pack.cost.gems) throw new Error(`Need ${pack.cost.gems} gems`);
  if (pack.cost.coins) {
    db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(pack.cost.coins, user_id);
  }
  if (pack.cost.gems) {
    db.prepare('UPDATE profiles SET gems=gems-? WHERE user_id=?').run(pack.cost.gems, user_id);
  }
  if (pack.cost.coins || pack.cost.gems) {
    db.prepare('INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)')
      .run(
        `txn_${nanoid(8)}`,
        user_id,
        'shop_purchase',
        pack.cost.coins ?? pack.cost.gems ?? 0,
        'pack_purchase',
        JSON.stringify({ pack_id: pack.id }),
        Date.now()
      );
  }
  const { rarity, drop, duplicate } = openPack(user_id, pack.dropTable, {
    skipCost: true,
    spendAmountOverride: pack.cost.coins ?? pack.cost.gems ?? 0,
    packIdOverride: pack.id,
  });
  if (pack.stock !== undefined) {
    db.prepare('UPDATE shop_rotations SET items_json=items_json WHERE rotation_id=?').run('noop'); // noop to ensure row exists
    pack.stock -= 1;
  }
  const pity = pityProgress(user_id, pack);
  const duplicateNote = duplicate ? ' (duplicate converted to fragments)' : '';
  return `🎁 ${pack.name} → **[${rarity.toUpperCase()}] ${drop.id}**${duplicateNote}\n${pity}`;
}

export async function renderEnhancedShop(user_id: string) {
  const profile =
    (db.prepare('SELECT coins, gems, fragments FROM profiles WHERE user_id=?').get(user_id) as
      | { coins: number; gems: number; fragments: number }
      | undefined) ?? { coins: 0, gems: 0, fragments: 0 };
  const rotation = ensureWeeklyRotation();
  const embed = new EmbedBuilder()
    .setTitle('🛒 Black Market')
    .setColor(0x2b2d31)
    .setDescription(
      `**Gold:** 🪙 ${profile.coins.toLocaleString()}\n**Gems:** 💎 ${profile.gems.toLocaleString()}\n**Fragments:** ✨ ${profile.fragments}\n${rotationLabel(
        rotation
      )}`
    );

  const normal = SHOP_PACKS.filter((p) => p.category === 'normal')
    .map((p) => `${p.emoji} **${p.name}** — ${p.cost.coins?.toLocaleString() ?? p.cost.gems} ${p.cost.coins ? '🪙' : '💎'}`)
    .join('\n');
  embed.addFields({ name: 'Normal Backpacks', value: normal || 'None', inline: false });

  const featured = rotation.packs
    .map((id) => packById(id))
    .filter(Boolean)
    .map((pack) => `${pack!.emoji} **${pack!.name}** — ${pityProgress(user_id, pack!)}`)
    .join('\n');
  embed.addFields({ name: 'Weekly Featured Packs', value: featured || 'Rotation warming up…', inline: false });

  const limitedItems = rotation.items
    .map((item) => `${item.emoji} ${item.id} — ${item.cost} fragments`)
    .join('\n');
  embed.addFields({ name: 'Limited Stock', value: limitedItems || 'Check back soon!', inline: false });

  const craftables = listCraftables()
    .map((craft) => `${craft.id} — ${craft.costFragments} fragments`)
    .join('\n');
  embed.addFields({ name: 'Crafting', value: craftables || 'No recipes yet.', inline: false });

  const packOptions = new StringSelectMenuBuilder()
    .setCustomId('shop:select')
    .setPlaceholder('Open a pack...')
    .addOptions(
      rotation.packs
        .map((id) => packById(id))
        .filter(Boolean)
        .map((pack) => ({
          label: pack!.name,
          description: `Open ${pack!.name}`,
          value: pack!.id,
          emoji: pack!.emoji,
        }))
    );

  const craftMenu = new StringSelectMenuBuilder()
    .setCustomId('shop:craft')
    .setPlaceholder('Craft gear...')
    .addOptions(
      listCraftables().map((craft) => ({
        label: craft.id,
        description: craft.description,
        value: craft.id,
        emoji: '🛠️',
      }))
    );

  const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(packOptions);
  const craftRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(craftMenu);
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('shop:refresh').setLabel('Refresh Rotation').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop:category:skins').setLabel('Seasonals').setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [actionRow, craftRow, buttons] };
}

export async function handleEnhancedShopInteraction(customId: string, user_id: string, values?: string[]) {

interface ShopPack {
  id: string;
  name: string;
  category: 'normal' | 'era' | 'featured';
  cost: { coins?: number; gems?: number };
  stock?: number;
  emoji: string;
  dropTable: string;
}

const SHOP_PACKS: ShopPack[] = [
  { id: 'genesis_small', name: 'Small', category: 'normal', cost: { coins: 10000 }, emoji: '📦', dropTable: 'packs_genesis.json' },
  { id: 'genesis_medium', name: 'Medium', category: 'normal', cost: { coins: 20000 }, emoji: '📫', dropTable: 'packs_genesis.json' },
  { id: 'genesis_large', name: 'Large', category: 'normal', cost: { coins: 40000 }, emoji: '🎁', stock: 5, dropTable: 'packs_genesis.json' },
  { id: 'classic_era', name: 'Classic Era', category: 'era', cost: { gems: 100 }, emoji: '♦️', dropTable: 'packs_genesis.json' },
  { id: 'gremlin_era', name: 'Gremlin Era', category: 'era', cost: { gems: 120 }, emoji: '📢', dropTable: 'packs_genesis.json' },
  { id: 'frost_signal', name: 'Frost Signal', category: 'featured', cost: { coins: 25000 }, emoji: '❄️', dropTable: 'packs_genesis.json' }
];

interface RotationRecord {
  rotation_id: string;
  packs: string[];
  items: { id: string; cost: number; emoji: string }[];
  active_from: number;
  active_to: number;
}

function startOfWeek(now: Date) {
  const copy = new Date(now);
  const day = copy.getUTCDay();
  const diff = (day + 6) % 7; // Monday start
  copy.setUTCDate(copy.getUTCDate() - diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function ensureWeeklyRotation(force = false): RotationRecord {
  const now = Date.now();
  const row = db
    .prepare('SELECT * FROM shop_rotations WHERE active_from <= ? AND active_to >= ? ORDER BY active_from DESC LIMIT 1')
    .get(now, now) as { rotation_id: string; packs_json: string; items_json: string; active_from: number; active_to: number } | undefined;
  if (row && !force) {
    return {
      rotation_id: row.rotation_id,
      packs: JSON.parse(row.packs_json || '[]'),
      items: JSON.parse(row.items_json || '[]'),
      active_from: row.active_from,
      active_to: row.active_to,
    };
  }
  const base = startOfWeek(new Date());
  const active_from = base.getTime();
  const active_to = active_from + 7 * 24 * 60 * 60 * 1000;
  const rotation_id = `rot_${nanoid(6)}`;
  const featured = SHOP_PACKS.filter((p) => p.category !== 'normal').map((p) => p.id);
  const packs = featured.sort(() => Math.random() - 0.5).slice(0, 3);
  const items = [
    { id: 'cosmetic_spark_trail', cost: 180, emoji: '✨' },
    { id: 'gift_frostsigil', cost: 220, emoji: '❄️' }
  ];
  db.prepare(
    'INSERT INTO shop_rotations (rotation_id, active_from, active_to, packs_json, items_json) VALUES (?,?,?,?,?)'
  ).run(rotation_id, active_from, active_to, JSON.stringify(packs), JSON.stringify(items));
  return { rotation_id, packs, items, active_from, active_to };
}

function rotationLabel(rot: RotationRecord) {
  return `Rotation ${rot.rotation_id} • Ends <t:${Math.floor(rot.active_to / 1000)}:R>`;
}

function packById(id: string) {
  return SHOP_PACKS.find((p) => p.id === id);
}

function pityProgress(user_id: string, pack: ShopPack) {
  const row = db
    .prepare('SELECT opened, last_rarity FROM pity WHERE user_id=? AND pack_id=?')
    .get(user_id, pack.id) as { opened?: number; last_rarity?: string } | undefined;
  if (!row) return 'Fresh pity track';
  return `Opened ${row.opened} • Last ${row.last_rarity ?? 'none'}`;
}

function purchasePack(user_id: string, pack: ShopPack) {
  if (pack.stock !== undefined && pack.stock <= 0) {
    throw new Error('Out of stock');
  }
  const prof = db
    .prepare('SELECT coins, gems FROM profiles WHERE user_id=?')
    .get(user_id) as { coins?: number; gems?: number } | undefined;
  const coins = prof?.coins ?? 0;
  const gems = prof?.gems ?? 0;
  if (pack.cost.coins && coins < pack.cost.coins) throw new Error(`Need ${pack.cost.coins} coins`);
  if (pack.cost.gems && gems < pack.cost.gems) throw new Error(`Need ${pack.cost.gems} gems`);
  if (pack.cost.coins) {
    db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(pack.cost.coins, user_id);
  }
  if (pack.cost.gems) {
    db.prepare('UPDATE profiles SET gems=gems-? WHERE user_id=?').run(pack.cost.gems, user_id);
  }
  if (pack.cost.coins || pack.cost.gems) {
    db.prepare('INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)')
      .run(
        `txn_${nanoid(8)}`,
        user_id,
        'shop_purchase',
        pack.cost.coins ?? pack.cost.gems ?? 0,
        'pack_purchase',
        JSON.stringify({ pack_id: pack.id }),
        Date.now()
      );
  }
  const { rarity, drop, duplicate } = openPack(user_id, pack.dropTable, {
    skipCost: true,
    spendAmountOverride: pack.cost.coins ?? pack.cost.gems ?? 0,
    packIdOverride: pack.id,
  });
  if (pack.stock !== undefined) {
    db.prepare('UPDATE shop_rotations SET items_json=items_json WHERE rotation_id=?').run('noop'); // noop to ensure row exists
    pack.stock -= 1;
  }
  const pity = pityProgress(user_id, pack);
  const duplicateNote = duplicate ? ' (duplicate converted to fragments)' : '';
  return `🎁 ${pack.name} → **[${rarity.toUpperCase()}] ${drop.id}**${duplicateNote}\n${pity}`;
}

export async function renderEnhancedShop(user_id: string) {
  const profile =
    (db.prepare('SELECT coins, gems, fragments FROM profiles WHERE user_id=?').get(user_id) as
      | { coins: number; gems: number; fragments: number }
      | undefined) ?? { coins: 0, gems: 0, fragments: 0 };
  const rotation = ensureWeeklyRotation();
  const embed = new EmbedBuilder()
    .setTitle('🛒 Black Market')
    .setColor(0x2b2d31)
    .setDescription(
      `**Gold:** 🪙 ${profile.coins.toLocaleString()}\n**Gems:** 💎 ${profile.gems.toLocaleString()}\n**Fragments:** ✨ ${profile.fragments}\n${rotationLabel(
        rotation
      )}`
    );

  const normal = SHOP_PACKS.filter((p) => p.category === 'normal')
    .map((p) => `${p.emoji} **${p.name}** — ${p.cost.coins?.toLocaleString() ?? p.cost.gems} ${p.cost.coins ? '🪙' : '💎'}`)
    .join('\n');
  embed.addFields({ name: 'Normal Backpacks', value: normal || 'None', inline: false });

  const featured = rotation.packs
    .map((id) => packById(id))
    .filter(Boolean)
    .map((pack) => `${pack!.emoji} **${pack!.name}** — ${pityProgress(user_id, pack!)}`)
    .join('\n');
  embed.addFields({ name: 'Weekly Featured Packs', value: featured || 'Rotation warming up…', inline: false });

  const limitedItems = rotation.items
    .map((item) => `${item.emoji} ${item.id} — ${item.cost} fragments`)
    .join('\n');
  embed.addFields({ name: 'Limited Stock', value: limitedItems || 'Check back soon!', inline: false });

  const craftables = listCraftables()
    .map((craft) => `${craft.id} — ${craft.costFragments} fragments`)
    .join('\n');
  embed.addFields({ name: 'Crafting', value: craftables || 'No recipes yet.', inline: false });

  const packOptions = new StringSelectMenuBuilder()
    .setCustomId('shop:select')
    .setPlaceholder('Open a pack...')
    .addOptions(
      rotation.packs
        .map((id) => packById(id))
        .filter(Boolean)
        .map((pack) => ({
          label: pack!.name,
          description: `Open ${pack!.name}`,
          value: pack!.id,
          emoji: pack!.emoji,
        }))
    );

  const craftMenu = new StringSelectMenuBuilder()
    .setCustomId('shop:craft')
    .setPlaceholder('Craft gear...')
    .addOptions(
      listCraftables().map((craft) => ({
        label: craft.id,
        description: craft.description,
        value: craft.id,
        emoji: '🛠️',
      }))
    );

  const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(packOptions);
  const craftRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(craftMenu);
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('shop:refresh').setLabel('Refresh Rotation').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop:category:skins').setLabel('Seasonals').setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [actionRow, craftRow, buttons] };
}

export async function handleEnhancedShopInteraction(customId: string, user_id: string, values?: string[]) {
  category: 'normal' | 'era';
  cost: { coins?: number; gems?: number };
  stock?: number;
  emoji: string;
}

const SHOP_PACKS: ShopPack[] = [
  { id: 'small', name: 'Small', category: 'normal', cost: { coins: 10_000 }, emoji: '📦' },
  { id: 'medium', name: 'Medium', category: 'normal', cost: { coins: 20_000 }, emoji: '📫' },
  { id: 'big', name: 'Big', category: 'normal', cost: { coins: 40_000 }, stock: 0, emoji: '🎁' },
  { id: 'classic', name: 'Classic', category: 'era', cost: { gems: 100 }, emoji: '♦️' },
  { id: 'pirate', name: 'Pirate', category: 'era', cost: { gems: 100 }, emoji: '🏴‍☠️' },
  { id: 'modern', name: 'Modern', category: 'era', cost: { gems: 100 }, emoji: '🏙️' },
  { id: 'medieval', name: 'Medieval', category: 'era', cost: { gems: 100 }, emoji: '🏰' },
  { id: 'samurai', name: 'Samurai', category: 'era', cost: { gems: 100 }, emoji: '⚔️' },
  { id: 'steampunk', name: 'Steampunk', category: 'era', cost: { gems: 100 }, emoji: '⚙️' },
  { id: 'magical', name: 'Magical', category: 'era', cost: { gems: 100 }, emoji: '🔮' },
  { id: 'futuristic', name: 'Futuristic', category: 'era', cost: { gems: 100 }, emoji: '🚀' },
  { id: 'zombie', name: 'Zombie', category: 'era', cost: { gems: 100 }, emoji: '🧟' },
  { id: 'egyptian', name: 'Egyptian', category: 'era', cost: { gems: 100 }, emoji: '🏺' },
  { id: 'jurassic', name: 'Jurassic', category: 'era', cost: { gems: 100 }, emoji: '🦕' },
];

export async function renderEnhancedShop(user_id: string) {
  const prof =
    (db.prepare('SELECT coins, gems FROM profiles WHERE user_id=?').get(user_id) as
      | { coins: number; gems: number }
      | undefined) ?? { coins: 0, gems: 0 };

  const inventory = db
    .prepare('SELECT item_id, qty FROM inventories WHERE user_id=? AND kind LIKE "%pack%"')
    .all(user_id) as { item_id: string; qty: number }[];
  const packCounts: Record<string, number> = Object.fromEntries(
    inventory.map((item) => [item.item_id, item.qty])
  );

  const embed = new EmbedBuilder()
    .setTitle('🛒 Black Market')
    .setDescription(
      `**Gold:** 🪙 ${prof.coins.toLocaleString()}\n**Gems:** 💎 ${prof.gems}\n\nThe shop resets on ${getNextResetTime()}`
    )
    .setColor(0x2b2d31);

  let normalSection = '**Normal Backpacks**\n';
  for (const pack of SHOP_PACKS.filter((p) => p.category === 'normal')) {
    const count = packCounts[pack.id] ?? 0;
    const isAvailable = pack.stock === undefined || pack.stock > 0;
    const costStr = pack.cost.coins
      ? `${pack.cost.coins.toLocaleString()} 🪙`
      : `${pack.cost.gems?.toLocaleString() ?? 0} 💎`;
    const stockStr = isAvailable ? '' : ' ❌';
    normalSection += `${count} ${pack.emoji} **${pack.name}**${stockStr}\nCost: ${costStr}\n\n`;
  }

  let eraSection = '**Era Backpacks**\nCost: 100 💎 each\n\n';
  for (const pack of SHOP_PACKS.filter((p) => p.category === 'era')) {
    const count = packCounts[pack.id] ?? 0;
    eraSection += `${count} ${pack.emoji} **${pack.name}**\n`;
  }

  embed.addFields(
    { name: '\u200b', value: normalSection, inline: false },
    { name: '\u200b', value: eraSection, inline: false }
  );

  const availablePacks = SHOP_PACKS.filter((pack) => pack.stock === undefined || pack.stock > 0);
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('shop:select')
    .setPlaceholder('Purchase an item!')
    .addOptions(
      availablePacks.map((pack) => ({
        label: `${pack.name} Backpack`,
        description: `Purchase a ${pack.name} backpack`,
        value: pack.id,
        emoji: pack.emoji,
      }))
    );

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('shop:category:backpacks').setLabel('Backpacks').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('shop:category:skins').setLabel('Skins').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop:refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

export async function handleEnhancedShopInteraction(
  customId: string,
  user_id: string,
  values?: string[]
) {
  const parts = customId.split(':');

  if (parts[0] !== 'shop') return 'Unknown shop action.';

  if (parts[1] === 'select' && values?.[0]) {
    const pack = packById(values[0]);
    if (!pack) return '❌ Pack not found.';
    try {
      const message = purchasePack(user_id, pack);
      return message;
    } catch (err: any) {
      return `❌ ${err.message ?? 'Unable to open pack.'}`;
    }
  }

  if (parts[1] === 'craft' && values?.[0]) {
    const result = craftItem(user_id, values[0]);
    return result.message;
  }

  if (parts[1] === 'category' && parts[2] === 'skins') {
    const rotation = ensureWeeklyRotation();
    return `🎨 Seasonal stock: ${rotation.items.map((i) => `${i.emoji} ${i.id}`).join(', ')}`;
  }

  if (parts[1] === 'refresh') {
    const rotation = ensureWeeklyRotation(true);
    return `🔄 Rotation refreshed. New packs: ${rotation.packs.join(', ')}`;
    try {
      const message = purchasePack(user_id, pack);
      return message;
    } catch (err: any) {
      return `❌ ${err.message ?? 'Unable to open pack.'}`;
    }
  }

  if (parts[1] === 'craft' && values?.[0]) {
    const result = craftItem(user_id, values[0]);
    return result.message;
  }

  if (parts[1] === 'category' && parts[2] === 'skins') {
    const rotation = ensureWeeklyRotation();
    return `🎨 Seasonal stock: ${rotation.items.map((i) => `${i.emoji} ${i.id}`).join(', ')}`;
  }

  if (parts[1] === 'refresh') {
    const rotation = ensureWeeklyRotation(true);
    return `🔄 Rotation refreshed. New packs: ${rotation.packs.join(', ')}`;
    }
  }

  if (parts[1] === 'craft' && values?.[0]) {
    const result = craftItem(user_id, values[0]);
    return result.message;
  }

  if (parts[1] === 'category' && parts[2] === 'skins') {
    const rotation = ensureWeeklyRotation();
    return `🎨 Seasonal stock: ${rotation.items.map((i) => `${i.emoji} ${i.id}`).join(', ')}`;
  }

  if (parts[1] === 'refresh') {
    const rotation = ensureWeeklyRotation(true);
    return `🔄 Rotation refreshed. New packs: ${rotation.packs.join(', ')}`;
    const packId = values[0];
    const pack = SHOP_PACKS.find((p) => p.id === packId);
    if (!pack) return '❌ Pack not found.';

    try {
      if (pack.stock !== undefined && pack.stock <= 0) {
        return '❌ This pack is out of stock.';
      }

      const prof = db
        .prepare('SELECT coins, gems FROM profiles WHERE user_id=?')
        .get(user_id) as { coins?: number; gems?: number } | undefined;
      const coins = prof?.coins ?? 0;
      const gems = prof?.gems ?? 0;

      if (pack.cost.coins && coins < pack.cost.coins) {
        return `❌ Not enough gold. Need ${pack.cost.coins.toLocaleString()} 🪙`;
      }
      if (pack.cost.gems && gems < pack.cost.gems) {
        return `❌ Not enough gems. Need ${pack.cost.gems} 💎`;
      }

      if (pack.cost.coins) {
        db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(pack.cost.coins, user_id);
      }
      if (pack.cost.gems) {
        db.prepare('UPDATE profiles SET gems=gems-? WHERE user_id=?').run(pack.cost.gems, user_id);
        db.prepare(
          'INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)'
        ).run(
          `txn_${nanoid(8)}`,
          user_id,
          'pack_open',
          pack.cost.gems,
          'gems_spent',
          JSON.stringify({ pack_id: pack.id }),
          Date.now()
        );
      }

      const { rarity, drop } = openPackByType(user_id, pack);

      return `🎁 You opened a ${pack.name} Pack and received **[${rarity.toUpperCase()}] ${drop.id}**`;
    } catch (e: any) {
      return `❌ ${e.message || 'Could not open pack.'}`;
    }
  }

  if (parts[1] === 'category') {
    return 'Category switching coming soon!';
  }

  if (parts[1] === 'refresh') {
    return 'Shop refreshed!';
  }

  return 'Unknown shop action.';
}

export async function showShop(i: ButtonInteraction) {
  await i.deferReply({ ephemeral: true });
  const view = await renderEnhancedShop(i.user.id);
  await i.editReply(view);
}

export function claimWeeklyReward(user_id: string): { success: boolean; amount?: number; streak?: number } {
  const lastClaim = db
    .prepare('SELECT last_weekly_claim, weekly_streak FROM profiles WHERE user_id=?')
    .get(user_id) as { last_weekly_claim?: number; weekly_streak?: number } | undefined;
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  if (lastClaim?.last_weekly_claim && now - lastClaim.last_weekly_claim < weekMs) {
    return { success: false };
  }

  const newStreak = (lastClaim?.weekly_streak ?? 0) + 1;
  const baseReward = 10000;
  const streakBonus = Math.min(newStreak * 1000, 10000);
  const totalReward = baseReward + streakBonus;

  db.prepare('UPDATE profiles SET coins=coins+?, last_weekly_claim=?, weekly_streak=? WHERE user_id=?').run(
    totalReward,
    now,
    newStreak,
    user_id
  );

  return { success: true, amount: totalReward, streak: newStreak };
}

}

export function claimWeeklyReward(user_id: string): { success: boolean; amount?: number; streak?: number } {
  const lastClaim = db
    .prepare('SELECT last_weekly_claim, weekly_streak FROM profiles WHERE user_id=?')
    .get(user_id) as { last_weekly_claim?: number; weekly_streak?: number } | undefined;
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  if (lastClaim?.last_weekly_claim && now - lastClaim.last_weekly_claim < weekMs) {
    return { success: false };
  }

  const newStreak = (lastClaim?.weekly_streak ?? 0) + 1;
  const baseReward = 10000;
  const streakBonus = Math.min(newStreak * 1000, 10000);
  const totalReward = baseReward + streakBonus;

  db.prepare('UPDATE profiles SET coins=coins+?, last_weekly_claim=?, weekly_streak=? WHERE user_id=?').run(
    totalReward,
    now,
    newStreak,
    user_id
  );

  return { success: true, amount: totalReward, streak: newStreak };
}

}

export function claimWeeklyReward(user_id: string): { success: boolean; amount?: number; streak?: number } {
  const lastClaim = db
    .prepare('SELECT last_weekly_claim, weekly_streak FROM profiles WHERE user_id=?')
    .get(user_id) as { last_weekly_claim?: number; weekly_streak?: number } | undefined;
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  if (lastClaim?.last_weekly_claim && now - lastClaim.last_weekly_claim < weekMs) {
    return { success: false };
  }

  const newStreak = (lastClaim?.weekly_streak ?? 0) + 1;
  const baseReward = 10000;
  const streakBonus = Math.min(newStreak * 1000, 10000);
  const totalReward = baseReward + streakBonus;

  db.prepare('UPDATE profiles SET coins=coins+?, last_weekly_claim=?, weekly_streak=? WHERE user_id=?').run(
    totalReward,
    now,
    newStreak,
    user_id
  );

  return { success: true, amount: totalReward, streak: newStreak };
}

function openPackByType(user_id: string, pack: ShopPack) {
  const spendOverride = pack.cost.coins ?? 0;
  return openPack(user_id, 'Genesis', { skipCost: true, spendAmountOverride: spendOverride });
}

function getNextResetTime(): string {
  const now = new Date();
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7));
  nextSunday.setHours(17, 0, 0, 0);

  return nextSunday.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function claimWeeklyReward(user_id: string): { success: boolean; amount?: number; streak?: number } {
  const lastClaim = db
    .prepare('SELECT last_weekly_claim, weekly_streak FROM profiles WHERE user_id=?')
    .get(user_id) as { last_weekly_claim?: number; weekly_streak?: number } | undefined;
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  if (lastClaim?.last_weekly_claim && now - lastClaim.last_weekly_claim < weekMs) {
    return { success: false };
  }

  const newStreak = (lastClaim?.weekly_streak ?? 0) + 1;
  const baseReward = 10_000;
  const streakBonus = Math.min(newStreak * 1_000, 10_000);
  const totalReward = baseReward + streakBonus;

  db.prepare('UPDATE profiles SET coins=coins+?, last_weekly_claim=?, weekly_streak=? WHERE user_id=?').run(
    totalReward,
    now,
    newStreak,
    user_id
  );

  return { success: true, amount: totalReward, streak: newStreak };
}

export async function showShop(i: ButtonInteraction) {
  await i.deferReply({ ephemeral: true });
  const view = await renderEnhancedShop(i.user.id);
  await i.editReply(view);
}

export { renderEnhancedShop as renderShop, handleEnhancedShopInteraction as handleShopInteraction };
