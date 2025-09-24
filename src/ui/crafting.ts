import db from '../persistence/db.js';
import { contentRegistry } from '../content/contentRegistry.js';

interface CraftRecipe {
  costFragments: number;
  description: string;
  rarity: string;
}

const CRAFT_RECIPES: Record<string, CraftRecipe> = {
  wp_liquidity_spear: { costFragments: 120, description: 'Forge the iconic spear of flow.', rarity: 'epic' },
  gear_ledger_plate: { costFragments: 80, description: 'Assemble protective Ledger Plate armor.', rarity: 'uncommon' },
  helm_oracle_hood: { costFragments: 90, description: 'Weave an Oracle Hood for insight checks.', rarity: 'rare' },
  trinket_ledger_amulet: { costFragments: 70, description: 'Infuse a Ledger Amulet to boost focus.', rarity: 'rare' },
  gift_frostsigil: { costFragments: 50, description: 'Craft the seasonal Frost Sigil cosmetic.', rarity: 'rare' },
};

export function listCraftables() {
  return Object.entries(CRAFT_RECIPES).map(([id, recipe]) => {
    const item = contentRegistry.getItem(id);
    return {
      id,
      name: item?.name ?? id,
      emoji: item?.emoji ?? '🛠️',
      costFragments: recipe.costFragments,
      rarity: recipe.rarity ?? item?.rarity ?? 'common',
      description: recipe.description ?? item?.description ?? 'Craft an item from recovered schematics.',
    };
  });
}

export function craftItem(user_id: string, item_id: string) {
  const recipe = CRAFT_RECIPES[item_id];
  if (!recipe) {
    return { success: false, message: '❌ Unknown recipe.' };
  }
  const item = contentRegistry.getItem(item_id);
  const rarity = recipe.rarity ?? item?.rarity ?? 'common';
  const name = item?.name ?? item_id;
  const emoji = item?.emoji ?? '🛠️';
  const prof = db
    .prepare('SELECT fragments FROM profiles WHERE user_id=?')
    .get(user_id) as { fragments?: number } | undefined;
  if ((prof?.fragments ?? 0) < recipe.costFragments) {
    return { success: false, message: `❌ Need ${recipe.costFragments} fragments.` };
  }
  db.prepare('UPDATE profiles SET fragments=fragments-? WHERE user_id=?').run(recipe.costFragments, user_id);
  db.prepare(
    'INSERT INTO inventories (user_id,item_id,kind,rarity,qty,meta_json) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET qty=qty+1'
  ).run(user_id, item_id, 'crafted', rarity, 1, JSON.stringify({ crafted_at: Date.now() }));
  return { success: true, message: `${emoji} Crafted ${name} for ${recipe.costFragments} fragments!` };
}
