import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
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
  emoji: string;
  dropTable: string;
}

const SHOP_PACKS: ShopPack[] = [
  { id: 'genesis_small', name: 'Small Genesis Pack', category: 'normal', cost: { coins: 10_000 }, emoji: '📦', dropTable: 'packs_genesis.json' },
  { id: 'genesis_medium', name: 'Medium Genesis Pack', category: 'normal', cost: { coins: 20_000 }, emoji: '📫', dropTable: 'packs_genesis.json' },
  { id: 'genesis_large', name: 'Large Genesis Pack', category: 'normal', cost: { coins: 40_000 }, emoji: '🎁', dropTable: 'packs_genesis.json' },
  { id: 'classic_era', name: 'Classic Era Pack', category: 'era', cost: { gems: 100 }, emoji: '♦️', dropTable: 'packs_genesis.json' },
  { id: 'pirate_era', name: 'Pirate Era Pack', category: 'era', cost: { gems: 100 }, emoji: '🏴\u200d☠️', dropTable: 'packs_genesis.json' },
  { id: 'featured_frost', name: 'Frost Signal Pack', category: 'featured', cost: { coins: 25_000 }, emoji: '❄️', dropTable: 'packs_genesis.json' },
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
  const diff = (day + 6) % 7; // Monday
  copy.setUTCDate(copy.getUTCDate() - diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function ensureWeeklyRotation(force = false): RotationRecord {
  const now = Date.now();
  const row = db
    .prepare('SELECT rotation_id, active_from, active_to, packs_json, items_json FROM shop_rotations WHERE active_from <= ? AND active_to >= ? ORDER BY active_from DESC LIMIT 1')
    .get(now, now) as
    | { rotation_id: string; active_from: number; active_to: number; packs_json: string; items_json: string }
    | undefined;

  if (row && !force) {
    return {
      rotation_id: row.rotation_id,
      packs: JSON.parse(row.packs_json || '[]'),
      items: JSON.parse(row.items_json || '[]'),
      active_from: row.active_from,
      active_to: row.active_to,
    };
  }

  const start = startOfWeek(new Date());
  const active_from = start.getTime();
  const active_to = active_from + 7 * 24 * 60 * 60 * 1000;
  const rotation_id = `rot_${nanoid(6)}`;

  const pool = SHOP_PACKS.filter((p) => p.category !== 'normal').map((pack) => pack.id);
  const packs = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  const items = [
    { id: 'gift_frostsigil', cost: 200, emoji: '❄️' },
    { id: 'trinket_ledger_amulet', cost: 150, emoji: '🪙' },
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
  return SHOP_PACKS.find((pack) => pack.id === id);
}

function pityProgress(user_id: string, pack: ShopPack) {
  const row = db
    .prepare('SELECT opened, last_rarity FROM pity WHERE user_id=? AND pack_id=?')
    .get(user_id, pack.id) as { opened?: number; last_rarity?: string } | undefined;

  if (!row) return 'No packs opened yet.';
  return `Opened ${row.opened} • Last ${row.last_rarity ?? 'unknown'}`;
}

function purchasePack(user_id: string, pack: ShopPack) {
  const profile =
    (db.prepare('SELECT coins, gems FROM profiles WHERE user_id=?').get(user_id) as
      | { coins?: number; gems?: number }
      | undefined) ?? { coins: 0, gems: 0 };

  const coins = profile.coins ?? 0;
  const gems = profile.gems ?? 0;

  if (pack.cost.coins && coins < pack.cost.coins) throw new Error(`Need ${pack.cost.coins.toLocaleString()} coins.`);
  if (pack.cost.gems && gems < pack.cost.gems) throw new Error(`Need ${pack.cost.gems} gems.`);

  if (pack.cost.coins) {
    db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(pack.cost.coins, user_id);
    db.prepare(
      'INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)'
    ).run(
      `txn_${nanoid(8)}`,
      user_id,
      'shop_purchase',
      pack.cost.coins,
      'coins_spent',
      JSON.stringify({ pack_id: pack.id }),
      Date.now()
    );
  }

  if (pack.cost.gems) {
    db.prepare('UPDATE profiles SET gems=gems-? WHERE user_id=?').run(pack.cost.gems, user_id);
    db.prepare(
      'INSERT INTO economy_ledger (txn_id,user_id,kind,amount,reason,meta_json,ts) VALUES (?,?,?,?,?,?,?)'
    ).run(
      `txn_${nanoid(8)}`,
      user_id,
      'shop_purchase',
      pack.cost.gems,
      'gems_spent',
      JSON.stringify({ pack_id: pack.id }),
      Date.now()
    );
  }

  const result = openPack(user_id, pack.dropTable, {
    skipCost: true,
    spendAmountOverride: pack.cost.coins ?? pack.cost.gems ?? 0,
    packIdOverride: pack.id,
  });

  const pity = pityProgress(user_id, pack);
  const duplicateSuffix = result.duplicate ? ' (duplicate converted to fragments)' : '';
  return `🎁 ${pack.name} → **[${result.rarity.toUpperCase()}] ${result.drop.id}**${duplicateSuffix}\n${pity}`;
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
      `**Gold:** 🪙 ${profile.coins.toLocaleString()}\n**Gems:** 💎 ${profile.gems.toLocaleString()}\n**Fragments:** ✨ ${profile.fragments}\n${rotationLabel(rotation)}`
    );

  const normal = SHOP_PACKS.filter((p) => p.category === 'normal')
    .map((pack) => `${pack.emoji} **${pack.name}** — ${pack.cost.coins?.toLocaleString() ?? pack.cost.gems} ${pack.cost.coins ? '🪙' : '💎'}`)
    .join('\n');
  embed.addFields({ name: 'Normal Backpacks', value: normal || 'None', inline: false });

  const featured = rotation.packs
    .map((id) => packById(id))
    .filter((pack): pack is ShopPack => Boolean(pack))
    .map((pack) => `${pack.emoji} **${pack.name}** — ${pityProgress(user_id, pack)}`)
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
        .filter((pack): pack is ShopPack => Boolean(pack))
        .map((pack) => ({
          label: pack.name,
          description: `Open ${pack.name}`,
          value: pack.id,
          emoji: pack.emoji,
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
  const parts = customId.split(':');
  if (parts[0] !== 'shop') return 'Unknown shop action.';

  const action = parts[1];
  if (action === 'select' && values?.[0]) {
    const pack = packById(values[0]);
    if (!pack) return '❌ Pack not found.';
    try {
      return purchasePack(user_id, pack);
    } catch (err: any) {
      return `❌ ${err.message ?? 'Unable to open pack.'}`;
    }
  }

  if (action === 'craft' && values?.[0]) {
    const result = craftItem(user_id, values[0]);
    return result.message;
  }

  if (action === 'category' && parts[2] === 'skins') {
    const rotation = ensureWeeklyRotation();
    return `🎨 Seasonal stock: ${rotation.items.map((item) => `${item.emoji} ${item.id}`).join(', ') || 'Empty'}`;
  }

  if (action === 'refresh') {
    const rotation = ensureWeeklyRotation(true);
    const names = rotation.packs
      .map((id) => packById(id)?.name ?? id)
      .join(', ');
    return `🔄 Rotation refreshed. New packs: ${names || 'None'}`;
  }

  return 'Unknown shop action.';
}

export async function showShop(i: ButtonInteraction) {
  await i.deferReply({ ephemeral: true });
  const view = await renderEnhancedShop(i.user.id);
  await i.editReply(view);
}

function getNextResetTime(): string {
  const rotation = ensureWeeklyRotation();
  const date = new Date(rotation.active_to);
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
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

export { getNextResetTime };
