import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ButtonInteraction } from 'discord.js';
import db from '../persistence/db.js';
import { openPack } from './backpacks.js';

export async function renderShop(user_id:string){
  const prof = db.prepare('SELECT coins,gems FROM profiles WHERE user_id=?').get(user_id) || {coins:0,gems:0};
  const embed = new EmbedBuilder()
    .setTitle('🛒 Shop')
    .setDescription(`Coins: **${prof.coins}**\nGems: **${prof.gems}**\n\nPacks:\n• Genesis Pack — 350 Coins`)
    .setColor(0x00ccaa);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('shop:open:genesis').setLabel('Buy Genesis Pack (350)').setStyle(ButtonStyle.Primary)
  );
  return { embeds:[embed], components:[row] };
}

export function handleShopInteraction(customId:string, user_id:string){
  const parts = customId.split(':');
  if (parts[0] !== 'shop') return 'Unknown shop action.';
  if (parts[1] === 'open' && parts[2] === 'genesis'){
    try {
      const { rarity, drop } = openPack(user_id, 'Genesis');
      return `🎁 You opened a Genesis Pack and received **[${rarity.toUpperCase()}] ${drop.id}**`;
    } catch (e:any) {
      return `❌ ${e.message || 'Could not open pack.'}`;
    }
  }
  return 'Unknown shop action.';
}

export async function showShop(i: ButtonInteraction){
  await i.deferReply({ ephemeral:true });
  const v = await renderShop(i.user.id);
  await i.editReply(v);
}
