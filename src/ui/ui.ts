import { ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from 'discord.js';
import { sceneState, handleAction } from '../engine/orchestrator.js';
import db from '../persistence/db.js';
import { showShop, handleShopInteraction } from './shop.js';

export async function renderScene(run_id:string){
  const run = db.prepare('SELECT * FROM runs WHERE run_id=?').get(run_id);
  const scene = sceneState(run);
  const round = scene.rounds.find(r => r.round_id === run.round_id)!;

  const embed = new EmbedBuilder()
    .setTitle(`📖 ${scene.title}`)
    .setDescription(`${scene.narration}\n\n**${round.description}**`)
    .setColor(0x5b8cff);

  const rows: any[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  for (const a of round.actions){
    if ((row as any).components.length >= 5){
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
    row.addComponents(new ButtonBuilder().setCustomId(`act:${run_id}:${a.id}`).setLabel(a.label).setStyle(ButtonStyle.Secondary));
  }
  rows.push(row);
  return { embeds:[embed], components: rows };
}

export async function onButton(i: ButtonInteraction){
  const [prefix, run_id, rest] = i.customId.split(':');
  if (prefix === 'act'){
    await i.deferReply({ ephemeral:true });
    const res = handleAction(run_id, i.user.id, rest);
    await i.editReply(`🎲 You chose **${rest}** → ${res.summary}`);
    const payload = await renderScene(run_id);
    await i.message.edit(payload);
    return;
  }
  if (prefix === 'shop'){
    await i.deferReply({ ephemeral:true });
    const msg = handleShopInteraction(i.customId, i.user.id);
    await i.editReply(msg);
    return;
  }
}

export { showShop } from './shop.js';
