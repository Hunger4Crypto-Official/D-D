import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { EquipmentBonus } from '../models.js';
import db from '../persistence/db.js';
import { contentRegistry, ItemDefinition } from '../content/contentRegistry.js';

export type EquipmentSlot = 'weapon' | 'armor' | 'helm' | 'trinket' | 'deck';

const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'helm', 'trinket', 'deck'];

interface EquipmentDefinition {
  id: string;
  slot: EquipmentSlot;
  name: string;
  rarity: string;
  emoji: string;
  description: string;
  setKey?: string;
  bonuses: EquipmentBonus;
}

const EQUIPMENT_REGISTRY: Record<string, EquipmentDefinition> = {
  wp_liquidity_spear: {
    id: 'wp_liquidity_spear',
    slot: 'weapon',
    name: 'Liquidity Spear',
    rarity: 'epic',
    emoji: '⚔️',
    description: 'A spear that flows through gaps in consensus. Grants advantage on rush and momentum tags.',
    setKey: 'liquidity',
    bonuses: {
      dcOffset: -1,
      advantageTags: ['rush', 'momentum', 'gremlin'],
      sleightBonus: 1,
    },
  },
  gear_ledger_plate: {
    id: 'gear_ledger_plate',
    slot: 'armor',
    name: 'Ledger Plate',
    rarity: 'uncommon',
    emoji: '🛡️',
    description: 'Heavy plating that remembers every promise. Flat HP protection and mitigates critical failures.',
    setKey: 'audit',
    bonuses: {
      hpBonus: 5,
      neutralizeCritFail: true,
    },
  },
  trinket_hardware_wallet: {
    id: 'trinket_hardware_wallet',
    slot: 'trinket',
    name: 'Hardware Wallet',
    rarity: 'uncommon',
    emoji: '💾',
    description: 'Cold storage that laughs at rugs. Protects coins and adds fragments when duplicates drop.',
    setKey: 'audit',
    bonuses: {
      preventsCoinLoss: true,
      fragmentsBoost: 2,
    },
  },
  trinket_ledger_amulet: {
    id: 'trinket_ledger_amulet',
    slot: 'trinket',
    name: 'Ledger Amulet',
    rarity: 'rare',
    emoji: '📿',
    description: 'A faint hum tracks collective focus. Adds focus each scene and eases ritual tags.',
    setKey: 'harmony',
    bonuses: {
      focusBonus: 2,
      dcShift: -1,
      advantageTags: ['ritual', 'insight'],
    },
  },
  helm_oracle_hood: {
    id: 'helm_oracle_hood',
    slot: 'helm',
    name: 'Oracle Hood',
    rarity: 'rare',
    emoji: '🪬',
    description: 'Threads of foresight align probabilities. Lowers DC for insight and puzzle actions.',
    setKey: 'harmony',
    bonuses: {
      dcOffset: -2,
      advantageTags: ['insight', 'puzzle'],
    },
  },
  helm_forked_crown: {
    id: 'helm_forked_crown',
    slot: 'helm',
    name: 'Forked Crown',
    rarity: 'epic',
    emoji: '👑',
    description: 'Splits perception, doubling possible paths. Grants a reroll on fails each scene.',
    setKey: 'liquidity',
    bonuses: {
      rerollFail: true,
    },
  },
};

const EQUIPMENT_SETS: Record<
  string,
  { label: string; threshold: number; description: string; bonus: EquipmentBonus }
> = {
  audit: {
    label: 'Audit Set',
    threshold: 2,
    description: 'Integrity sharpened—small DC reduction on integrity tags.',
    bonus: {
      dcOffset: -1,
      advantageTags: ['integrity'],
    },
  },
  liquidity: {
    label: 'Flow State Set',
    threshold: 2,
    description: 'Momentum builds, granting sleight bonuses on crit successes.',
    bonus: {
      sleightBonus: 1,
    },
  },
  harmony: {
    label: 'Harmony Set',
    threshold: 2,
    description: 'Attunement to the Vault adds focus recovery on successes.',
    bonus: {
      focusBonus: 1,
    },
  },
};

const dynamicEquipmentIds = new Set<string>();

function isEquipmentSlot(slot?: string): slot is EquipmentSlot {
  return Boolean(slot && (EQUIPMENT_SLOTS as string[]).includes(slot));
}

function mapItemToEquipment(item: ItemDefinition): EquipmentDefinition | null {
  if (!isEquipmentSlot(item.slot) || !item.bonuses) {
    return null;
  }

  return {
    id: item.id,
    slot: item.slot,
    name: item.name,
    rarity: item.rarity,
    emoji: item.emoji,
    description: item.description,
    setKey: item.setKey,
    bonuses: item.bonuses as EquipmentBonus,
  };
}

function hydrateEquipmentRegistry() {
  for (const id of dynamicEquipmentIds) {
    delete EQUIPMENT_REGISTRY[id];
  }
  dynamicEquipmentIds.clear();

  const items = contentRegistry.getAllItems();
  for (const item of items) {
    const mapped = mapItemToEquipment(item);
    if (mapped) {
      EQUIPMENT_REGISTRY[mapped.id] = mapped;
      dynamicEquipmentIds.add(mapped.id);
    }
  }
}

hydrateEquipmentRegistry();
contentRegistry.onReload(hydrateEquipmentRegistry);

export interface EquippedItem {
  slot: EquipmentSlot;
  definition: EquipmentDefinition;
  durability: number;
  max_durability: number;
}

export function equippedLoadout(user_id: string): EquippedItem[] {
  const rows = db
    .prepare(
      'SELECT slot, item_id, durability, max_durability FROM equipment_loadouts WHERE user_id=?'
    )
    .all(user_id) as { slot: EquipmentSlot; item_id: string; durability: number; max_durability: number }[];
  return rows
    .map((row) => {
      const def = EQUIPMENT_REGISTRY[row.item_id];
      if (!def) return undefined;
      return { slot: row.slot, definition: def, durability: row.durability, max_durability: row.max_durability };
    })
    .filter((v): v is EquippedItem => Boolean(v));
}

export function equipmentBonuses(user_id: string): EquipmentBonus[] {
  const equipped = equippedLoadout(user_id);
  const bonuses: EquipmentBonus[] = [];
  const setCounts: Record<string, number> = {};
  for (const item of equipped) {
    bonuses.push(item.definition.bonuses);
    if (item.definition.setKey) {
      setCounts[item.definition.setKey] = (setCounts[item.definition.setKey] ?? 0) + 1;
    }
  }
  for (const [setKey, count] of Object.entries(setCounts)) {
    const set = EQUIPMENT_SETS[setKey];
    if (set && count >= set.threshold) {
      bonuses.push(set.bonus);
    }
  }
  return bonuses;
}

interface AggregatedBonusTotals {
  dcShift: number;
  dcOffset: number;
  focusBonus: number;
  hpBonus: number;
  sleightBonus: number;
  rerollFail: boolean;
  neutralizeCritFail: boolean;
  fragmentsBoost: number;
  preventsCoinLoss: boolean;
  advantageTags: string[];
  disadvantageTags: string[];
}

export function aggregateBonus(user_id: string) {
  const bonuses = equipmentBonuses(user_id);
  return bonuses.reduce<AggregatedBonusTotals>((acc, bonus) => {
    if (bonus.dcShift) acc.dcShift += bonus.dcShift;
    if (bonus.dcOffset) acc.dcOffset += bonus.dcOffset;
    if (bonus.focusBonus) acc.focusBonus += bonus.focusBonus;
    if (bonus.hpBonus) acc.hpBonus += bonus.hpBonus;
    if (bonus.sleightBonus) acc.sleightBonus += bonus.sleightBonus;
    if (bonus.rerollFail) acc.rerollFail = true;
    if (bonus.neutralizeCritFail) acc.neutralizeCritFail = true;
    if (bonus.fragmentsBoost) acc.fragmentsBoost += bonus.fragmentsBoost;
    if (bonus.preventsCoinLoss) acc.preventsCoinLoss = true;
    const adv = bonus.advantageTags ?? [];
    const disadv = bonus.disadvantageTags ?? [];
    acc.advantageTags = [...new Set([...acc.advantageTags, ...adv])];
    acc.disadvantageTags = [...new Set([...acc.disadvantageTags, ...disadv])];
    return acc;
  }, {
    dcShift: 0,
    dcOffset: 0,
    focusBonus: 0,
    hpBonus: 0,
    sleightBonus: 0,
    rerollFail: false,
    neutralizeCritFail: false,
    fragmentsBoost: 0,
    preventsCoinLoss: false,
    advantageTags: [],
    disadvantageTags: [],
  });
}

export function ensureLoadoutDurability(user_id: string) {
  const equipped = equippedLoadout(user_id);
  for (const item of equipped) {
    if (item.durability <= 0) {
      db.prepare('DELETE FROM equipment_loadouts WHERE user_id=? AND slot=?').run(user_id, item.slot);
    }
  }
}

export function tickDurability(user_id: string, slots: EquipmentSlot[], amount = 1) {
  const stmt = db.prepare(
    'UPDATE equipment_loadouts SET durability = MAX(0, durability-?) WHERE user_id=? AND slot=?'
  );
  for (const slot of slots) {
    stmt.run(amount, user_id, slot);
  }
  ensureLoadoutDurability(user_id);
}

function inventoryItemsForSlot(user_id: string, slot: EquipmentSlot) {
  const defs = Object.values(EQUIPMENT_REGISTRY).filter((d) => d.slot === slot);
  if (defs.length === 0) return [];
  const stmt = db.prepare('SELECT qty FROM inventories WHERE user_id=? AND item_id=?');
  return defs
    .filter((def) => (stmt.get(user_id, def.id) as { qty?: number } | undefined)?.qty ?? 0 > 0)
    .map((def) => def);
}

export function equipItem(user_id: string, item_id: string) {
  const def = EQUIPMENT_REGISTRY[item_id];
  if (!def) throw new Error('Unknown equipment item');
  const owned = db
    .prepare('SELECT qty FROM inventories WHERE user_id=? AND item_id=?')
    .get(user_id, item_id) as { qty?: number } | undefined;
  if ((owned?.qty ?? 0) <= 0) throw new Error('You do not own that item.');

  db.prepare('INSERT OR REPLACE INTO equipment_loadouts (user_id, slot, item_id, durability, max_durability, set_key, equipped_at) VALUES (?,?,?,?,?,?,?)')
    .run(user_id, def.slot, def.id, 100, 100, def.setKey ?? null, Date.now());
  db.prepare('UPDATE profiles SET loadout_hash=? WHERE user_id=?').run(`${Date.now()}`, user_id);
}

export function unequipSlot(user_id: string, slot: EquipmentSlot) {
  db.prepare('DELETE FROM equipment_loadouts WHERE user_id=? AND slot=?').run(user_id, slot);
  db.prepare('UPDATE profiles SET loadout_hash=? WHERE user_id=?').run(`${Date.now()}`, user_id);
}

export async function renderEquipment(user_id: string) {
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Loadout')
    .setColor(0x8bd3ff)
    .setDescription('Equip weapons, armor, helms, trinkets, and decks to gain passive bonuses. Durability decreases with use.');

  const equipped = equippedLoadout(user_id);
  if (equipped.length === 0) {
    embed.addFields({ name: 'Current Equipment', value: 'Nothing equipped yet.', inline: false });
  } else {
    for (const slot of EQUIPMENT_SLOTS) {
      const eq = equipped.find((e) => e.slot === slot);
      if (!eq) {
        embed.addFields({ name: slot.toUpperCase(), value: '_empty_', inline: true });
        continue;
      }
      const pct = Math.round((eq.durability / eq.max_durability) * 100);
      embed.addFields({
        name: `${slot.toUpperCase()} — ${eq.definition.emoji} ${eq.definition.name}`,
        value: `${eq.definition.description}\nDurability: ${pct}%`,
        inline: true,
      });
    }
  }

  const rows: ActionRowBuilder<any>[] = [];
  const slotSelect = new StringSelectMenuBuilder()
    .setCustomId('equipment:slot')
    .setPlaceholder('Choose a slot to equip...')
    .addOptions(
      EQUIPMENT_SLOTS.map((slot) => ({
        label: slot.toUpperCase(),
        value: slot,
      }))
    );
  rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(slotSelect));

  const unequipRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('equipment:unequip:weapon').setLabel('Unequip Weapon').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('equipment:unequip:armor').setLabel('Unequip Armor').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('equipment:unequip:helm').setLabel('Unequip Helm').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('equipment:unequip:trinket').setLabel('Unequip Trinket').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('equipment:unequip:deck').setLabel('Unequip Deck').setStyle(ButtonStyle.Secondary)
  );
  rows.push(unequipRow);

  return { embeds: [embed], components: rows };
}

export async function handleEquipmentSelect(i: StringSelectMenuInteraction) {
  const slot = i.values[0] as EquipmentSlot;
  const options = inventoryItemsForSlot(i.user.id, slot);
  if (options.length === 0) {
    await i.update({ content: '❌ No equipment available for that slot.', components: [], embeds: [] });
    return;
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`equipment:equip:${slot}`)
    .setPlaceholder(`Equip ${slot.toUpperCase()} item...`)
    .addOptions(
      options.map((opt) => ({
        label: opt.name,
        description: opt.description.slice(0, 90),
        value: opt.id,
        emoji: opt.emoji,
      }))
    );
  await i.update({
    content: 'Select the item you want to equip.',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    embeds: [],
  });
}

export async function handleEquipmentEquip(i: StringSelectMenuInteraction) {
  const [, , slot] = i.customId.split(':');
  const itemId = i.values[0];
  try {
    equipItem(i.user.id, itemId);
    const view = await renderEquipment(i.user.id);
    await i.update({ content: `✅ Equipped ${EQUIPMENT_REGISTRY[itemId]?.name ?? itemId}.`, ...view });
  } catch (err: any) {
    await i.update({ content: `❌ ${err.message ?? 'Unable to equip item.'}` });
  }
}

export async function handleEquipmentButton(i: ButtonInteraction) {
  const [, action, slot] = i.customId.split(':');
  if (action === 'unequip' && slot) {
    unequipSlot(i.user.id, slot as EquipmentSlot);
    const view = await renderEquipment(i.user.id);
    await i.update({ content: `Slot ${slot.toUpperCase()} unequipped.`, ...view });
    return;
  }
  const view = await renderEquipment(i.user.id);
  await i.update(view);
}

export function hasCoinLossProtection(user_id: string) {
  return aggregateBonus(user_id).preventsCoinLoss;
}

export function fragmentsBoost(user_id: string) {
  return aggregateBonus(user_id).fragmentsBoost;
}

export function loadoutSleightBonus(user_id: string, outcomeKind: string) {
  const agg = aggregateBonus(user_id);
  if (agg.sleightBonus && (outcomeKind === 'crit_success' || outcomeKind === 'success')) {
    return agg.sleightBonus;
  }
  return 0;
}

export function shouldRerollFails(user_id: string) {
  return aggregateBonus(user_id).rerollFail;
}

export function neutralizesCritFail(user_id: string) {
  return aggregateBonus(user_id).neutralizeCritFail;
}

export function equipmentAdvantageState(user_id: string, tags: string[] = []) {
  const agg = aggregateBonus(user_id);
  const advantage = agg.advantageTags.some((tag) => tags.includes(tag));
  const disadvantage = agg.disadvantageTags.some((tag) => tags.includes(tag));
  return { advantage, disadvantage, dcShift: agg.dcShift, dcOffset: agg.dcOffset, focusBonus: agg.focusBonus, hpBonus: agg.hpBonus };
}

