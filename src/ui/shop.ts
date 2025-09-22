import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ButtonInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { nanoid } from 'nanoid';
import db from '../persistence/db.js';
import { openPack } from './backpacks.js';

interface ShopPack {
  id: string;
  name: string;
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
