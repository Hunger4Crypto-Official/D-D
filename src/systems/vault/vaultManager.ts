import { nanoid } from 'nanoid';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import db from '../../persistence/db.js';
import { Effect } from '../../models.js';

export type RoomType =
  | 'workshop'
  | 'shrine'
  | 'trophy_hall'
  | 'gremlin_den'
  | 'treasury'
  | 'meditation_chamber';

export type DecorationSlot = 'floor' | 'wall' | 'ceiling' | 'furniture' | 'lighting' | 'special';

interface RoomEffect {
  type: 'passive' | 'active' | 'ambient';
  effect: Effect;
  cooldown?: number;
  lastActivated?: number;
}

interface Decoration {
  id: string;
  name: string;
  slot: DecorationSlot;
  rarity: string;
  effects?: RoomEffect[];
  requirements?: { level?: number; achievements?: string[] };
}

export interface VaultRoom {
  roomId: string;
  userId: string;
  type: RoomType;
  level: number;
  capacity: number;
  decorations: Decoration[];
  activeEffects: RoomEffect[];
  visitors: { userId: string; timestamp: number }[];
  lastUpdated: number;
}

interface RoomDefinition {
  name: string;
  description: string;
  baseCapacity: number;
  maxLevel: number;
  baseEffects: RoomEffect[];
  upgrades: RoomUpgrade[];
}

interface RoomUpgrade {
  fromLevel: number;
  toLevel: number;
  cost: { coins?: number; fragments?: number; materials?: Record<string, number> };
  benefits: string[];
  requirements?: { achievements?: string[]; minLevel?: number };
}

const ROOM_DEFINITIONS: Record<RoomType, RoomDefinition> = {
  workshop: {
    name: 'Forge Workshop',
    description: 'Craft and enhance gear with better odds and lower costs.',
    baseCapacity: 5,
    maxLevel: 10,
    baseEffects: [{ type: 'passive', effect: { type: 'buff', id: 'crafting_discount', value: 10 } }],
    upgrades: [
      {
        fromLevel: 1,
        toLevel: 2,
        cost: { coins: 10_000, fragments: 50 },
        benefits: ['Crafting discount increased to 15%', '+2 decoration slots'],
      },
      {
        fromLevel: 2,
        toLevel: 3,
        cost: { coins: 25_000, fragments: 100, materials: { ancient_ore: 5 } },
        benefits: ['Crafting discount increased to 20%', 'Unlock rare recipes'],
      },
    ],
  },
  shrine: {
    name: 'Harmony Shrine',
    description: 'Meditate to restore HP and Focus and receive daily blessings.',
    baseCapacity: 3,
    maxLevel: 8,
    baseEffects: [
      { type: 'active', effect: { type: 'hp', op: '+', value: 5 }, cooldown: 60 * 60 * 1000 },
      { type: 'active', effect: { type: 'focus', op: '+', value: 2 }, cooldown: 60 * 60 * 1000 },
    ],
    upgrades: [
      {
        fromLevel: 1,
        toLevel: 2,
        cost: { coins: 8_000, fragments: 40 },
        benefits: ['Healing increased to 8 HP', 'Focus restore increased to 3'],
      },
    ],
  },
  trophy_hall: {
    name: 'Trophy Hall',
    description: 'Display your achievements and gain passive XP bonuses.',
    baseCapacity: 10,
    maxLevel: 5,
    baseEffects: [{ type: 'passive', effect: { type: 'xp', value: 5 } }],
    upgrades: [
      {
        fromLevel: 1,
        toLevel: 2,
        cost: { coins: 15_000 },
        benefits: ['XP bonus increased to 10%', '+5 trophy slots'],
      },
    ],
  },
  gremlin_den: {
    name: 'Gremlin Den',
    description: 'House mischievous gremlins to generate resources and chaos.',
    baseCapacity: 8,
    maxLevel: 7,
    baseEffects: [{ type: 'passive', effect: { type: 'coins', value: 100 } }],
    upgrades: [
      {
        fromLevel: 1,
        toLevel: 2,
        cost: { coins: 12_000, materials: { gremlin_treats: 20 } },
        benefits: ['Daily coins increased to 200', 'Gremlins occasionally find fragments'],
      },
    ],
  },
  treasury: {
    name: 'Treasury Vault',
    description: 'Secure storage that generates interest on your wealth.',
    baseCapacity: 1,
    maxLevel: 10,
    baseEffects: [{ type: 'passive', effect: { type: 'buff', id: 'coin_interest', value: 1 } }],
    upgrades: [
      {
        fromLevel: 1,
        toLevel: 2,
        cost: { coins: 50_000 },
        benefits: ['Interest rate increased to 1.5%', 'Unlock gem storage'],
      },
    ],
  },
  meditation_chamber: {
    name: 'Meditation Chamber',
    description: 'Deep focus training that enhances regeneration.',
    baseCapacity: 4,
    maxLevel: 6,
    baseEffects: [{ type: 'passive', effect: { type: 'buff', id: 'focus_regen', value: 1 } }],
    upgrades: [
      {
        fromLevel: 1,
        toLevel: 2,
        cost: { coins: 10_000, fragments: 60 },
        benefits: ['Focus regeneration doubled', 'Unlock meditation techniques'],
      },
    ],
  },
};

const DECORATIONS: Decoration[] = [
  {
    id: 'golden_chandelier',
    name: 'Golden Chandelier',
    slot: 'ceiling',
    rarity: 'rare',
    effects: [{ type: 'ambient', effect: { type: 'buff', id: 'vault_prestige', value: 5 } }],
  },
  {
    id: 'ledger_tapestry',
    name: 'Ancient Ledger Tapestry',
    slot: 'wall',
    rarity: 'epic',
    effects: [{ type: 'passive', effect: { type: 'xp', value: 10 } }],
    requirements: { level: 5 },
  },
  {
    id: 'gremlin_fountain',
    name: 'Gremlin Fountain',
    slot: 'furniture',
    rarity: 'uncommon',
    effects: [{ type: 'ambient', effect: { type: 'buff', id: 'gremlin_attraction', value: 2 } }],
  },
  {
    id: 'crystal_focus',
    name: 'Crystal Focus Array',
    slot: 'special',
    rarity: 'legendary',
    effects: [{ type: 'passive', effect: { type: 'focus', op: '+', value: 5 } }],
    requirements: { level: 10, achievements: ['focus_master'] },
  },
  {
    id: 'merchants_rug',
    name: "Merchant's Lucky Rug",
    slot: 'floor',
    rarity: 'rare',
    effects: [{ type: 'passive', effect: { type: 'buff', id: 'shop_discount', value: 5 } }],
  },
  {
    id: 'ethereal_lanterns',
    name: 'Ethereal Lanterns',
    slot: 'lighting',
    rarity: 'epic',
    effects: [{ type: 'ambient', effect: { type: 'buff', id: 'night_vision', value: 1 } }],
  },
];

export class VaultManager {
  private readonly vaultCache = new Map<string, VaultRoom[]>();

  constructor() {
    this.loadVaults();
  }

  private loadVaults() {
    const rows = db.prepare(`SELECT * FROM vault_rooms WHERE active=1`).all() as any[];
    for (const row of rows) {
      const room: VaultRoom = {
        roomId: row.room_id,
        userId: row.user_id,
        type: row.room_type,
        level: row.level,
        capacity: row.capacity,
        decorations: JSON.parse(row.decorations_json || '[]'),
        activeEffects: JSON.parse(row.effects_json || '[]'),
        visitors: JSON.parse(row.visitors_json || '[]'),
        lastUpdated: row.last_updated,
      };

      const rooms = this.vaultCache.get(room.userId) || [];
      rooms.push(room);
      this.vaultCache.set(room.userId, rooms);
    }
  }

  async handleButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('vault:')) {
      return false;
    }

    const [, action, arg] = interaction.customId.split(':');

    if (action === 'create') {
      const rooms = this.ensureVault(interaction.user.id);
      await interaction.reply({
        ephemeral: true,
        content: rooms.length
          ? '🏰 Your vault is ready! Use the menu to manage your rooms.'
          : 'Vault already exists.',
      });
      return true;
    }

    if (action === 'leaderboard') {
      const top = this.getTopVaults();
      const lines = top.map(
        (entry: any, idx: number) =>
          `**${idx + 1}.** <@${entry.user_id}> — ${entry.total_levels} total room levels`
      );
      await interaction.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setTitle('🏆 Top Vaults')
            .setColor(0x9b59b6)
            .setDescription(lines.join('\n') || 'No vaults yet.'),
        ],
      });
      return true;
    }

    if (action === 'upgrade' && arg) {
      const result = this.upgradeRoom(interaction.user.id, arg);
      await interaction.reply({ ephemeral: true, content: result.message });
      return true;
    }

    if (action === 'visit' && arg) {
      const host = arg;
      const result = this.visitVault(interaction.user.id, host);
      await interaction.reply({ ephemeral: true, content: result.message });
      return true;
    }

    return false;
  }

  async handleSelectMenu(interaction: StringSelectMenuInteraction) {
    if (interaction.customId !== 'vault:room:select') {
      return false;
    }

    const [roomId] = interaction.values;
    const detail = this.renderRoomDetail(interaction.user.id, roomId);
    await interaction.reply({ ephemeral: true, ...detail });
    return true;
  }

  ensureVault(userId: string) {
    const existing = this.vaultCache.get(userId) || [];
    if (existing.length) {
      return existing;
    }

    const starterRooms: VaultRoom[] = [
      this.buildRoom(userId, 'trophy_hall'),
      this.buildRoom(userId, 'workshop'),
    ];

    for (const room of starterRooms) {
      db.prepare(
        `INSERT INTO vault_rooms (
           room_id, user_id, room_type, level, capacity, decorations_json, effects_json, visitors_json, active, created_at, last_updated
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        room.roomId,
        room.userId,
        room.type,
        room.level,
        room.capacity,
        JSON.stringify(room.decorations),
        JSON.stringify(room.activeEffects),
        JSON.stringify(room.visitors),
        1,
        Date.now(),
        room.lastUpdated
      );
    }

    this.vaultCache.set(userId, starterRooms);
    return starterRooms;
  }

  renderVaultInterface(userId: string) {
    const vault = this.ensureVault(userId);

    const embed = new EmbedBuilder()
      .setTitle('🏰 Personal Vault')
      .setDescription('Manage rooms, upgrade layouts, and showcase your achievements.')
      .setColor(0x9b59b6);

    for (const room of vault) {
      const def = ROOM_DEFINITIONS[room.type];
      const decorationList = room.decorations.map((d) => d.name).join(', ') || 'None';
      embed.addFields({
        name: `${def.name} (Lv.${room.level})`,
        value: `${def.description}\n**Decorations:** ${decorationList}\n**Capacity:** ${room.decorations.length}/${room.capacity}`,
        inline: false,
      });
    }

    const bonuses = this.calculatePassiveBonuses(vault);
    if (Object.keys(bonuses).length) {
      embed.addFields({
        name: '✨ Active Bonuses',
        value: Object.entries(bonuses)
          .map(([label, value]) => `• ${label}: ${value}`)
          .join('\n'),
        inline: false,
      });
    }

    const roomSelect = new StringSelectMenuBuilder()
      .setCustomId('vault:room:select')
      .setPlaceholder('Select a room to manage...')
      .addOptions(
        vault.map((room) => ({
          label: ROOM_DEFINITIONS[room.type].name,
          description: `Level ${room.level} — ${room.decorations.length}/${room.capacity} decorations`,
          value: room.roomId,
        }))
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('vault:create')
        .setLabel('Create Vault')
        .setEmoji('🏗️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('vault:leaderboard')
        .setLabel('Vault Leaderboard')
        .setEmoji('🏆')
        .setStyle(ButtonStyle.Secondary)
    );

    return {
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(roomSelect), buttons],
    };
  }

  private renderRoomDetail(userId: string, roomId: string) {
    const vault = this.ensureVault(userId);
    const room = vault.find((r) => r.roomId === roomId);
    if (!room) {
      return {
        embeds: [new EmbedBuilder().setTitle('Room not found').setDescription('Unable to locate this room.')],
      };
    }

    const def = ROOM_DEFINITIONS[room.type];
    const embed = new EmbedBuilder()
      .setTitle(`${def.name} — Level ${room.level}`)
      .setDescription(def.description)
      .setColor(0x8e44ad)
      .addFields(
        {
          name: 'Decorations',
          value: room.decorations.length ? room.decorations.map((d) => d.name).join('\n') : 'None',
          inline: false,
        },
        {
          name: 'Capacity',
          value: `${room.decorations.length}/${room.capacity}`,
          inline: true,
        }
      );

    const upgrade = def.upgrades.find((u) => u.fromLevel === room.level);
    if (upgrade) {
      embed.addFields({
        name: `Next Upgrade — Level ${upgrade.toLevel}`,
        value: [
          `Cost: ${this.describeCost(upgrade.cost)}`,
          `Benefits: ${upgrade.benefits.join(', ')}`,
        ].join('\n'),
        inline: false,
      });
    } else {
      embed.addFields({ name: 'Upgrades', value: 'Room is at maximum level.', inline: false });
    }

    if (upgrade) {
      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`vault:upgrade:${room.roomId}`)
          .setLabel('Upgrade Room')
          .setStyle(ButtonStyle.Success)
      );
      return { embeds: [embed], components: [buttons] };
    }

    return { embeds: [embed], components: [] };
  }

  private buildRoom(userId: string, type: RoomType): VaultRoom {
    const definition = ROOM_DEFINITIONS[type];
    return {
      roomId: `vault_${nanoid(8)}`,
      userId,
      type,
      level: 1,
      capacity: definition.baseCapacity,
      decorations: [],
      activeEffects: definition.baseEffects,
      visitors: [],
      lastUpdated: Date.now(),
    };
  }

  private upgradeRoom(userId: string, roomId: string) {
    const vault = this.ensureVault(userId);
    const room = vault.find((r) => r.roomId === roomId);
    if (!room) {
      return { success: false, message: 'Room not found.' };
    }

    const definition = ROOM_DEFINITIONS[room.type];
    if (room.level >= definition.maxLevel) {
      return { success: false, message: 'Room already at maximum level.' };
    }

    const upgrade = definition.upgrades.find((u) => u.fromLevel === room.level);
    if (!upgrade) {
      return { success: false, message: 'No upgrade available.' };
    }

    const profile = db
      .prepare(`SELECT level FROM profiles WHERE user_id=?`)
      .get(userId) as { level: number } | undefined;

    if (upgrade.requirements?.minLevel && (profile?.level ?? 0) < upgrade.requirements.minLevel) {
      return { success: false, message: `Requires level ${upgrade.requirements.minLevel}.` };
    }

    if (!this.payUpgradeCost(userId, upgrade.cost)) {
      return { success: false, message: 'Insufficient resources for upgrade.' };
    }

    room.level = upgrade.toLevel;
    room.capacity += 2;
    this.refreshRoomEffects(room);

    db.prepare(
      `UPDATE vault_rooms SET level=?, capacity=?, effects_json=?, last_updated=? WHERE room_id=?`
    ).run(room.level, room.capacity, JSON.stringify(room.activeEffects), Date.now(), room.roomId);

    return { success: true, message: `${definition.name} upgraded to level ${room.level}!` };
  }

  private payUpgradeCost(userId: string, cost: { coins?: number; fragments?: number; materials?: Record<string, number> }) {
    const profile = db
      .prepare(`SELECT coins, fragments FROM profiles WHERE user_id=?`)
      .get(userId) as { coins: number; fragments: number } | undefined;

    if (!profile) return false;

    if (cost.coins && profile.coins < cost.coins) return false;
    if (cost.fragments && profile.fragments < cost.fragments) return false;

    if (cost.materials) {
      for (const [item, qty] of Object.entries(cost.materials)) {
        const owned = db
          .prepare(`SELECT qty FROM inventories WHERE user_id=? AND item_id=?`)
          .get(userId, item) as { qty: number } | undefined;
        if (!owned || owned.qty < qty) {
          return false;
        }
      }
    }

    if (cost.coins) {
      db.prepare(`UPDATE profiles SET coins=coins-? WHERE user_id=?`).run(cost.coins, userId);
    }
    if (cost.fragments) {
      db.prepare(`UPDATE profiles SET fragments=fragments-? WHERE user_id=?`).run(cost.fragments, userId);
    }
    if (cost.materials) {
      for (const [item, qty] of Object.entries(cost.materials)) {
        db.prepare(`UPDATE inventories SET qty=qty-? WHERE user_id=? AND item_id=?`).run(qty, userId, item);
      }
    }

    return true;
  }

  private refreshRoomEffects(room: VaultRoom) {
    const base = JSON.parse(JSON.stringify(ROOM_DEFINITIONS[room.type].baseEffects)) as RoomEffect[];
    for (const effect of base) {
      if (typeof effect.effect.value === 'number') {
        effect.effect.value = Math.floor(effect.effect.value * (1 + (room.level - 1) * 0.2));
      }
    }

    const decorationEffects = room.decorations.flatMap((d) => d.effects || []);
    room.activeEffects = [...base, ...decorationEffects];
  }

  visitVault(visitorId: string, hostId: string) {
    if (visitorId === hostId) {
      return { success: false, message: 'Cannot visit your own vault.' };
    }

    const hostRooms = this.ensureVault(hostId);
    if (!hostRooms.length) {
      return { success: false, message: 'Host has no vault.' };
    }

    const recentVisit = db
      .prepare(
        `SELECT 1 FROM vault_visits WHERE visitor_id=? AND host_id=? AND visited_at > ?`
      )
      .get(visitorId, hostId, Date.now() - 24 * 60 * 60 * 1000);

    if (recentVisit) {
      return { success: false, message: 'You already visited this vault today.' };
    }

    const impressiveness = this.calculateVaultScore(hostRooms);
    const rewards = this.calculateVisitRewards(impressiveness);

    if (rewards.coins) {
      db.prepare(`UPDATE profiles SET coins=coins+? WHERE user_id=?`).run(rewards.coins, visitorId);
    }
    if (rewards.xp) {
      db.prepare(`UPDATE profiles SET xp=xp+? WHERE user_id=?`).run(rewards.xp, visitorId);
    }

    db.prepare(
      `INSERT INTO vault_visits (visitor_id, host_id, visited_at, rewards_json) VALUES (?,?,?,?)`
    ).run(visitorId, hostId, Date.now(), JSON.stringify(rewards));

    for (const room of hostRooms) {
      room.visitors.push({ userId: visitorId, timestamp: Date.now() });
      if (room.visitors.length > 100) {
        room.visitors = room.visitors.slice(-100);
      }
      db.prepare(`UPDATE vault_rooms SET visitors_json=? WHERE room_id=?`).run(
        JSON.stringify(room.visitors),
        room.roomId
      );
    }

    const hostBonus = Math.floor(impressiveness * 10);
    db.prepare(`UPDATE profiles SET coins=coins+? WHERE user_id=?`).run(hostBonus, hostId);

    return {
      success: true,
      message: `Visited vault! Earned ${rewards.coins} Coins and ${rewards.xp} XP.`,
      rewards,
    };
  }

  private describeCost(cost: { coins?: number; fragments?: number; materials?: Record<string, number> }) {
    const parts: string[] = [];
    if (cost.coins) parts.push(`${cost.coins} Coins`);
    if (cost.fragments) parts.push(`${cost.fragments} Fragments`);
    if (cost.materials) {
      for (const [item, qty] of Object.entries(cost.materials)) {
        parts.push(`${qty}× ${item}`);
      }
    }
    return parts.join(', ');
  }

  private calculatePassiveBonuses(rooms: VaultRoom[]) {
    const bonuses: Record<string, string> = {};
    for (const room of rooms) {
      for (const effect of room.activeEffects) {
        if (effect.type !== 'passive') continue;
        const key = effect.effect.id || effect.effect.type;
        const value = effect.effect.value;
        if (!key || value == null) continue;

        const numeric = Number(value);
        if (!Number.isFinite(numeric)) continue;

        if (bonuses[key]) {
          const current = parseFloat(bonuses[key]) || 0;
          bonuses[key] = `${current + numeric}`;
        } else {
          bonuses[key] = numeric >= 0 && numeric <= 100 ? `+${numeric}%` : `${numeric}`;
        }
      }
    }
    return bonuses;
  }

  private calculateVaultScore(rooms: VaultRoom[]) {
    let score = 0;
    const rarityScores: Record<string, number> = {
      common: 2,
      uncommon: 5,
      rare: 10,
      epic: 20,
      legendary: 35,
      mythic: 50,
    };

    for (const room of rooms) {
      score += room.level * 5;
      for (const decoration of room.decorations) {
        score += rarityScores[decoration.rarity] || 1;
      }
      const recentVisitors = room.visitors.filter(
        (v) => Date.now() - v.timestamp < 7 * 24 * 60 * 60 * 1000
      );
      score += Math.min(recentVisitors.length * 2, 20);
    }

    return Math.min(score, 100);
  }

  private calculateVisitRewards(impressiveness: number) {
    const baseCoins = 50;
    const baseXp = 10;
    return {
      coins: Math.floor(baseCoins * (1 + impressiveness / 100)),
      xp: Math.floor(baseXp * (1 + impressiveness / 200)),
    };
  }

  getTopVaults(limit = 10) {
    return db
      .prepare(
        `SELECT 
           vr.user_id,
           COUNT(vr.room_id) AS room_count,
           SUM(vr.level) AS total_levels,
           COUNT(json_each.value) AS decoration_count
         FROM vault_rooms vr
         LEFT JOIN json_each(vr.decorations_json)
         WHERE vr.active=1
         GROUP BY vr.user_id
         ORDER BY total_levels DESC, decoration_count DESC
         LIMIT ?`
      )
      .all(limit);
  }
}

export const vaultManager = new VaultManager();
